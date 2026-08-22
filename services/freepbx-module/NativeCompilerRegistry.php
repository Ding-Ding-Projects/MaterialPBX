<?php
namespace FreePBXmodules\Materialpbx;

final class NativeCompilerRegistry
{
    public function preview(array $resource): array
    {
        $kind = (string)($resource['kind'] ?? '');
        if ($kind === 'queues') return $this->previewQueue($resource);
        if ($kind !== 'ring-groups') return $this->unsupported($kind, 'No documented native compiler is registered for this feature.');
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'ring-group-get-config-v1', 'reason' => 'The disabled ring group requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'ring-groups:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        if (($config['failoverDestination']['type'] ?? null) !== 'terminate') return $this->unsupported($kind, 'Native ring-group compilation supports terminate failover only.');
        $members = $config['memberExtensionIds'] ?? [];
        if (!is_array($members) || count($members) < 1 || count($members) > 64) return $this->unsupported($kind, 'Ring groups require 1 to 64 members.');
        foreach ($members as $member) if (!preg_match('/^[A-Za-z0-9_.:@+\-]{1,128}$/D', (string)$member)) return $this->unsupported($kind, 'A member identifier is invalid.');
        $timeout = (int)($config['ringTimeSeconds'] ?? 0);
        if ($timeout < 1 || $timeout > 300) return $this->unsupported($kind, 'Ring time must be between 1 and 300 seconds.');
        $context = 'materialpbx-ring-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'ring-group-get-config-v1', 'context' => $context, 'members' => array_values(array_map('strval', $members)), 'timeout' => $timeout];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The ring group can use the supported FreePBX get_config hook.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => 'Generate the module-owned ring-group context.']]];
    }
    private function unsupported(string $kind, string $reason): array { return ['status' => 'unsupported', 'compiler' => null, 'reason' => $reason, 'artifact' => null, 'diff' => [['operation' => 'unchanged', 'target' => $kind ?: 'unknown', 'summary' => 'No native PBX output will change.']]]; }
    private function previewQueue(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'queue-get-config-v1', 'reason' => 'The disabled queue requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'queues:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        if (($config['failoverDestination']['type'] ?? null) !== 'terminate') return $this->unsupported('queues', 'Native queue compilation supports terminate failover only.');
        $members = $config['memberExtensionIds'] ?? [];
        if (!is_array($members) || count($members) < 1 || count($members) > 256 || count(array_unique(array_map('strval', $members))) !== count($members)) return $this->unsupported('queues', 'Queues require 1 to 256 unique members.');
        foreach ($members as $member) if (!preg_match('/^[A-Za-z0-9_.:@+\-]{1,128}$/D', (string)$member)) return $this->unsupported('queues', 'A queue member identifier is invalid.');
        $strategy = (string)($config['strategy'] ?? '');
        $strategies = ['ringall' => 'ringall', 'leastrecent' => 'leastrecent', 'fewestcalls' => 'fewestcalls', 'random' => 'random', 'rrmemory' => 'rrmemory'];
        if (!isset($strategies[$strategy])) return $this->unsupported('queues', 'Queue strategy is unsupported or invalid.');
        $timeout = (int)($config['timeoutSeconds'] ?? 0);
        if ($timeout < 1 || $timeout > 3600) return $this->unsupported('queues', 'Queue timeout must be between 1 and 3600 seconds.');
        $context = 'materialpbx-queue-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'queue-get-config-v1', 'context' => $context, 'members' => array_values(array_map('strval', $members)), 'strategy' => $strategies[$strategy], 'timeoutSeconds' => $timeout];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The queue can use the bounded module-owned generation hook.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => 'Generate the module-owned queue context.']]];
    }
}
