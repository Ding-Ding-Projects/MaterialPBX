<?php
namespace FreePBX\modules;
require_once __DIR__ . '/NativeCompilerRegistry.php';

class Materialpbx extends \FreePBX_Helpers implements \BMO
{
    private const REQUEST_SNAPSHOT_DIRECTORY = '/var/lib/materialpbx-helper/requests';
    private const MAX_REQUEST_SNAPSHOT_BYTES = 262144;

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
            $compiler = $artifact['compiler'] ?? null;
            if ($compiler === 'ring-group-get-config-v1') {
            $channels = implode('&', array_map(static fn($member) => 'PJSIP/' . $member, $artifact['members']));
            $ext->add($artifact['context'], 's', '', new \ext_noop('MaterialPBX generated ring group'));
            $ext->add($artifact['context'], 's', '', new \ext_dial($channels . ',' . (int)$artifact['timeout']));
            $ext->add($artifact['context'], 's', '', new \ext_hangup());
            } elseif ($compiler === 'extension-get-config-v1') {
                $ext->add($artifact['context'], (string)$artifact['extension'], 1, new \ext_noop('MaterialPBX generated extension'));
            } elseif ($compiler === 'trunk-get-config-v1') {
                $ext->add($artifact['endpoint'], 's', '', new \ext_noop('MaterialPBX generated PJSIP trunk endpoint'));
                $this->appendPjsipSection($artifact['endpoint'], ['type' => 'endpoint', 'context' => 'from-trunk', 'disallow' => 'all', 'allow' => 'opus,ulaw']);
                $this->appendPjsipSection($artifact['endpoint'], ['type' => 'aor', 'contact' => "sip:{$artifact['host']}:{$artifact['port']}"]);
                $this->appendPjsipSection($artifact['endpoint'], ['type' => 'identify', 'endpoint' => $artifact['endpoint'], 'match' => $artifact['host']]);
            } elseif ($compiler === 'inbound-route-get-config-v1') {
                $destination = $artifact['destination'];
                $ext->add($artifact['context'], $artifact['didPattern'], 1, new \ext_noop('MaterialPBX generated inbound route'));
            } elseif ($compiler === 'outbound-route-get-config-v1') {
                foreach ($artifact['dialPatterns'] as $index => $pattern) {
                    $priority = (int)$index + 1;
                    $ext->add($artifact['context'], $pattern, $priority, new \ext_noop('MaterialPBX generated outbound route pattern'));
                }
            } elseif ($compiler === 'ivr-get-config-v1') {
                $ext->add($artifact['context'], 's', 1, new \ext_noop('MaterialPBX generated IVR'));
                foreach ($artifact['entries'] as $entry) {
                    $ext->add($artifact['context'], $entry['digit'], 1, new \ext_noop('IVR choice recorded for live dispatch verification'));
                }
            } elseif ($compiler === 'voicemail-get-config-v1') {
                $ext->add($artifact['context'], $artifact['mailbox'], 1, new \ext_noop('MaterialPBX generated voicemail context'));
            } elseif ($compiler === 'time-condition-get-config-v1') {
                $ext->add($artifact['context'], 's', 1, new \ext_noop('MaterialPBX generated time condition schedule'));
            }
        }
    }

    public function syncResource(
        string $kind,
        string $id,
        bool $deleted,
        string $requestSnapshot,
        string $expectedSha256,
        int $expectedRevision
    ): array
    {
        self::assertIdentifier($kind, 64);
        self::assertIdentifier($id, 128);
        if ($expectedRevision < 1) throw new \InvalidArgumentException('Expected revision must be positive');
        $verifiedRequest = self::readVerifiedRequestSnapshot(
            $requestSnapshot,
            $expectedSha256,
            $deleted ? 'remove' : 'apply',
            $kind,
            $id,
            $expectedRevision
        );
        $snapshot = $verifiedRequest['snapshot'];
        $requestBinding = $verifiedRequest['requestBinding'];
        $resource = self::resourceFromApplicationSnapshot($snapshot['resource'], $kind);
        if ($deleted) {
            return self::withRequestBinding($this->deleteCompiledResource($kind, $id, $resource, $expectedRevision), $requestBinding);
        }

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
        $currentDesired = $this->Database->prepare('SELECT revision,enabled,display_name,configuration FROM materialpbx_resources WHERE resource_kind=? AND resource_id=? FOR UPDATE');
        $currentDesired->execute([$kind, $id]);
        $current = $currentDesired->fetch(\PDO::FETCH_ASSOC) ?: null;
        if ($current && (int)$current['revision'] > $expectedRevision) {
            throw new \RuntimeException('The immutable request snapshot revision is older than the stored desired state');
        }
        if ($current && (int)$current['revision'] === $expectedRevision) {
            self::assertStoredDesiredMatchesSnapshot($current, $resource);
        }
        $statement = $this->Database->prepare($sql);
        $statement->execute([
            $kind, $id, (int) $resource['revision'], !empty($resource['enabled']) ? 1 : 0,
            mb_substr((string) $resource['displayName'], 0, 256), $configuration
        ]);
        $prior = $this->Database->prepare('SELECT compiler, artifact FROM materialpbx_compiled WHERE resource_kind=? AND resource_id=? FOR UPDATE'); $prior->execute([$kind, $id]); $old = $prior->fetch(\PDO::FETCH_ASSOC) ?: [];
        if ($preview['status'] === 'remove') {
            if (!$old) { $this->Database->commit(); return self::withRequestBinding(['storedDesired'=>true,'compilation'=>['status'=>'unsupported','compiler'=>null,'reason'=>'Disabled desired state was stored; no compiled artifact existed to remove.','snapshotId'=>null,'diff'=>[['operation'=>'unchanged','target'=>$kind.':'.$id,'summary'=>'No generated output existed.']]],'applied'=>false,'rollback'=>['attempted'=>false,'succeeded'=>null,'snapshotId'=>null,'reason'=>null]], $requestBinding); }
            $snapshotId=self::uuid4();
            $snapshot=$this->Database->prepare('INSERT INTO materialpbx_compiler_snapshots (snapshot_id,resource_kind,resource_id,prior_compiler,prior_artifact,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(6))'); $snapshot->execute([$snapshotId,$kind,$id,$old['compiler'],$old['artifact']]);
            $remove=$this->Database->prepare('DELETE FROM materialpbx_compiled WHERE resource_kind=? AND resource_id=?'); $remove->execute([$kind,$id]);
            $this->Database->commit();
            return self::withRequestBinding(['storedDesired'=>true,'compilation'=>['status'=>'compiled','compiler'=>$old['compiler'],'reason'=>'Disabled desired state was stored and prior compiled output was removed.','snapshotId'=>$snapshotId,'diff'=>$preview['diff']],'applied'=>true,'rollback'=>['attempted'=>false,'succeeded'=>null,'snapshotId'=>$snapshotId,'reason'=>null]], $requestBinding);
        }
        if ($preview['status'] !== 'compiled') {
            $reason=$preview['reason']; $diff=$preview['diff'];
            if ($old) { $reason .= ' Prior compiled output is retained, so runtime may differ from desired state.'; $diff=[['operation'=>'unchanged','target'=>$kind.':'.$id,'summary'=>'Prior compiled output was retained; runtime may differ from desired state.']]; }
            $this->Database->commit();
            return self::withRequestBinding(['storedDesired'=>true,'compilation'=>['status'=>'unsupported','compiler'=>$old['compiler'] ?? null,'reason'=>$reason,'snapshotId'=>null,'diff'=>$diff],'applied'=>false,'rollback'=>['attempted'=>false,'succeeded'=>null,'snapshotId'=>null,'reason'=>null]], $requestBinding);
        }
        $snapshotId = self::uuid4();
        $snapshot = $this->Database->prepare('INSERT INTO materialpbx_compiler_snapshots (snapshot_id, resource_kind, resource_id, prior_compiler, prior_artifact, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))'); $snapshot->execute([$snapshotId, $kind, $id, $old['compiler'] ?? null, $old['artifact'] ?? null]);
        $compiled = $this->Database->prepare('INSERT INTO materialpbx_compiled (resource_kind, resource_id, compiler, artifact, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE compiler=VALUES(compiler), artifact=VALUES(artifact), updated_at=VALUES(updated_at)'); $compiled->execute([$kind, $id, $preview['compiler'], json_encode($preview['artifact'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)]);
        $this->Database->commit();
        return self::withRequestBinding(['storedDesired' => true, 'compilation' => ['status' => 'compiled', 'compiler' => $preview['compiler'], 'reason' => $preview['reason'], 'snapshotId' => $snapshotId, 'diff' => $preview['diff']], 'applied' => true, 'rollback' => ['attempted' => false, 'succeeded' => null, 'snapshotId' => $snapshotId, 'reason' => null]], $requestBinding);
        } catch (\Throwable $error) { $this->Database->rollBack(); throw $error; }
    }

    private function deleteCompiledResource(string $kind, string $id, array $resource, int $expectedRevision): array
    {
        $this->Database->beginTransaction();
        try {
            $prior=$this->Database->prepare('SELECT compiler,artifact FROM materialpbx_compiled WHERE resource_kind=? AND resource_id=? FOR UPDATE'); $prior->execute([$kind,$id]); $old=$prior->fetch(\PDO::FETCH_ASSOC) ?: null;
            $currentDesired=$this->Database->prepare('SELECT revision,enabled,display_name,configuration FROM materialpbx_resources WHERE resource_kind=? AND resource_id=? FOR UPDATE'); $currentDesired->execute([$kind,$id]); $current=$currentDesired->fetch(\PDO::FETCH_ASSOC) ?: null;
            if (!$current) throw new \RuntimeException('No module-owned desired-state record matches the immutable removal snapshot');
            if ((int)$current['revision'] !== $expectedRevision) throw new \RuntimeException('The immutable removal snapshot revision does not match the stored desired state');
            self::assertStoredDesiredMatchesSnapshot($current, $resource);
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

    private static function readVerifiedRequestSnapshot(
        string $path,
        string $expectedSha256,
        string $expectedAction,
        string $expectedKind,
        string $expectedId,
        int $expectedRevision,
        string $expectedDirectory = self::REQUEST_SNAPSHOT_DIRECTORY,
        int $expectedOwnerUid = 0
    ): array {
        if (!preg_match('/^[a-f0-9]{64}$/D', $expectedSha256)) throw new \InvalidArgumentException('Expected SHA-256 must be 64 lowercase hexadecimal characters');
        if (!in_array($expectedAction, ['apply', 'remove'], true)) throw new \InvalidArgumentException('Unsupported immutable request action');
        if ($expectedRevision < 1) throw new \InvalidArgumentException('Expected revision must be positive');
        if (strpos($path, "\0") !== false || strlen($path) < 1 || strlen($path) > 4096) throw new \InvalidArgumentException('Invalid immutable request snapshot path');
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/D', basename($path))) {
            throw new \InvalidArgumentException('Immutable request snapshot filename is invalid');
        }

        $directory = realpath($expectedDirectory);
        $parent = realpath(dirname($path));
        if ($directory === false || $parent === false || $parent !== $directory) throw new \RuntimeException('Immutable request snapshot is outside the trusted request directory');
        $directoryStat = lstat($directory);
        if ($directoryStat === false || (($directoryStat['mode'] & 0170000) !== 0040000) || $directoryStat['uid'] !== $expectedOwnerUid || (($directoryStat['mode'] & 0022) !== 0)) {
            throw new \RuntimeException('Immutable request directory is not a trusted owner-controlled directory');
        }

        $before = lstat($path);
        self::assertTrustedSnapshotStat($before, $expectedOwnerUid);
        if (($before['size'] ?? 0) < 1 || $before['size'] > self::MAX_REQUEST_SNAPSHOT_BYTES) throw new \RuntimeException('Immutable request snapshot is empty or exceeds 256 KiB');

        $handle = @fopen($path, 'rb');
        if ($handle === false) throw new \RuntimeException('Unable to open immutable request snapshot');
        try {
            $opened = fstat($handle);
            self::assertTrustedSnapshotStat($opened, $expectedOwnerUid);
            self::assertSameSnapshotIdentity($before, $opened);
            $bytes = stream_get_contents($handle, self::MAX_REQUEST_SNAPSHOT_BYTES + 1);
            if ($bytes === false) throw new \RuntimeException('Unable to read immutable request snapshot');
            $afterRead = fstat($handle);
            self::assertTrustedSnapshotStat($afterRead, $expectedOwnerUid);
            self::assertSameSnapshotIdentity($opened, $afterRead);
        } finally {
            fclose($handle);
        }
        if (strlen($bytes) < 1 || strlen($bytes) > self::MAX_REQUEST_SNAPSHOT_BYTES) throw new \RuntimeException('Immutable request snapshot is empty or exceeds 256 KiB');
        $after = lstat($path);
        self::assertTrustedSnapshotStat($after, $expectedOwnerUid);
        self::assertSameSnapshotIdentity($before, $after);

        return self::decodeAndVerifyRequestSnapshotBytes($bytes, $expectedSha256, $expectedAction, $expectedKind, $expectedId, $expectedRevision);
    }

    private static function decodeAndVerifyRequestSnapshotBytes(
        string $bytes,
        string $expectedSha256,
        string $expectedAction,
        string $expectedKind,
        string $expectedId,
        int $expectedRevision
    ): array {
        if (strlen($bytes) < 1 || strlen($bytes) > self::MAX_REQUEST_SNAPSHOT_BYTES) throw new \RuntimeException('Immutable request snapshot is empty or exceeds 256 KiB');
        $snapshot = json_decode($bytes, true, 16, JSON_THROW_ON_ERROR);
        if (!is_array($snapshot) || array_is_list($snapshot)) throw new \RuntimeException('Immutable request snapshot must be a JSON object');
        $canonical = self::canonicalJson($snapshot);
        if (!hash_equals($canonical, $bytes)) throw new \RuntimeException('Immutable request snapshot is not exact canonical JSON');
        $actualSha256 = hash('sha256', $bytes);
        if (!hash_equals($expectedSha256, $actualSha256)) throw new \RuntimeException('Immutable request snapshot SHA-256 does not match the expected digest');
        self::assertExactKeys($snapshot, ['action', 'expectedRevision', 'resource', 'schemaVersion'], [], 'request snapshot');
        if (($snapshot['schemaVersion'] ?? null) !== 1) throw new \RuntimeException('Unsupported immutable request snapshot schema version');
        if (($snapshot['action'] ?? null) !== $expectedAction) throw new \RuntimeException('Immutable request snapshot action does not match the requested operation');
        if (($snapshot['expectedRevision'] ?? null) !== $expectedRevision) throw new \RuntimeException('Immutable request snapshot expected revision does not match the CLI expectation');
        $resource = self::validateApplicationResource($snapshot['resource'] ?? null);
        $kind = self::kindForFeature($resource['feature']);
        if ($kind !== $expectedKind) throw new \RuntimeException('Immutable request snapshot resource kind does not match the CLI expectation');
        if ($resource['id'] !== $expectedId) throw new \RuntimeException('Immutable request snapshot resource identifier does not match the CLI expectation');
        if ($resource['revision'] !== $expectedRevision) throw new \RuntimeException('Immutable request snapshot resource revision does not match the CLI expectation');
        $snapshot['resource'] = $resource;
        return [
            'snapshot' => $snapshot,
            'requestBinding' => [
                'schemaVersion' => $snapshot['schemaVersion'],
                'action' => $snapshot['action'],
                'kind' => $kind,
                'id' => $resource['id'],
                'revision' => $resource['revision'],
                'sha256' => $actualSha256
            ]
        ];
    }

    private static function assertTrustedSnapshotStat($stat, int $expectedOwnerUid): void
    {
        if (!is_array($stat) || (($stat['mode'] & 0170000) !== 0100000) || $stat['uid'] !== $expectedOwnerUid || (($stat['mode'] & 0777) !== 0600) || ($stat['nlink'] ?? 0) !== 1) {
            throw new \RuntimeException('Immutable request snapshot must be one regular, non-linked, owner-controlled mode 0600 file');
        }
    }

    private static function assertSameSnapshotIdentity(array $left, array $right): void
    {
        foreach (['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size'] as $field) {
            if (($left[$field] ?? null) !== ($right[$field] ?? null)) throw new \RuntimeException('Immutable request snapshot changed while it was being verified');
        }
    }

    private static function canonicalJson($value): string
    {
        if (is_array($value)) {
            if (array_is_list($value)) {
                return '[' . implode(',', array_map([self::class, 'canonicalJson'], $value)) . ']';
            }
            ksort($value, SORT_STRING);
            $entries = [];
            foreach ($value as $key => $item) {
                $entries[] = json_encode((string)$key, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ':' . self::canonicalJson($item);
            }
            return '{' . implode(',', $entries) . '}';
        }
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private static function validateApplicationResource($resource): array
    {
        if (!is_array($resource) || array_is_list($resource)) throw new \RuntimeException('Immutable request resource must be a JSON object');
        self::assertExactKeys($resource, ['configuration', 'displayName', 'enabled', 'feature', 'id', 'revision'], [], 'resource');
        self::assertIdentifierValue($resource['id'], 128, 'resource identifier');
        self::assertBoundedString($resource['displayName'], 1, 256, 'resource display name');
        if (!is_bool($resource['enabled'])) throw new \RuntimeException('Resource enabled state must be boolean');
        self::assertPositiveInteger($resource['revision'], 'resource revision');
        if (!is_string($resource['feature']) || !array_key_exists($resource['feature'], self::featureKinds())) throw new \RuntimeException('Unsupported resource feature');
        self::validateFeatureConfiguration($resource['feature'], $resource['configuration']);
        return $resource;
    }

    private static function validateFeatureConfiguration(string $feature, $configuration): void
    {
        if (!is_array($configuration) || array_is_list($configuration)) throw new \RuntimeException('Resource configuration must be a JSON object');
        if ($feature === 'extension') {
            self::assertExactKeys($configuration, ['extension'], ['callerIdName', 'voicemailMailbox'], 'extension configuration');
            self::assertPatternString($configuration['extension'], '/^[0-9]{2,12}$/D', 'extension');
            if (array_key_exists('callerIdName', $configuration)) self::assertBoundedString($configuration['callerIdName'], 0, 80, 'caller ID name');
            if (array_key_exists('voicemailMailbox', $configuration)) self::assertIdentifierValue($configuration['voicemailMailbox'], 128, 'voicemail mailbox identifier');
            return;
        }
        if ($feature === 'trunk') {
            self::assertExactKeys($configuration, ['authentication', 'host', 'port', 'technology', 'transport'], ['credentialReference'], 'trunk configuration');
            if ($configuration['technology'] !== 'pjsip') throw new \RuntimeException('Trunk technology must be pjsip');
            self::assertBoundedString($configuration['host'], 1, 253, 'trunk host');
            self::assertIntegerRange($configuration['port'], 1, 65535, 'trunk port');
            self::assertEnum($configuration['transport'], ['udp', 'tcp', 'tls'], 'trunk transport');
            self::assertEnum($configuration['authentication'], ['none', 'outbound-registration', 'credentials-reference'], 'trunk authentication');
            if (array_key_exists('credentialReference', $configuration)) self::assertIdentifierValue($configuration['credentialReference'], 128, 'credential reference');
            return;
        }
        if ($feature === 'inbound-route') {
            self::assertExactKeys($configuration, ['destination', 'didPattern'], ['callerIdPattern'], 'inbound route configuration');
            self::assertNumberPattern($configuration['didPattern'], 'DID pattern');
            if (array_key_exists('callerIdPattern', $configuration)) self::assertNumberPattern($configuration['callerIdPattern'], 'caller ID pattern');
            self::validateDestination($configuration['destination'], 'inbound route destination');
            return;
        }
        if ($feature === 'outbound-route') {
            self::assertExactKeys($configuration, ['dialPatterns', 'emergency', 'trunkIds'], [], 'outbound route configuration');
            self::assertList($configuration['dialPatterns'], 1, 128, 'outbound dial patterns');
            foreach ($configuration['dialPatterns'] as $pattern) self::assertNumberPattern($pattern, 'outbound dial pattern');
            self::assertList($configuration['trunkIds'], 1, 16, 'outbound trunk identifiers');
            foreach ($configuration['trunkIds'] as $trunk) self::assertIdentifierValue($trunk, 128, 'outbound trunk identifier');
            if (!is_bool($configuration['emergency'])) throw new \RuntimeException('Outbound emergency state must be boolean');
            return;
        }
        if ($feature === 'ivr') {
            self::assertExactKeys($configuration, ['announcementId', 'entries', 'invalidDestination', 'timeoutSeconds'], [], 'IVR configuration');
            self::assertIdentifierValue($configuration['announcementId'], 128, 'announcement identifier');
            self::assertIntegerRange($configuration['timeoutSeconds'], 1, 60, 'IVR timeout');
            self::validateDestination($configuration['invalidDestination'], 'IVR invalid destination');
            self::assertList($configuration['entries'], 0, 12, 'IVR entries');
            foreach ($configuration['entries'] as $entry) {
                self::assertExactKeys($entry, ['destination', 'digit'], [], 'IVR entry');
                self::assertPatternString($entry['digit'], '/^[0-9*#]$/D', 'IVR digit');
                self::validateDestination($entry['destination'], 'IVR entry destination');
            }
            return;
        }
        if ($feature === 'queue') {
            self::assertExactKeys($configuration, ['failoverDestination', 'memberExtensionIds', 'number', 'strategy'], [], 'queue configuration');
            self::assertPatternString($configuration['number'], '/^[0-9]{2,12}$/D', 'queue number');
            self::assertEnum($configuration['strategy'], ['ringall', 'leastrecent', 'fewestcalls', 'random', 'rrmemory'], 'queue strategy');
            self::assertList($configuration['memberExtensionIds'], 1, 256, 'queue member identifiers');
            foreach ($configuration['memberExtensionIds'] as $member) self::assertIdentifierValue($member, 128, 'queue member identifier');
            self::validateDestination($configuration['failoverDestination'], 'queue failover destination');
            return;
        }
        if ($feature === 'ring-group') {
            self::assertExactKeys($configuration, ['failoverDestination', 'memberExtensionIds', 'number', 'ringTimeSeconds', 'strategy'], [], 'ring group configuration');
            self::assertPatternString($configuration['number'], '/^[0-9]{2,12}$/D', 'ring group number');
            self::assertEnum($configuration['strategy'], ['ringall', 'hunt', 'memoryhunt', 'firstavailable'], 'ring group strategy');
            self::assertList($configuration['memberExtensionIds'], 1, 64, 'ring group member identifiers');
            foreach ($configuration['memberExtensionIds'] as $member) self::assertIdentifierValue($member, 128, 'ring group member identifier');
            self::assertIntegerRange($configuration['ringTimeSeconds'], 1, 300, 'ring group time');
            self::validateDestination($configuration['failoverDestination'], 'ring group failover destination');
            return;
        }
        if ($feature === 'voicemail') {
            self::assertExactKeys($configuration, ['attachAudio', 'mailbox', 'maxMessageSeconds'], ['email'], 'voicemail configuration');
            self::assertPatternString($configuration['mailbox'], '/^[0-9]{2,12}$/D', 'voicemail mailbox');
            if (array_key_exists('email', $configuration)) {
                self::assertBoundedString($configuration['email'], 1, 254, 'voicemail email');
                if (filter_var($configuration['email'], FILTER_VALIDATE_EMAIL) === false) throw new \RuntimeException('Voicemail email is invalid');
            }
            if (!is_bool($configuration['attachAudio'])) throw new \RuntimeException('Voicemail attach-audio state must be boolean');
            self::assertIntegerRange($configuration['maxMessageSeconds'], 10, 3600, 'voicemail maximum message duration');
            return;
        }
        if ($feature === 'time-condition') {
            self::assertExactKeys($configuration, ['matchedDestination', 'timezone', 'unmatchedDestination', 'windows'], [], 'time condition configuration');
            self::assertBoundedString($configuration['timezone'], 1, 64, 'time condition timezone');
            self::assertList($configuration['windows'], 1, 32, 'time condition windows');
            foreach ($configuration['windows'] as $window) {
                self::assertExactKeys($window, ['end', 'start', 'weekdays'], [], 'time condition window');
                self::assertList($window['weekdays'], 1, 7, 'time condition weekdays');
                foreach ($window['weekdays'] as $weekday) self::assertIntegerRange($weekday, 0, 6, 'time condition weekday');
                self::assertPatternString($window['start'], '/^([01][0-9]|2[0-3]):[0-5][0-9]$/D', 'time condition start');
                self::assertPatternString($window['end'], '/^([01][0-9]|2[0-3]):[0-5][0-9]$/D', 'time condition end');
            }
            self::validateDestination($configuration['matchedDestination'], 'matched destination');
            self::validateDestination($configuration['unmatchedDestination'], 'unmatched destination');
            return;
        }
        throw new \RuntimeException('Unsupported resource feature');
    }

    private static function validateDestination($destination, string $label): void
    {
        self::assertExactKeys($destination, ['type'], ['id'], $label);
        self::assertEnum($destination['type'], ['extension', 'ivr', 'queue', 'ring-group', 'voicemail', 'terminate'], $label . ' type');
        if (array_key_exists('id', $destination)) self::assertIdentifierValue($destination['id'], 128, $label . ' identifier');
    }

    private static function featureKinds(): array
    {
        return [
            'extension' => 'extensions', 'trunk' => 'trunks', 'inbound-route' => 'inbound-routes',
            'outbound-route' => 'outbound-routes', 'ivr' => 'ivrs', 'queue' => 'queues',
            'ring-group' => 'ring-groups', 'voicemail' => 'voicemail-boxes', 'time-condition' => 'time-conditions'
        ];
    }

    private static function kindForFeature(string $feature): string
    {
        $kinds = self::featureKinds();
        if (!isset($kinds[$feature])) throw new \RuntimeException('Unsupported resource feature');
        return $kinds[$feature];
    }

    private static function resourceFromApplicationSnapshot(array $resource, string $kind): array
    {
        return [
            'id' => $resource['id'], 'kind' => $kind, 'displayName' => $resource['displayName'],
            'enabled' => $resource['enabled'], 'revision' => $resource['revision'], 'configuration' => $resource['configuration']
        ];
    }

    private static function assertStoredDesiredMatchesSnapshot(array $stored, array $resource): void
    {
        try {
            $storedConfiguration = json_decode((string)$stored['configuration'], true, 16, JSON_THROW_ON_ERROR);
        } catch (\Throwable $error) {
            throw new \RuntimeException('Stored desired-state configuration is malformed', 0, $error);
        }
        if ((int)$stored['revision'] !== $resource['revision'] || (bool)$stored['enabled'] !== $resource['enabled'] || (string)$stored['display_name'] !== $resource['displayName'] || !hash_equals(self::canonicalJson($storedConfiguration), self::canonicalJson($resource['configuration']))) {
            throw new \RuntimeException('Stored desired state does not exactly match the immutable request snapshot');
        }
    }

    private static function withRequestBinding(array $result, array $requestBinding): array
    {
        self::assertExactKeys($requestBinding, ['action', 'id', 'kind', 'revision', 'schemaVersion', 'sha256'], [], 'verified request binding');
        $result['requestBinding'] = $requestBinding;
        return $result;
    }

    private static function assertExactKeys($value, array $required, array $optional, string $label): void
    {
        if (!is_array($value) || array_is_list($value)) throw new \RuntimeException("{$label} must be a JSON object");
        $keys = array_keys($value);
        sort($keys, SORT_STRING);
        $allowed = array_merge($required, $optional);
        sort($allowed, SORT_STRING);
        foreach ($required as $key) if (!array_key_exists($key, $value)) throw new \RuntimeException("{$label} is missing required field {$key}");
        foreach ($keys as $key) if (!in_array($key, $allowed, true)) throw new \RuntimeException("{$label} contains unexpected field {$key}");
    }

    private static function assertBoundedString($value, int $minimum, int $maximum, string $label): void
    {
        if (!is_string($value)) throw new \RuntimeException("{$label} must be a string");
        $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
        if ($length < $minimum || $length > $maximum) throw new \RuntimeException("{$label} is outside its supported length");
    }

    private static function assertIdentifierValue($value, int $maximum, string $label): void
    {
        if (!is_string($value) || strlen($value) > $maximum || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:@+\-]*$/D', $value)) throw new \RuntimeException("{$label} is invalid");
    }

    private static function assertPatternString($value, string $pattern, string $label): void
    {
        if (!is_string($value) || !preg_match($pattern, $value)) throw new \RuntimeException("{$label} is invalid");
    }

    private static function assertNumberPattern($value, string $label): void
    {
        self::assertPatternString($value, '/^[0-9XZN*#+.!\[\]-]{1,64}$/D', $label);
    }

    private static function assertPositiveInteger($value, string $label): void
    {
        self::assertIntegerRange($value, 1, PHP_INT_MAX, $label);
    }

    private static function assertIntegerRange($value, int $minimum, int $maximum, string $label): void
    {
        if (!is_int($value) || $value < $minimum || $value > $maximum) throw new \RuntimeException("{$label} is outside its supported integer range");
    }

    private static function assertEnum($value, array $allowed, string $label): void
    {
        if (!is_string($value) || !in_array($value, $allowed, true)) throw new \RuntimeException("{$label} is unsupported");
    }

    private static function assertList($value, int $minimum, int $maximum, string $label): void
    {
        if (!is_array($value) || !array_is_list($value) || count($value) < $minimum || count($value) > $maximum) throw new \RuntimeException("{$label} is outside its supported item count");
    }

    private static function readResourceDocument(string $path): array
    {
        $bytes = file_get_contents($path);
        if ($bytes === false || strlen($bytes) > 16777216) throw new \RuntimeException('Desired-state store is missing or exceeds 16 MiB');
        $document = json_decode($bytes, true, 64, JSON_THROW_ON_ERROR);
        if (($document['version'] ?? null) !== 1 || !is_array($document['resources'] ?? null)) throw new \RuntimeException('Invalid desired-state store');
        return $document;
    }

    private function appendPjsipSection(string $name, array $fields): void
    {
        $destination = '/etc/asterisk/pjsip_materialpbx_custom.conf';
        if (!is_writable(dirname($destination)) && !is_writable($destination) && !file_exists($destination)) throw new \RuntimeException('The module-owned PJSIP output file is not writable');
        $lines = ["[{$name}]"];
        foreach ($fields as $key => $value) {
            $key = (string)$key; $value = (string)$value;
            if (!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,31}$/D', $key) || strlen($value) > 255 || preg_match('/[\r\n\0]/', $value)) throw new \RuntimeException('Unsafe PJSIP output field');
            $lines[] = "{$key}={$value}";
        }
        if (@file_put_contents($destination, implode("\n", $lines) . "\n", FILE_APPEND | LOCK_EX) === false) throw new \RuntimeException('Unable to append bounded PJSIP output');
    }

    private static function assertIdentifier(string $value, int $max): void
    {
        if (strlen($value) < 1 || strlen($value) > $max || !preg_match('/^[A-Za-z0-9_.:@+\-]+$/D', $value)) {
            throw new \InvalidArgumentException('Invalid identifier');
        }
    }
}
