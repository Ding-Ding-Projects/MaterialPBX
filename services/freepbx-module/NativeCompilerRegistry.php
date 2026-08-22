<?php
namespace FreePBXmodules\Materialpbx;

final class NativeCompilerRegistry
{
    public function preview(array $resource): array
    {
        $kind = (string)($resource['kind'] ?? '');
        if ($kind === 'extensions') return $this->previewExtension($resource);
        if ($kind === 'trunks') return $this->previewTrunk($resource);
        if ($kind === 'inbound-routes') return $this->previewInboundRoute($resource);
        if ($kind === 'outbound-routes') return $this->previewOutboundRoute($resource);
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
    private function previewExtension(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'extension-get-config-v1', 'reason' => 'The disabled extension requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'extensions:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        $extension = $config['extension'] ?? '';
        if (!is_string($extension) || !preg_match('/^[0-9]{2,12}$/D', $extension)) return $this->unsupported('extensions', 'Extensions require a 2 to 12 digit numeric number.');
        $context = 'materialpbx-extension-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'extension-get-config-v1', 'context' => $context, 'extension' => $extension];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The extension can generate its module-owned internal dialplan entry.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => "Generate the module-owned extension context for {$extension}."]]];
    }
    private function previewTrunk(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'trunk-get-config-v1', 'reason' => 'The disabled trunk requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'trunks:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        $host = $config['host'] ?? '';
        if (!is_string($host) || strlen($host) < 1 || strlen($host) > 253 || preg_match('/[^A-Za-z0-9.\-:]/', $host)) return $this->unsupported('trunks', 'A trunk host must be 1 to 253 valid DNS, IPv4, IPv6 literal, or host:port characters.');
        if (($config['technology'] ?? '') !== 'pjsip') return $this->unsupported('trunks', 'Native trunk compilation supports PJSIP technology only.');
        $transport = (string)($config['transport'] ?? '');
        if (!in_array($transport, ['udp', 'tcp', 'tls'], true)) return $this->unsupported('trunks', 'Trunk transport must be UDP, TCP, or TLS.');
        if (($config['authentication'] ?? '') !== 'none') return $this->unsupported('trunks', 'This bounded compiler supports credentialless trunks only; registration and referenced credentials require reviewed provider-specific handling.');
        $port = (int)($config['port'] ?? 5060);
        if ($port < 1 || $port > 65535) return $this->unsupported('trunks', 'The trunk port is outside the valid range.');
        $endpoint = 'materialpbx-trunk-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'trunk-get-config-v1', 'endpoint' => $endpoint, 'host' => $host, 'port' => $port, 'transport' => $transport];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The PJSIP trunk can use the bounded module-owned generation hook.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $endpoint, 'summary' => "Generate the module-owned PJSIP trunk endpoint for {$host}:{$port}/{$transport}."]]];
    }
    private function previewInboundRoute(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'inbound-route-get-config-v1', 'reason' => 'The disabled inbound route requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'inbound-routes:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        $did = (string)($config['didPattern'] ?? '');
        if (!preg_match('/^[0-9XZN*#+.!\[\]-]{1,64}$/D', $did)) return $this->unsupported('inbound-routes', 'The DID pattern is invalid.');
        if (!isset($config['destination']['type'])) return $this->unsupported('inbound-routes', 'An inbound route requires a destination type.');
        if (!in_array($config['destination']['type'], ['extension', 'ivr', 'queue', 'ring-group', 'voicemail', 'terminate'], true)) return $this->unsupported('inbound-routes', 'The inbound destination type is unsupported.');
        if (($config['destination']['type'] ?? '') !== 'terminate' && empty($config['destination']['id'])) return $this->unsupported('inbound-routes', 'A non-terminate inbound route requires a destination identifier.');
        $context = 'materialpbx-in-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'inbound-route-get-config-v1', 'context' => $context, 'didPattern' => $did, 'callerIdPattern' => isset($config['callerIdPattern']) ? (string)$config['callerIdPattern'] : null, 'destination' => ['type' => (string)$config['destination']['type'], 'id' => isset($config['destination']['id']) ? (string)$config['destination']['id'] : null]];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The inbound route can generate a bounded module-owned context.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => "Generate the module-owned inbound context for DID {$did}."]]];
    }
    private function previewOutboundRoute(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'outbound-route-get-config-v1', 'reason' => 'The disabled outbound route requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'outbound-routes:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        $patterns = $config['dialPatterns'] ?? [];
        $trunks = $config['trunkIds'] ?? [];
        if (!is_array($patterns) || count($patterns) < 1 || count($patterns) > 128) return $this->unsupported('outbound-routes', 'An outbound route needs 1 to 128 dial patterns.');
        foreach ($patterns as $pattern) if (!is_string($pattern) || !preg_match('/^[0-9XZN*#+.!\[\]-]{1,64}$/D', $pattern)) return $this->unsupported('outbound-routes', 'An outbound dial pattern is invalid.');
        if (!is_array($trunks) || count($trunks) < 1 || count($trunks) > 16) return $this->unsupported('outbound-routes', 'An outbound route needs 1 to 16 trunk identifiers.');
        foreach ($trunks as $trunk) if (!is_string($trunk) || !preg_match('/^[A-Za-z0-9_.:@+\-]{1,128}$/D', $trunk)) return $this->unsupported('outbound-routes', 'An outbound trunk identifier is invalid.');
        if (!empty($config['emergency']) && count($trunks) !== 1) return $this->unsupported('outbound-routes', 'Emergency routes must name exactly one trunk.');
        $context = 'materialpbx-out-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'outbound-route-get-config-v1', 'context' => $context, 'dialPatterns' => array_values(array_map('strval', $patterns)), 'trunkIds' => array_values(array_map('strval', $trunks)), 'emergency' => !empty($config['emergency'])];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The outbound route can generate bounded module-owned pattern contexts.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => 'Generate module-owned outbound pattern and trunk-selection contexts.']]];
    }
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
