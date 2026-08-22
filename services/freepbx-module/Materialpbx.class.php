<?php
namespace FreePBXmodules;
require_once __DIR__ . '/NativeCompilerRegistry.php';

class Materialpbx extends \FreePBX_Helpers implements \BMO
{
    public function __construct($freepbx = null)
    {
        parent::__construct($freepbx);
    }

    public function install() { return true; }
    public function uninstall() { return true; }
    public function backup() { return ['materialpbx_resources']; }
    public function restore($backup) { return true; }
    public function doConfigPageInit($page) { return true; }

    public function get_config($engine)
    {
        if ($engine !== 'asterisk') return;
        global $ext;
        foreach ($this->Database->query('SELECT artifact FROM materialpbx_compiled')->fetchAll(\PDO::FETCH_COLUMN) as $json) {
            $artifact = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
            if (($artifact['compiler'] ?? null) !== 'ring-group-get-config-v1') continue;
            $channels = implode('&', array_map(static fn($member) => 'PJSIP/' . $member, $artifact['members']));
            $ext->add($artifact['context'], 's', '', new \ext_noop('MaterialPBX generated ring group'));
            $ext->add($artifact['context'], 's', '', new \ext_dial($channels . ',' . (int)$artifact['timeout']));
            $ext->add($artifact['context'], 's', '', new \ext_hangup());
        }
    }

    public function syncResource(string $kind, string $id, bool $deleted): array
    {
        self::assertIdentifier($kind, 64);
        self::assertIdentifier($id, 128);
        if ($deleted) {
            return $this->deleteCompiledResource($kind, $id);
        }

        $document = self::readResourceDocument('/var/lib/materialpbx/control-plane/resources.json');
        $resource = null;
        foreach ($document['resources'] as $candidate) {
            if (($candidate['kind'] ?? null) === $kind && ($candidate['id'] ?? null) === $id) {
                $resource = $candidate;
                break;
            }
        }
        if (!$resource) throw new \RuntimeException('The requested resource is not present in the desired-state store');
        $configuration = json_encode($resource['configuration'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (strlen($configuration) > 262144) throw new \RuntimeException('Resource configuration exceeds 256 KiB');

        $sql = <<<'SQL'
INSERT INTO materialpbx_resources
  (resource_kind, resource_id, revision, enabled, display_name, configuration, updated_at)
VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE revision = VALUES(revision), enabled = VALUES(enabled),
  display_name = VALUES(display_name), configuration = VALUES(configuration), updated_at = VALUES(updated_at)
SQL;
        $registry = new \FreePBXmodules\Materialpbx\NativeCompilerRegistry();
        $preview = $registry->preview($resource);
        $this->Database->beginTransaction();
        try {
        $statement = $this->Database->prepare($sql);
        $statement->execute([
            $kind, $id, (int) $resource['revision'], !empty($resource['enabled']) ? 1 : 0,
            mb_substr((string) $resource['displayName'], 0, 256), $configuration
        ]);
        if ($preview['status'] !== 'compiled') {
            $this->Database->commit();
            return ['storedDesired' => true, 'compilation' => ['status' => 'unsupported', 'compiler' => null, 'reason' => $preview['reason'], 'snapshotId' => null, 'diff' => $preview['diff']], 'applied' => false, 'rollback' => ['attempted' => false, 'succeeded' => null, 'snapshotId' => null, 'reason' => null]];
        }
        $snapshotId = self::uuid4();
        $prior = $this->Database->prepare('SELECT compiler, artifact FROM materialpbx_compiled WHERE resource_kind=? AND resource_id=? FOR UPDATE'); $prior->execute([$kind, $id]); $old = $prior->fetch(\PDO::FETCH_ASSOC) ?: [];
        $snapshot = $this->Database->prepare('INSERT INTO materialpbx_compiler_snapshots (snapshot_id, resource_kind, resource_id, prior_compiler, prior_artifact, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))'); $snapshot->execute([$snapshotId, $kind, $id, $old['compiler'] ?? null, $old['artifact'] ?? null]);
        $compiled = $this->Database->prepare('INSERT INTO materialpbx_compiled (resource_kind, resource_id, compiler, artifact, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE compiler=VALUES(compiler), artifact=VALUES(artifact), updated_at=VALUES(updated_at)'); $compiled->execute([$kind, $id, $preview['compiler'], json_encode($preview['artifact'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)]);
        $this->Database->commit();
        return ['storedDesired' => true, 'compilation' => ['status' => 'compiled', 'compiler' => $preview['compiler'], 'reason' => $preview['reason'], 'snapshotId' => $snapshotId, 'diff' => $preview['diff']], 'applied' => true, 'rollback' => ['attempted' => false, 'succeeded' => null, 'snapshotId' => $snapshotId, 'reason' => null]];
        } catch (\Throwable $error) { $this->Database->rollBack(); throw $error; }
    }

    private function deleteCompiledResource(string $kind, string $id): array
    {
        $this->Database->beginTransaction();
        try {
            $prior=$this->Database->prepare('SELECT compiler,artifact FROM materialpbx_compiled WHERE resource_kind=? AND resource_id=? FOR UPDATE'); $prior->execute([$kind,$id]); $old=$prior->fetch(\PDO::FETCH_ASSOC) ?: null;
            $desired=$this->Database->prepare('DELETE FROM materialpbx_resources WHERE resource_kind=? AND resource_id=?'); $desired->execute([$kind,$id]);
            if (!$old) {
                $this->Database->commit();
                return ['storedDesired'=>false,'compilation'=>['status'=>'unsupported','compiler'=>null,'reason'=>'No module-owned compiled artifact existed for this resource.','snapshotId'=>null,'diff'=>[['operation'=>'unchanged','target'=>$kind.':'.$id,'summary'=>'No generated output was removed.']]],'applied'=>false,'rollback'=>['attempted'=>false,'succeeded'=>null,'snapshotId'=>null,'reason'=>null]];
            }
            $snapshotId=self::uuid4();
            $snapshot=$this->Database->prepare('INSERT INTO materialpbx_compiler_snapshots (snapshot_id,resource_kind,resource_id,prior_compiler,prior_artifact,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(6))'); $snapshot->execute([$snapshotId,$kind,$id,$old['compiler'],$old['artifact']]);
            $remove=$this->Database->prepare('DELETE FROM materialpbx_compiled WHERE resource_kind=? AND resource_id=?'); $remove->execute([$kind,$id]);
            $this->Database->commit();
            return ['storedDesired'=>false,'compilation'=>['status'=>'compiled','compiler'=>$old['compiler'],'reason'=>'The module-owned compiled artifact was removed transactionally.','snapshotId'=>$snapshotId,'diff'=>[['operation'=>'remove','target'=>$kind.':'.$id,'summary'=>'Remove generated output after preserving its snapshot.']]],'applied'=>true,'rollback'=>['attempted'=>false,'succeeded'=>null,'snapshotId'=>$snapshotId,'reason'=>null]];
        } catch (\Throwable $error) { $this->Database->rollBack(); throw $error; }
    }

    public function rollbackCompilation(string $snapshotId): array
    {
        if (!preg_match('/^[0-9a-f-]{36}$/D', $snapshotId)) throw new \InvalidArgumentException('Invalid snapshot identifier');
        $this->Database->beginTransaction();
        try {
            $q=$this->Database->prepare('SELECT * FROM materialpbx_compiler_snapshots WHERE snapshot_id=? AND restored_at IS NULL FOR UPDATE'); $q->execute([$snapshotId]); $s=$q->fetch(\PDO::FETCH_ASSOC); if (!$s) throw new \RuntimeException('Snapshot is missing or already restored');
            if ($s['prior_artifact'] === null) { $d=$this->Database->prepare('DELETE FROM materialpbx_compiled WHERE resource_kind=? AND resource_id=?'); $d->execute([$s['resource_kind'],$s['resource_id']]); }
            else { $u=$this->Database->prepare('INSERT INTO materialpbx_compiled (resource_kind,resource_id,compiler,artifact,updated_at) VALUES (?,?,?,?,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE compiler=VALUES(compiler),artifact=VALUES(artifact),updated_at=VALUES(updated_at)'); $u->execute([$s['resource_kind'],$s['resource_id'],$s['prior_compiler'],$s['prior_artifact']]); }
            $m=$this->Database->prepare('UPDATE materialpbx_compiler_snapshots SET restored_at=UTC_TIMESTAMP(6) WHERE snapshot_id=?'); $m->execute([$snapshotId]); $this->Database->commit();
            return ['attempted'=>true,'succeeded'=>true,'snapshotId'=>$snapshotId,'reason'=>'Compiled output restored; reload and runtime verification remain pending.'];
        } catch (\Throwable $error) { $this->Database->rollBack(); throw $error; }
    }

    private static function uuid4(): string { $d=random_bytes(16); $d[6]=chr((ord($d[6])&15)|64); $d[8]=chr((ord($d[8])&63)|128); return vsprintf('%s%s-%s-%s-%s-%s%s%s',str_split(bin2hex($d),4)); }

    public function submitCallFile(string $id): array
    {
        self::assertIdentifier($id, 128);
        $document = self::readResourceDocument('/var/lib/materialpbx/control-plane/resources.json');
        $resource = null;
        foreach ($document['resources'] as $candidate) {
            if (($candidate['kind'] ?? null) === 'call-files' && ($candidate['id'] ?? null) === $id) $resource = $candidate;
        }
        if (!$resource || empty($resource['enabled'])) throw new \RuntimeException('Call file resource is missing or disabled');
        $configuration = $resource['configuration'] ?? [];
        $allowed = ['Channel', 'Callerid', 'MaxRetries', 'RetryTime', 'WaitTime', 'Context', 'Extension', 'Priority', 'Application', 'Data', 'Archive'];
        $required = ['Channel'];
        foreach ($required as $field) if (empty($configuration[$field])) throw new \RuntimeException("Missing call file field: {$field}");
        if (empty($configuration['Application']) && empty($configuration['Context'])) throw new \RuntimeException('Call file requires Application or Context');
        $lines = [];
        foreach ($allowed as $field) {
            if (!array_key_exists($field, $configuration)) continue;
            $value = (string) $configuration[$field];
            if (preg_match('/[\r\n\0]/', $value)) throw new \RuntimeException("Unsafe call file field: {$field}");
            $lines[] = "{$field}: {$value}";
        }
        $staging = '/var/spool/asterisk/materialpbx';
        $outgoing = '/var/spool/asterisk/outgoing';
        if (!is_dir($staging) && !mkdir($staging, 0750, true)) throw new \RuntimeException('Unable to create call-file staging directory');
        $temporary = $staging . '/' . bin2hex(random_bytes(16)) . '.call';
        if (file_put_contents($temporary, implode("\n", $lines) . "\n", LOCK_EX) === false) throw new \RuntimeException('Unable to write staged call file');
        chmod($temporary, 0640);
        $destination = $outgoing . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '_', $id) . '-' . gmdate('YmdHis') . '.call';
        if (!rename($temporary, $destination)) { @unlink($temporary); throw new \RuntimeException('Unable to atomically submit call file'); }
        return ['submitted' => true, 'id' => $id, 'destination' => basename($destination)];
    }

    private static function readResourceDocument(string $path): array
    {
        $bytes = file_get_contents($path);
        if ($bytes === false || strlen($bytes) > 16777216) throw new \RuntimeException('Desired-state store is missing or exceeds 16 MiB');
        $document = json_decode($bytes, true, 64, JSON_THROW_ON_ERROR);
        if (($document['version'] ?? null) !== 1 || !is_array($document['resources'] ?? null)) throw new \RuntimeException('Invalid desired-state store');
        return $document;
    }

    private static function assertIdentifier(string $value, int $max): void
    {
        if (strlen($value) < 1 || strlen($value) > $max || !preg_match('/^[A-Za-z0-9_.:@+\-]+$/D', $value)) {
            throw new \InvalidArgumentException('Invalid identifier');
        }
    }
}
