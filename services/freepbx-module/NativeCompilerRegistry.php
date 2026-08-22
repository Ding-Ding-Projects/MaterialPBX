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
        if ($kind === 'ivrs') return $this->previewIvr($resource);
        if ($kind === 'queues') return $this->previewQueue($resource);
        if ($kind === 'conferences') return $this->previewConference($resource);
        if ($kind === 'voicemail-boxes') return $this->previewVoicemail($resource);
        if ($kind === 'time-conditions') return $this->previewTimeCondition($resource);
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
    private function previewIvr(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'ivr-get-config-v1', 'reason' => 'The disabled IVR requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'ivrs:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        $entries = $config['entries'] ?? [];
        if (!is_array($entries) || count($entries) < 1 || count($entries) > 12) return $this->unsupported('ivrs', 'An IVR requires 1 to 12 entries.');
        $seenDigits = [];
        foreach ($entries as $entry) {
            $digit = (string)($entry['digit'] ?? '');
            if (!preg_match('/^[0-9*#]$/D', $digit) || isset($seenDigits[$digit])) return $this->unsupported('ivrs', 'IVR digits must be unique 0–9, *, or # values.');
            $seenDigits[$digit] = true;
            $type = (string)($entry['destination']['type'] ?? '');
            if (!in_array($type, ['extension', 'ivr', 'queue', 'ring-group', 'voicemail', 'terminate'], true)) return $this->unsupported('ivrs', 'An IVR destination type is unsupported.');
            if ($type !== 'terminate' && empty($entry['destination']['id'])) return $this->unsupported('ivrs', 'A non-terminate IVR entry requires a destination identifier.');
        }
        $timeout = (int)($config['timeoutSeconds'] ?? 0);
        if ($timeout < 1 || $timeout > 60) return $this->unsupported('ivrs', 'The IVR timeout must be between 1 and 60 seconds.');
        $context = 'materialpbx-ivr-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'ivr-get-config-v1', 'context' => $context, 'announcementId' => (string)($config['announcementId'] ?? ''), 'timeoutSeconds' => $timeout, 'invalidDestination' => ['type' => (string)($config['invalidDestination']['type'] ?? 'terminate'), 'id' => isset($config['invalidDestination']['id']) ? (string)$config['invalidDestination']['id'] : null], 'entries' => array_values(array_map(static fn($entry): array => ['digit' => (string)$entry['digit'], 'destination' => ['type' => (string)$entry['destination']['type'], 'id' => isset($entry['destination']['id']) ? (string)$entry['destination']['id'] : null]], $entries))];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The IVR can generate bounded module-owned key-choice contexts.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => 'Generate the module-owned IVR key-choice context.']]];
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
    private function previewConference(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'conference-freepbx-bmo-v1', 'reason' => 'The disabled conference requires removal of its prior module-owned FreePBX Conferences record.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'conferences:' . (string)$resource['id'], 'summary' => 'Remove the module-owned FreePBX conference when it exists.']]];
        $number = $config['number'] ?? null;
        if (!is_string($number) || !preg_match('/^[0-9]{2,12}$/D', $number)) return $this->unsupported('conferences', 'Conference number must contain 2 to 12 digits.');
        $maximum = $config['maxParticipants'] ?? null;
        if (!is_int($maximum) || $maximum < 2 || $maximum > 200) return $this->unsupported('conferences', 'Maximum participants must be a whole number from 2 through 200.');
        foreach (['recordConference', 'announceJoinLeave', 'startMuted', 'musicOnHoldWhenEmpty', 'quiet'] as $field) {
            if (!array_key_exists($field, $config) || !is_bool($config[$field])) return $this->unsupported('conferences', "Conference setting {$field} must be true or false.");
        }
        if ($config['quiet'] && $config['announceJoinLeave']) return $this->unsupported('conferences', 'Turn off quiet mode or turn off join and leave announcements. Quiet mode suppresses those announcements.');

        $options = ['s'];
        if ($config['recordConference']) $options[] = 'r';
        if ($config['announceJoinLeave']) $options[] = 'I';
        if ($config['startMuted']) $options[] = 'm';
        if ($config['musicOnHoldWhenEmpty']) $options[] = 'M';
        if ($config['quiet']) $options[] = 'q';
        sort($options, SORT_STRING);
        $suffix = substr(hash('sha256', (string)$resource['id']), 0, 16);
        $displayName = (string)($resource['displayName'] ?? 'Conference');
        $ownershipPrefix = 'MPBX:' . $suffix . ':';
        $description = $ownershipPrefix . $displayName;
        if (function_exists('mb_strcut')) {
            $description = mb_strcut($description, 0, 50, 'UTF-8');
        } elseif (function_exists('iconv_substr') && function_exists('iconv_strlen')) {
            $length = iconv_strlen($description, 'UTF-8');
            if ($length === false) return $this->unsupported('conferences', 'Conference display name must be valid UTF-8.');
            while (strlen($description) > 50 && $length > 0) {
                $length--;
                $description = (string)iconv_substr($description, 0, $length, 'UTF-8');
            }
        } else {
            if (preg_match('/[^\x20-\x7E]/', $description)) return $this->unsupported('conferences', 'This FreePBX host needs mbstring or iconv to safely compile a non-ASCII conference display name.');
            $description = substr($description, 0, 50);
        }
        if (strlen($description) > 50 || !preg_match('//u', $description)) return $this->unsupported('conferences', 'Conference display name could not be represented as valid UTF-8 within the FreePBX field limit.');
        $artifact = [
            'schemaVersion' => 1,
            'compiler' => 'conference-freepbx-bmo-v1',
            'route' => 'FreePBX::Conferences',
            'room' => $number,
            'description' => $description,
            'options' => implode('', $options),
            'users' => $maximum,
            'ownership' => ['module' => 'materialpbx', 'resourceId' => (string)$resource['id'], 'descriptionPrefix' => $ownershipPrefix]
        ];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The conference can be applied through the installed FreePBX 17 Conferences BMO API. FreePBX owns ext-meetme and its dynamic ConfBridge profiles.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => 'freepbx-conference:' . $number, 'summary' => "Create or update the module-owned FreePBX conference {$number} with a {$maximum}-participant limit."]]];
    }
    private function previewVoicemail(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'voicemail-get-config-v1', 'reason' => 'The disabled voicemail box requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'voicemail-boxes:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        $mailbox = (string)($config['mailbox'] ?? '');
        if (!preg_match('/^[0-9]{2,12}$/D', $mailbox)) return $this->unsupported('voicemail-boxes', 'A mailbox must be a validated 2 to 12 digit numeric number.');
        $email = isset($config['email']) ? filter_var((string)$config['email'], FILTER_VALIDATE_EMAIL) : true;
        if ($email === false || (is_string($email) && strlen($email) > 254)) return $this->unsupported('voicemail-boxes', 'The voicemail email address is invalid or too long.');
        $seconds = (int)($config['maxMessageSeconds'] ?? 0);
        if ($seconds < 10 || $seconds > 3600) return $this->unsupported('voicemail-boxes', 'Maximum message length must be between 10 and 3600 seconds.');
        $context = 'materialpbx-vm-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'voicemail-get-config-v1', 'context' => $context, 'mailbox' => $mailbox, 'attachAudio' => !empty($config['attachAudio']), 'maxMessageSeconds' => $seconds];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The voicemail box can generate a bounded module-owned context.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => "Generate the module-owned voicemail context for mailbox {$mailbox}."]]];
    }
    private function previewTimeCondition(array $resource): array
    {
        $config = $resource['configuration'] ?? [];
        if (empty($resource['enabled'])) return ['status' => 'remove', 'compiler' => 'time-condition-get-config-v1', 'reason' => 'The disabled time condition requires removal of any prior module-owned output.', 'artifact' => null, 'diff' => [['operation' => 'remove', 'target' => 'time-conditions:' . (string)$resource['id'], 'summary' => 'Remove prior generated output when it exists.']]];
        $windows = $config['windows'] ?? [];
        if (!is_array($windows) || count($windows) < 1 || count($windows) > 32) return $this->unsupported('time-conditions', 'A time condition requires 1 to 32 windows.');
        foreach ($windows as $window) {
            $days = $window['weekdays'] ?? [];
            if (!is_array($days) || count($days) < 1 || count($days) > 7) return $this->unsupported('time-conditions', 'Each time window needs one to seven weekdays.');
            foreach ($days as $day) if (!is_numeric($day) || (int)$day < 0 || (int)$day > 6) return $this->unsupported('time-conditions', 'A weekday value is outside Sunday through Saturday.');
            foreach (['start', 'end'] as $field) if (!is_string($window[$field] ?? null) || !preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $window[$field])) return $this->unsupported('time-conditions', 'A time window start or end is invalid.');
        }
        $timezone = timezone_open((string)($config['timezone'] ?? '')); if (!$timezone) return $this->unsupported('time-conditions', 'The timezone identifier is invalid.');
        $context = 'materialpbx-time-' . substr(hash('sha256', (string)$resource['id']), 0, 16);
        $artifact = ['schemaVersion' => 1, 'compiler' => 'time-condition-get-config-v1', 'context' => $context, 'timezone' => (string)$config['timezone'], 'windows' => array_values(array_map(static fn($window): array => ['weekdays' => array_map('intval', $window['weekdays']), 'start' => (string)$window['start'], 'end' => (string)$window['end']], $windows)), 'matchedDestination' => ['type' => (string)($config['matchedDestination']['type'] ?? 'terminate'), 'id' => isset($config['matchedDestination']['id']) ? (string)$config['matchedDestination']['id'] : null], 'unmatchedDestination' => ['type' => (string)($config['unmatchedDestination']['type'] ?? 'terminate'), 'id' => isset($config['unmatchedDestination']['id']) ? (string)$config['unmatchedDestination']['id'] : null]];
        return ['status' => 'compiled', 'compiler' => $artifact['compiler'], 'reason' => 'The time condition can generate bounded module-owned schedule contexts.', 'artifact' => $artifact, 'diff' => [['operation' => 'replace', 'target' => $context, 'summary' => 'Generate the module-owned opening-hours schedule context.']]];
    }
}
