<?php
namespace FreePBXmodules\Materialpbx;

final class NativeCompilerRegistry
{
    public function preview(array $resource): array
    {
        $kind = (string)($resource['kind'] ?? '');
        if ($kind !== 'ring-groups') return $this->unsupported($kind, 'No documented native compiler is registered for this feature.');
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return $this->unsupported($kind, 'Disabled ring groups are stored but not compiled.');
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
}
