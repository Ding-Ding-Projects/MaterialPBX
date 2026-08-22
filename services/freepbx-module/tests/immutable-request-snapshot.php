<?php
declare(strict_types=1);

namespace {
    class FreePBX_Helpers { protected $Database; public function __construct($freepbx = null) {} }
    interface BMO {}
}

namespace MaterialPbxImmutableSnapshotTest {
    require_once dirname(__DIR__) . '/Materialpbx.class.php';

    use FreePBX\modules\Materialpbx;

    $passed = 0;
    $skipped = 0;

    function canonicalJson($value): string
    {
        if (is_array($value)) {
            if (array_is_list($value)) return '[' . implode(',', array_map(__NAMESPACE__ . '\\canonicalJson', $value)) . ']';
            ksort($value, SORT_STRING);
            $parts = [];
            foreach ($value as $key => $item) {
                $parts[] = json_encode((string)$key, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ':' . canonicalJson($item);
            }
            return '{' . implode(',', $parts) . '}';
        }
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    function baseSnapshot(): array
    {
        return [
            'schemaVersion' => 1,
            'resource' => [
                'revision' => 7,
                'configuration' => ['extension' => '1201', 'callerIdName' => 'Front desk'],
                'feature' => 'extension',
                'enabled' => true,
                'displayName' => 'Front desk',
                'id' => 'front-desk'
            ],
            'expectedRevision' => 7,
            'action' => 'apply'
        ];
    }

    function invokeDecode(array $snapshot, ?string $digest = null, string $action = 'apply', string $kind = 'extensions', string $id = 'front-desk', int $revision = 7, ?string $bytes = null): array
    {
        $canonical = canonicalJson($snapshot);
        $method = new \ReflectionMethod(Materialpbx::class, 'decodeAndVerifyRequestSnapshotBytes');
        return $method->invoke(null, $bytes ?? $canonical, $digest ?? hash('sha256', $canonical), $action, $kind, $id, $revision);
    }

    function expectPass(string $name, callable $test): void
    {
        global $passed;
        $test();
        $passed++;
        echo "PASS {$name}\n";
    }

    function expectFailure(string $name, callable $test, string $messageFragment): void
    {
        global $passed;
        try {
            $test();
        } catch (\Throwable $error) {
            if (strpos($error->getMessage(), $messageFragment) === false) {
                throw new \RuntimeException("{$name} failed with an unexpected message: {$error->getMessage()}", 0, $error);
            }
            $passed++;
            echo "PASS {$name}\n";
            return;
        }
        throw new \RuntimeException("{$name} unexpectedly accepted invalid input");
    }

    expectPass('valid canonical snapshot', function (): void {
        $decoded = invokeDecode(baseSnapshot());
        if ($decoded['snapshot']['resource']['configuration']['extension'] !== '1201') throw new \RuntimeException('Decoded resource changed');
    });

    expectPass('verified request binding is exact and consumer-derived', function (): void {
        $verified = invokeDecode(baseSnapshot());
        $expected = [
            'schemaVersion' => 1,
            'action' => 'apply',
            'kind' => 'extensions',
            'id' => 'front-desk',
            'revision' => 7,
            'sha256' => 'f07d5f6e36aec21e653c6e23dfc629774e0abdf331abba5275020ceca2b9faf4'
        ];
        if ($verified['requestBinding'] !== $expected) throw new \RuntimeException('Verified request binding is not exact');
    });

    expectPass('canonical JSON matches the producer test vector', function (): void {
        $canonical = canonicalJson(baseSnapshot());
        $expected = '{"action":"apply","expectedRevision":7,"resource":{"configuration":{"callerIdName":"Front desk","extension":"1201"},"displayName":"Front desk","enabled":true,"feature":"extension","id":"front-desk","revision":7},"schemaVersion":1}';
        if (!hash_equals($expected, $canonical)) throw new \RuntimeException('Consumer canonical JSON differs from the Node producer vector');
        if (!hash_equals('f07d5f6e36aec21e653c6e23dfc629774e0abdf331abba5275020ceca2b9faf4', hash('sha256', $canonical))) throw new \RuntimeException('Consumer canonical digest differs from the Node producer vector');
    });

    $featureConfigurations = [
        'extension' => ['extension' => '1201'],
        'trunk' => ['technology' => 'pjsip', 'host' => 'pbx.example.test', 'port' => 5060, 'transport' => 'tls', 'authentication' => 'none'],
        'inbound-route' => ['didPattern' => '416555XXXX', 'destination' => ['type' => 'terminate']],
        'outbound-route' => ['dialPatterns' => ['9X.'], 'trunkIds' => ['primary'], 'emergency' => false],
        'ivr' => ['announcementId' => 'welcome', 'timeoutSeconds' => 10, 'invalidDestination' => ['type' => 'terminate'], 'entries' => [['digit' => '1', 'destination' => ['type' => 'extension', 'id' => 'front-desk']]]],
        'queue' => ['number' => '6100', 'strategy' => 'ringall', 'memberExtensionIds' => ['front-desk'], 'failoverDestination' => ['type' => 'terminate']],
        'ring-group' => ['number' => '6200', 'strategy' => 'ringall', 'memberExtensionIds' => ['front-desk'], 'ringTimeSeconds' => 30, 'failoverDestination' => ['type' => 'terminate']],
        'voicemail' => ['mailbox' => '1201', 'email' => 'front-desk@example.test', 'attachAudio' => true, 'maxMessageSeconds' => 120],
        'time-condition' => ['timezone' => 'America/Toronto', 'windows' => [['weekdays' => [1, 2, 3, 4, 5], 'start' => '09:00', 'end' => '17:00']], 'matchedDestination' => ['type' => 'extension', 'id' => 'front-desk'], 'unmatchedDestination' => ['type' => 'terminate']]
    ];
    $featureKinds = ['extension'=>'extensions','trunk'=>'trunks','inbound-route'=>'inbound-routes','outbound-route'=>'outbound-routes','ivr'=>'ivrs','queue'=>'queues','ring-group'=>'ring-groups','voicemail'=>'voicemail-boxes','time-condition'=>'time-conditions'];
    foreach ($featureConfigurations as $feature => $configuration) {
        expectPass("strict {$feature} snapshot schema", function () use ($feature, $configuration, $featureKinds): void {
            $snapshot = baseSnapshot();
            $snapshot['resource']['feature'] = $feature;
            $snapshot['resource']['configuration'] = $configuration;
            invokeDecode($snapshot, null, 'apply', $featureKinds[$feature]);
        });
    }

    expectFailure('tampered digest', function (): void {
        invokeDecode(baseSnapshot(), str_repeat('0', 64));
    }, 'SHA-256');

    expectFailure('stale CLI revision', function (): void {
        invokeDecode(baseSnapshot(), null, 'apply', 'extensions', 'front-desk', 8);
    }, 'expected revision');

    expectFailure('resource revision disagreement', function (): void {
        $snapshot = baseSnapshot();
        $snapshot['resource']['revision'] = 8;
        invokeDecode($snapshot);
    }, 'resource revision');

    expectFailure('wrong action', function (): void {
        invokeDecode(baseSnapshot(), null, 'remove');
    }, 'action');

    expectFailure('wrong kind', function (): void {
        invokeDecode(baseSnapshot(), null, 'apply', 'trunks');
    }, 'resource kind');

    expectFailure('wrong identifier', function (): void {
        invokeDecode(baseSnapshot(), null, 'apply', 'extensions', 'different');
    }, 'resource identifier');

    expectFailure('unknown resource field', function (): void {
        $snapshot = baseSnapshot();
        $snapshot['resource']['surprise'] = true;
        invokeDecode($snapshot);
    }, 'unexpected field');

    expectFailure('malformed snapshot', function (): void {
        invokeDecode(baseSnapshot(), hash('sha256', '{'), 'apply', 'extensions', 'front-desk', 7, "{\n");
    }, 'Syntax error');

    expectFailure('noncanonical snapshot', function (): void {
        $snapshot = baseSnapshot();
        $pretty = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        invokeDecode($snapshot, hash('sha256', canonicalJson($snapshot)), 'apply', 'extensions', 'front-desk', 7, $pretty);
    }, 'exact canonical JSON');

    expectFailure('oversized snapshot', function (): void {
        $snapshot = baseSnapshot();
        invokeDecode($snapshot, null, 'apply', 'extensions', 'front-desk', 7, str_repeat(' ', 262145));
    }, 'exceeds 256 KiB');

    expectFailure('feature-specific schema rejection', function (): void {
        $snapshot = baseSnapshot();
        $snapshot['resource']['configuration']['extension'] = 'not-a-number';
        invokeDecode($snapshot);
    }, 'extension is invalid');

    expectPass('stored desired state matches exact prior snapshot', function (): void {
        $snapshot = baseSnapshot();
        $resource = $snapshot['resource'];
        unset($resource['feature']);
        $method = new \ReflectionMethod(Materialpbx::class, 'assertStoredDesiredMatchesSnapshot');
        $method->invoke(null, [
            'revision' => '7', 'enabled' => '1', 'display_name' => 'Front desk',
            'configuration' => '{"extension":"1201","callerIdName":"Front desk"}'
        ], $resource);
    });

    expectFailure('stored desired state rejects stale removal snapshot', function (): void {
        $snapshot = baseSnapshot();
        $resource = $snapshot['resource'];
        unset($resource['feature']);
        $method = new \ReflectionMethod(Materialpbx::class, 'assertStoredDesiredMatchesSnapshot');
        $method->invoke(null, [
            'revision' => '8', 'enabled' => '1', 'display_name' => 'Front desk',
            'configuration' => '{"extension":"1201","callerIdName":"Front desk"}'
        ], $resource);
    }, 'does not exactly match');

    expectPass('console requires immutable request options', function (): void {
        $source = file_get_contents(dirname(__DIR__) . '/Console/Materialpbx.class.php');
        if ($source === false) throw new \RuntimeException('Unable to inspect console source');
        foreach (['request-snapshot', 'expected-sha256', 'expected-revision'] as $option) {
            if (!preg_match("/^[[:space:]]*->addOption\\('" . preg_quote($option, '/') . "',/m", $source)) throw new \RuntimeException("Console option {$option} is missing");
            if ($option !== 'expected-revision') {
                $forwardNeedle = preg_quote("(string) \$input->getOption('{$option}')", '/');
                if (!preg_match('/^[[:space:]]*' . $forwardNeedle . ',?[[:space:]]*$/m', $source)) throw new \RuntimeException("Console option {$option} is not forwarded");
            }
        }
        $revisionNeedle = preg_quote("\$revisionText = (string) \$input->getOption('expected-revision');", '/');
        if (!preg_match('/^[[:space:]]*' . $revisionNeedle . '[[:space:]]*$/m', $source)) throw new \RuntimeException('Expected revision is not parsed from the CLI');
    });

    expectPass('sync path has no legacy desired-state reread', function (): void {
        $source = file_get_contents(dirname(__DIR__) . '/Materialpbx.class.php');
        if ($source === false) throw new \RuntimeException('Unable to inspect module source');
        $start = strpos($source, 'public function syncResource(');
        $end = strpos($source, 'private function deleteCompiledResource(', $start === false ? 0 : $start);
        if ($start === false || $end === false || $end <= $start) throw new \RuntimeException('Unable to isolate syncResource');
        $body = substr($source, $start, $end - $start);
        if (strpos($body, '/var/lib/materialpbx/control-plane/resources.json') !== false || strpos($body, 'readResourceDocument(') !== false) {
            throw new \RuntimeException('syncResource still rereads the mutable legacy desired-state store');
        }
        if (strpos($body, 'return self::withRequestBinding($this->deleteCompiledResource(') === false) {
            throw new \RuntimeException('Removal result does not return the verified request binding');
        }
        if (substr_count($body, 'return self::withRequestBinding(') !== 5) {
            throw new \RuntimeException('Every apply and remove result path must return the verified request binding');
        }
    });

    if (DIRECTORY_SEPARATOR === '/' && function_exists('posix_geteuid')) {
        $root = sys_get_temp_dir() . '/materialpbx-snapshot-' . bin2hex(random_bytes(8));
        if (!mkdir($root, 0700) || !chmod($root, 0700)) throw new \RuntimeException('Unable to create trusted test directory');
        $uid = posix_geteuid();
        $snapshot = baseSnapshot();
        $canonical = canonicalJson($snapshot);
        $digest = hash('sha256', $canonical);
        $filename = '123e4567-e89b-12d3-a456-426614174000.json';
        $path = $root . '/' . $filename;
        file_put_contents($path, $canonical);
        chmod($path, 0600);
        $method = new \ReflectionMethod(Materialpbx::class, 'readVerifiedRequestSnapshot');

        try {
            expectPass('trusted regular mode 0600 snapshot file', function () use ($method, $path, $digest, $root, $uid): void {
                $method->invoke(null, $path, $digest, 'apply', 'extensions', 'front-desk', 7, $root, $uid);
            });

            expectFailure('wrong snapshot mode', function () use ($method, $path, $digest, $root, $uid): void {
                chmod($path, 0660);
                try { $method->invoke(null, $path, $digest, 'apply', 'extensions', 'front-desk', 7, $root, $uid); }
                finally { chmod($path, 0600); }
            }, 'mode 0600');

            $link = $root . '/123e4567-e89b-12d3-a456-426614174001.json';
            if (symlink($path, $link)) {
                expectFailure('symbolic-link snapshot', function () use ($method, $link, $digest, $root, $uid): void {
                    $method->invoke(null, $link, $digest, 'apply', 'extensions', 'front-desk', 7, $root, $uid);
                }, 'mode 0600');
                unlink($link);
            } else {
                $skipped++;
                echo "SKIP symbolic-link snapshot (filesystem does not permit symlinks)\n";
            }

            if ($uid === 0 && function_exists('chown')) {
                expectFailure('wrong snapshot owner', function () use ($method, $path, $digest, $root, $uid): void {
                    chown($path, 65534);
                    try { $method->invoke(null, $path, $digest, 'apply', 'extensions', 'front-desk', 7, $root, $uid); }
                    finally { chown($path, $uid); }
                }, 'owner-controlled');
            } else {
                $skipped++;
                echo "SKIP wrong snapshot owner (test process cannot change ownership)\n";
            }
        } finally {
            @unlink($path);
            @rmdir($root);
        }
    } else {
        $skipped += 4;
        echo "SKIP four POSIX ownership, mode, and symlink checks on this platform\n";
    }

    echo "RESULT {$passed} passed, {$skipped} skipped\n";
}
