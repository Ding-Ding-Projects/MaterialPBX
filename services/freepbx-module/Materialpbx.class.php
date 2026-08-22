<?php
namespace FreePBXmodules;

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

    public function syncResource(string $kind, string $id, bool $deleted): array
    {
        self::assertIdentifier($kind, 64);
        self::assertIdentifier($id, 128);
        if ($deleted) {
            $statement = $this->Database->prepare('DELETE FROM materialpbx_resources WHERE resource_kind = ? AND resource_id = ?');
            $statement->execute([$kind, $id]);
            return ['deleted' => $statement->rowCount() > 0, 'kind' => $kind, 'id' => $id];
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
        $statement = $this->Database->prepare($sql);
        $statement->execute([
            $kind, $id, (int) $resource['revision'], !empty($resource['enabled']) ? 1 : 0,
            mb_substr((string) $resource['displayName'], 0, 256), $configuration
        ]);
        return ['synced' => true, 'kind' => $kind, 'id' => $id, 'revision' => (int) $resource['revision']];
    }

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
