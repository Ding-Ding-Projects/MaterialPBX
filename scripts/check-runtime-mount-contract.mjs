import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = new Map(await Promise.all([
  "docker-compose.yml",
  "deploy/bootstrap.sh",
  "deploy/pbx/Dockerfile",
  "deploy/production-bootstrap.sh",
  "deploy/pbx/materialpbx-firstboot.service",
  "deploy/pbx/materialpbx-firstboot.sh",
  "deploy/pbx/materialpbx-configure-integrations.sh",
  "deploy/pbx/materialpbx-helper-probe.mjs",
  "deploy/pbx/materialpbx-privileged-helper.service",
  "deploy/pbx/mariadb-container.conf",
  "deploy/pbx/redis-container.conf",
  "deploy/native/build-service-payloads.sh",
  "deploy/native/materialpbx-control-plane.service",
  "deploy/native/materialpbx-privileged-helper.service",
  "deploy/native/materialpbx-prepare-helper-runtime.sh",
  "docs/architecture/deployment.md",
  "pnpm-workspace.yaml",
  "services/privileged-helper/src/server.ts",
  "services/privileged-helper/src/payload-identity.ts",
  "services/privileged-helper/scripts/check-runtime-contract.mjs",
  "services/control-plane/src/server.ts",
  "services/control-plane/src/payload-identity.ts",
  "services/control-plane/src/adapters/ami.ts",
  "services/control-plane/src/adapters/ari.ts",
  "services/control-plane/src/adapters/cdr.ts",
  "services/control-plane/src/adapters/freepbx.ts",
  "services/control-plane/src/adapters/privileged.ts",
  "services/control-plane/scripts/check-runtime-contract.mjs",
  "services/freepbx-module/Console/Materialpbx.class.php",
  "services/freepbx-module/Materialpbx.class.php",
  "services/freepbx-module/tests/immutable-request-snapshot.php"
].map(async relative => [relative, await readFile(path.join(root, relative), "utf8")])));

const requirements = [
  { id: "secret-input-bind", file: "docker-compose.yml", includes: "${MATERIALPBX_SECRET_DIR:?Set MATERIALPBX_SECRET_DIR}:/etc/materialpbx/secrets-input:ro" },
  { id: "helper-runtime-dependency", file: "docker-compose.yml", includes: "image: materialpbx/pbx:${MATERIALPBX_VERSION:-dev}\n    depends_on:\n      privileged-helper-image:\n        condition: service_completed_successfully" },
  { id: "fqdn-loopback-mapping", file: "docker-compose.yml", includes: "\"${MATERIALPBX_HOSTNAME:-materialpbx}:127.0.0.1\"" },
  { id: "pbx-functional-healthcheck", file: "docker-compose.yml", includes: "test -s /var/lib/materialpbx/freepbx-installed && systemctl is-active --quiet materialpbx-privileged-helper.service" },
  { id: "control-plane-identity-healthcheck", file: "docker-compose.yml", includes: "/usr/bin/setpriv --reuid=991 --regid=991 --clear-groups /usr/bin/node /usr/local/libexec/materialpbx-helper-probe.mjs" },
  { id: "healthcheck-budget", file: "docker-compose.yml", includes: "timeout: 40s" },
  { id: "control-plane-health-dependency", file: "docker-compose.yml", includes: "pbx:\n        condition: service_healthy" },
  { id: "helper-socket-pbx-mount", file: "docker-compose.yml", includes: "materialpbx-helper-socket:/var/lib/materialpbx-helper\n      - materialpbx-helper-runtime:/opt/materialpbx-helper:ro" },
  { id: "control-plane-dsn-state", file: "docker-compose.yml", includes: "FREEPBX_DATABASE_DSN_FILE: /var/lib/materialpbx/control-plane/freepbx-dsn" },
  { id: "control-plane-helper-socket", file: "docker-compose.yml", includes: "PRIVILEGED_HELPER_SOCKET: /var/lib/materialpbx-helper/privileged.sock" },
  { id: "integration-secret-default", file: "deploy/pbx/materialpbx-configure-integrations.sh", includes: "MATERIALPBX_SECRETS_DIR:-/etc/materialpbx/secrets-input" },
  { id: "integration-state-default", file: "deploy/pbx/materialpbx-configure-integrations.sh", includes: "MATERIALPBX_CONTROL_STATE_DIR:-/var/lib/materialpbx/control-plane" },
  { id: "integration-atomic-config", file: "deploy/pbx/materialpbx-configure-integrations.sh", includes: "mv -f \"$http_temp\" /etc/asterisk/http_custom.conf" },
  { id: "integration-atomic-dsn", file: "deploy/pbx/materialpbx-configure-integrations.sh", includes: "if (!rename($temporary, $path))" },
  { id: "integration-dsn-prepublish-owner", file: "deploy/pbx/materialpbx-configure-integrations.sh", includes: "if (!chown($temporary, $uid) || !chgrp($temporary, $gid))" },
  { id: "integration-dynamic-native-identity", file: "deploy/pbx/materialpbx-configure-integrations.sh", includes: "MATERIALPBX_CONTROL_UID:-991" },
  { id: "integration-reload-deadline", file: "deploy/pbx/materialpbx-configure-integrations.sh", includes: "timeout 180s fwconsole reload --quiet" },
  { id: "credential-preflight", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "/usr/local/libexec/materialpbx-configure-integrations.sh --check" },
  { id: "base-marker", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "base_marker=/var/lib/materialpbx/freepbx-base-installed" },
  { id: "final-marker", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "marker=/var/lib/materialpbx/freepbx-installed" },
  { id: "atomic-marker-write", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "write_marker \"$marker\" ready" },
  { id: "base-marker-validation", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "if [ -e \"$base_marker\" ] && ! base_marker_valid" },
  { id: "production-native-bootstrap", file: "deploy/production-bootstrap.sh", includes: "deployment_marker=/var/lib/materialpbx/native-production-installed" },
  { id: "production-container-refusal", file: "deploy/production-bootstrap.sh", includes: "systemd-detect-virt --quiet --container" },
  { id: "production-pinned-installer", file: "deploy/production-bootstrap.sh", includes: "installer_sha256=afef5e4b480cf545b2035f92068dc2fdd32452989d170a16a84acb6e37b7d564" },
  { id: "production-installer-deadline", file: "deploy/production-bootstrap.sh", includes: "timeout --foreground 90m \"$installer_path\" --skipversion" },
  { id: "production-partial-install-refusal", file: "deploy/production-bootstrap.sh", includes: "A partial FreePBX installation was detected" },
  { id: "production-existing-data-preservation", file: "deploy/production-bootstrap.sh", includes: "Existing FreePBX installation detected; the upstream installer will not be replayed." },
  { id: "production-runtime-identity", file: "deploy/production-bootstrap.sh", includes: "test -f /var/www/html/admin/bootstrap.php" },
  { id: "production-schema-identity", file: "deploy/production-bootstrap.sh", includes: "existing_inventory=$(timeout 30s fwconsole ma list" },
  { id: "production-global-root-lock", file: "deploy/production-bootstrap.sh", includes: "flock -n 9 || fail \"Another MaterialPBX production bootstrap is already active.\" 75" },
  { id: "production-freepbx-major-preflight", file: "deploy/production-bootstrap.sh", includes: "The existing PBX is not supported FreePBX 17; automatic mutation was refused." },
  { id: "production-asterisk-major-preflight", file: "deploy/production-bootstrap.sh", includes: "18|20|21|22" },
  { id: "production-conflicting-workload-preflight", file: "deploy/production-bootstrap.sh", includes: "for conflicting_unit in freeswitch.service" },
  { id: "production-identity-collision-preflight", file: "deploy/production-bootstrap.sh", includes: "validate_existing_identity() {" },
  { id: "production-service-wiring", file: "deploy/production-bootstrap.sh", includes: "systemctl enable freepbx.service" },
  { id: "production-guided-command-doc", file: "docs/architecture/deployment.md", includes: "sudo sh ./deploy/production-bootstrap.sh pbx.example.net" },
  { id: "production-control-plane-wiring-doc", file: "docs/architecture/deployment.md", includes: "installs the bundled MaterialPBX control plane and bounded privileged helper as hardened systemd services" },
  { id: "lab-disposable-boundary-doc", file: "docs/architecture/deployment.md", includes: "for disposable desktop evaluation and development only" },
  { id: "production-module-install", file: "deploy/production-bootstrap.sh", includes: "timeout 300s fwconsole ma install materialpbx || fail \"The MaterialPBX module installation failed; automatic file rollback will run when a previous module exists.\" 70" },
  { id: "production-trusted-module-stage", file: "deploy/production-bootstrap.sh", includes: "chown -R root:root \"$module_stage\"" },
  { id: "production-module-transaction", file: "deploy/production-bootstrap.sh", includes: "else\n  module_replacement_active=true\nfi\nmv -- \"$module_stage\" \"$module_target\"" },
  { id: "production-atomic-marker", file: "deploy/production-bootstrap.sh", includes: "mv -f \"$marker_temp\" \"$deployment_marker\"" },
  { id: "native-bundled-payload", file: "deploy/production-bootstrap.sh", includes: "payload_dir=${MATERIALPBX_NATIVE_PAYLOAD_DIR:-$repo_root/dist/native-services}" },
  { id: "native-outer-payload-digest", file: "deploy/production-bootstrap.sh", includes: "sha256sum -c manifest.sha256" },
  { id: "native-control-inner-payload-digest", file: "deploy/production-bootstrap.sh", includes: "validate_generation \"$control_generation\" \"$control_payload_sha\"" },
  { id: "native-helper-inner-payload-digest", file: "deploy/production-bootstrap.sh", includes: "validate_generation \"$helper_generation\" \"$helper_payload_sha\"" },
  { id: "native-archive-path-refusal", file: "deploy/production-bootstrap.sh", includes: "archive_safe() {\n  archive=$1" },
  { id: "native-immutable-code", file: "deploy/production-bootstrap.sh", includes: "chown -R root:root \"$destination\"" },
  { id: "native-code-backup", file: "deploy/production-bootstrap.sh", includes: "service_transaction_root=\"/opt/materialpbx/transactions/$timestamp\"" },
  { id: "native-code-rollback", file: "deploy/production-bootstrap.sh", includes: "rollback_service_transaction() {\n  [ \"$service_transaction_active\" = true ] || return 0" },
  { id: "native-idempotent-code-reuse", file: "deploy/production-bootstrap.sh", includes: "atomic_link \"$control_generation\" \"$control_link\"" },
  { id: "native-transaction-snapshot", file: "deploy/production-bootstrap.sh", includes: "snapshot_file control-unit /etc/systemd/system/materialpbx-control-plane.service" },
  { id: "native-stop-inactive-verification", file: "deploy/production-bootstrap.sh", includes: "The control plane remained active after its stop request." },
  { id: "native-new-pid-verification", file: "deploy/production-bootstrap.sh", includes: "The control plane did not start a new process for this generation." },
  { id: "native-helper-process-attestation", file: "deploy/production-bootstrap.sh", includes: "probe_helper_attestation system.identity \"$helper_installed_manifest_sha\"" },
  { id: "native-authenticated-readiness", file: "deploy/production-bootstrap.sh", includes: "http://127.0.0.1:${control_port}/readyz" },
  { id: "native-control-identity", file: "deploy/production-bootstrap.sh", includes: "useradd --system --gid materialpbx-control" },
  { id: "native-root-secret-mode", file: "deploy/production-bootstrap.sh", includes: "test \"$(stat -c '%a:%U:%G' \"$secret_path\")\" = '600:root:root'" },
  { id: "native-dsn-from-freepbx", file: "deploy/production-bootstrap.sh", includes: "MATERIALPBX_CONTROL_UID=0 \\\nMATERIALPBX_CONTROL_GID=0" },
  { id: "native-helper-socket-mode", file: "deploy/production-bootstrap.sh", includes: "'660:root:materialpbx-socket'" },
  { id: "native-bounded-helper-probes", file: "deploy/production-bootstrap.sh", includes: "for operation in fwconsole.version asterisk.version system.capabilities" },
  { id: "native-loopback-health", file: "deploy/production-bootstrap.sh", includes: "healthz\" | grep -Fq '\"status\":\"ok\"' || fail \"The native MaterialPBX control-plane health probe did not succeed." },
  { id: "native-control-unit-user", file: "deploy/native/materialpbx-control-plane.service", includes: "User=materialpbx-control" },
  { id: "native-control-unit-bind", file: "deploy/production-bootstrap.sh", includes: "MATERIALPBX_BIND=127.0.0.1" },
  { id: "native-control-credentials", file: "deploy/native/materialpbx-control-plane.service", includes: "LoadCredential=freepbx-dsn:/etc/materialpbx/secrets/freepbx-dsn" },
  { id: "native-control-no-capabilities", file: "deploy/native/materialpbx-control-plane.service", includes: "CapabilityBoundingSet=" },
  { id: "native-helper-explicit-root", file: "deploy/native/materialpbx-privileged-helper.service", includes: "User=root" },
  { id: "native-helper-filesystem-boundary", file: "deploy/native/materialpbx-privileged-helper.service", includes: "ProtectSystem=strict" },
  { id: "native-helper-control-group-kill", file: "deploy/native/materialpbx-privileged-helper.service", includes: "KillMode=control-group" },
  { id: "native-helper-task-bound", file: "deploy/native/materialpbx-privileged-helper.service", includes: "TasksMax=256" },
  { id: "native-control-memory-bound", file: "deploy/native/materialpbx-control-plane.service", includes: "MemoryMax=512M" },
  { id: "native-helper-runtime-directory", file: "deploy/native/materialpbx-prepare-helper-runtime.sh", includes: "install -d -o root -g materialpbx-socket -m 0750 /run/materialpbx" },
  { id: "native-lockfile-injected-workspace", file: "pnpm-workspace.yaml", includes: "injectWorkspacePackages: true" },
  { id: "native-offline-production-deploy", file: "deploy/native/build-service-payloads.sh", includes: 'pnpm --offline --filter "@materialpbx/$service" deploy --prod "$deploy_stage"' },
  { id: "native-deployed-dependency-dereference", file: "deploy/native/build-service-payloads.sh", includes: 'cp -aL "$deploy_stage/node_modules" "$bundle_stage/node_modules"' },
  { id: "native-unused-virtual-store-prune", file: "deploy/native/build-service-payloads.sh", includes: 'rm -rf -- "$bundle_stage/node_modules/.pnpm"' },
  { id: "native-hidden-build-metadata-prune", file: "deploy/native/build-service-payloads.sh", includes: 'find "$bundle_stage" -mindepth 1 -name \'.*\' -exec rm -rf -- {} +' },
  { id: "native-unused-thread-stream-test-prune", file: "deploy/native/build-service-payloads.sh", includes: 'find "$bundle_stage/node_modules" -type d -path \'*/thread-stream/test\' -prune -exec rm -rf -- {} +' },
  { id: "native-payload-file-manifest", file: "deploy/native/build-service-payloads.sh", includes: "find . -type f ! -path './dist/payload-files.sha256' -printf '%P\\0'" },
  { id: "native-payload-last-good-restore", file: "deploy/native/build-service-payloads.sh", includes: "the last-good output could not be restored" },
  { id: "lab-compose-root-anchor", file: "deploy/bootstrap.sh", includes: "docker compose --project-directory \"$repo_root\" --file \"$compose_file\" --profile lab build --pull" },
  { id: "lab-phase-journal", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "phase_journal=/var/lib/materialpbx/freepbx-bootstrap-state" },
  { id: "lab-pre-marker-journal", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "write_phase installer-running" },
  { id: "lab-partial-state-refusal", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "Persistent FreePBX, MariaDB, Asterisk, or web state exists without a trusted bootstrap journal" },
  { id: "lab-helper-strict-filesystem", file: "deploy/pbx/materialpbx-privileged-helper.service", includes: "ProtectSystem=strict" },
  { id: "lab-vm-isolation-doc", file: "docs/architecture/deployment.md", includes: "dedicated disposable virtual machine" },
  { id: "helper-fail-closed-socket-gid", file: "services/privileged-helper/src/server.ts", includes: "MATERIALPBX_SOCKET_GID must be a positive numeric group ID" },
  { id: "helper-connection-bound", file: "services/privileged-helper/src/server.ts", includes: "const maximumConnections = 32;" },
  { id: "helper-idle-deadline", file: "services/privileged-helper/src/server.ts", includes: "socket.setTimeout(requestIdleTimeoutMs);" },
  { id: "helper-process-group", file: "services/privileged-helper/src/server.ts", includes: "detached: process.platform !== \"win32\"" },
  { id: "helper-immutable-request-snapshot", file: "services/privileged-helper/src/server.ts", includes: "String(requestSnapshot.snapshot.expectedRevision)]," },
  { id: "helper-root-binding-validation", file: "services/privileged-helper/src/server.ts", includes: "The root consumer confirmed a different desired-state request binding" },
  { id: "helper-installed-manifest-identity", file: "services/privileged-helper/src/payload-identity.ts", includes: "The installed payload manifest digest is an invalid placeholder" },
  { id: "helper-serialized-mutations", file: "services/privileged-helper/src/server.ts", includes: "async function serializeMutation<T>(action: () => Promise<T>)" },
  { id: "helper-bounded-mutation-queue", file: "services/privileged-helper/src/server.ts", includes: "queuedMutations >= 16" },
  { id: "lab-pbx-profile-boundary", file: "docker-compose.yml", includes: "pbx:\n    profiles: [\"lab\"]" },
  { id: "lab-helper-profile-boundary", file: "docker-compose.yml", includes: "privileged-helper-image:\n    profiles: [\"lab\"]" },
  { id: "lab-control-profile-boundary", file: "docker-compose.yml", includes: "control-plane:\n    profiles: [\"lab\"]" },
  { id: "lab-recreate-refusal", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "A disposable lab container was recreated after initialization" },
  { id: "per-boot-reconciliation", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "rm -f -- \"$marker\"" },
  { id: "bounded-installer", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "timeout --foreground 45m /usr/local/libexec/freepbx17-install.sh" },
  { id: "functional-mariadb-probe", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "mariadb-admin --protocol=socket ping --silent" },
  { id: "functional-redis-probe", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "timeout 5s redis-cli ping" },
  { id: "bounded-module-probe", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "module_inventory=$(timeout 20s fwconsole ma list" },
  { id: "helper-readiness", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "wait_for 'the privileged helper' helper_ready" },
  { id: "helper-control-plane-identity", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "/usr/bin/setpriv --reuid=991 --regid=991 --clear-groups /usr/bin/node /usr/local/libexec/materialpbx-helper-probe.mjs" },
  { id: "elapsed-readiness-budget", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "deadline=$(($(date +%s) + 120))" },
  { id: "integration-readiness", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "wait_for 'the generated integration files' integrations_ready" },
  { id: "fail2ban-host-boundary", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "systemctl disable --now fail2ban.service" },
  { id: "fail2ban-reset-best-effort", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "systemctl reset-failed fail2ban.service >/dev/null 2>&1 || true" },
  { id: "fail2ban-verification", file: "deploy/pbx/materialpbx-firstboot.sh", includes: "fail2ban_enablement=$(systemctl is-enabled fail2ban.service" },
  { id: "finite-firstboot-unit", file: "deploy/pbx/materialpbx-firstboot.service", includes: "TimeoutStartSec=90min" },
  { id: "helper-runtime-image", file: "deploy/pbx/Dockerfile", includes: "COPY deploy/pbx/materialpbx-helper-probe.mjs /usr/local/libexec/materialpbx-helper-probe.mjs" },
  { id: "runtime-service-start-policy", file: "deploy/pbx/Dockerfile", includes: "rm -f /usr/sbin/policy-rc.d" },
  { id: "mariadb-container-dropin", file: "deploy/pbx/Dockerfile", includes: "COPY deploy/pbx/mariadb-container.conf /etc/systemd/system/mariadb.service.d/materialpbx-container.conf" },
  { id: "redis-container-dropin", file: "deploy/pbx/Dockerfile", includes: "COPY deploy/pbx/redis-container.conf /etc/systemd/system/redis-server.service.d/materialpbx-container.conf" },
  { id: "mariadb-least-privilege", file: "deploy/pbx/mariadb-container.conf", includes: "AmbientCapabilities=" },
  { id: "redis-container-user-boundary", file: "deploy/pbx/redis-container.conf", includes: "PrivateUsers=false" },
  { id: "systemd-container-identity", file: "deploy/pbx/Dockerfile", includes: "ENV container=docker" },
  { id: "systemd-capability-drop-authority", file: "docker-compose.yml", includes: "- SETPCAP" },
  { id: "systemd-pid-one", file: "deploy/pbx/Dockerfile", includes: "ENTRYPOINT [\"/sbin/init\"]" },
  { id: "helper-live-probe", file: "deploy/pbx/materialpbx-helper-probe.mjs", includes: "MATERIALPBX_HELPER_PROBE_OPERATION" },
  { id: "helper-runtime-preflight", file: "deploy/pbx/materialpbx-privileged-helper.service", includes: "ExecStartPre=/usr/bin/test -s /opt/materialpbx-helper/dist/server.js" },
  { id: "helper-service-socket", file: "deploy/pbx/materialpbx-privileged-helper.service", includes: "Environment=PRIVILEGED_HELPER_SOCKET=/var/lib/materialpbx-helper/privileged.sock" },
  { id: "helper-source-socket", file: "services/privileged-helper/src/server.ts", includes: "process.env.PRIVILEGED_HELPER_SOCKET ?? \"/var/lib/materialpbx-helper/privileged.sock\"" },
  { id: "helper-readiness-gate", file: "services/privileged-helper/src/server.ts", includes: "if (!ready) {" },
  { id: "helper-permission-failure-exit", file: "services/privileged-helper/src/server.ts", includes: "server.close(() => process.exit(1))" },
  { id: "supported-freepbx-probe", file: "services/privileged-helper/src/server.ts", includes: "case \"fwconsole.version\": return { executable: \"/usr/sbin/fwconsole\", args: [\"--version\"]" }
  ,{ id: "control-authenticated-ready-route", file: "services/control-plane/src/server.ts", includes: "server.get(\"/readyz\"" }
  ,{ id: "control-ready-all-settled", file: "services/control-plane/src/server.ts", includes: "await Promise.allSettled([" }
  ,{ id: "control-database-readiness", file: "services/control-plane/src/adapters/cdr.ts", includes: "await this.#requirePool().query(\"SELECT 1\");\n        } catch (firstError)" }
  ,{ id: "control-ami-readiness", file: "services/control-plane/src/adapters/ami.ts", includes: "AmiPingResponseSchema.safeParse(message).success" }
  ,{ id: "control-ari-readiness", file: "services/control-plane/src/adapters/ari.ts", includes: "AriAsteriskInfoSchema.parse(response)" }
  ,{ id: "control-consumer-binding-validation", file: "services/control-plane/src/adapters/freepbx.ts", includes: "The FreePBX consumer confirmed a different desired-state request binding" }
  ,{ id: "control-installed-manifest-identity", file: "services/control-plane/src/payload-identity.ts", includes: "The installed payload manifest digest is an invalid placeholder" }
  ,{ id: "freepbx-snapshot-option", file: "services/freepbx-module/Console/Materialpbx.class.php", includes: "->addOption('request-snapshot', null, InputOption::VALUE_REQUIRED)" }
  ,{ id: "freepbx-canonical-binding", file: "services/freepbx-module/Materialpbx.class.php", includes: "self::assertExactKeys($requestBinding, ['action', 'id', 'kind', 'revision', 'schemaVersion', 'sha256']" }
  ,{ id: "freepbx-snapshot-negative-proof", file: "services/freepbx-module/tests/immutable-request-snapshot.php", includes: "expected-sha256" }
];

const forbidden = [
  { id: "no-run-secret-bind", file: "docker-compose.yml", text: "/run/materialpbx-secrets" },
  { id: "no-run-helper-socket", file: "docker-compose.yml", text: "/run/materialpbx/privileged.sock" },
  { id: "no-dsn-compose-secret", file: "docker-compose.yml", text: "freepbx-dsn:\n    file:" },
  { id: "no-unsupported-status-command", file: "services/privileged-helper/src/server.ts", text: "args: [\"status\", \"--json\"]" },
  { id: "no-condition-marker-skip", file: "deploy/pbx/materialpbx-firstboot.service", text: "ConditionPathExists=!/var/lib/materialpbx/freepbx-installed" },
  { id: "no-infinite-firstboot-unit", file: "deploy/pbx/materialpbx-firstboot.service", text: "TimeoutStartSec=0" },
  { id: "no-direct-config-truncate", file: "deploy/pbx/materialpbx-configure-integrations.sh", text: "cat > /etc/asterisk/" },
  { id: "no-empty-marker-window", file: "deploy/pbx/materialpbx-firstboot.sh", text: "install -m 0600 /dev/null \"$marker\"" },
  { id: "no-systemd-behind-tini", file: "deploy/pbx/Dockerfile", text: "ENTRYPOINT [\"/usr/bin/tini\", \"--\"]" },
  { id: "no-host-generated-dsn", file: "deploy/bootstrap.sh", text: "generate_secret \"$secret_dir/freepbx-dsn\"" },
  { id: "no-production-compose", file: "deploy/production-bootstrap.sh", text: "docker compose" },
  { id: "no-production-database-destruction", file: "deploy/production-bootstrap.sh", text: "DROP DATABASE" },
  { id: "no-production-npm-install", file: "deploy/production-bootstrap.sh", text: "npm install" },
  { id: "no-production-npm-ci", file: "deploy/production-bootstrap.sh", text: "npm ci" },
  { id: "no-payload-builder-npm-install", file: "deploy/native/build-service-payloads.sh", text: "npm install" },
  { id: "no-payload-builder-npm-ci", file: "deploy/native/build-service-payloads.sh", text: "npm ci" },
  { id: "no-native-wildcard-bind", file: "deploy/production-bootstrap.sh", text: "MATERIALPBX_BIND=0.0.0.0" },
  { id: "no-native-open-socket", file: "deploy/production-bootstrap.sh", text: "chmod 0666" },
  { id: "no-false-fwconsole-status-helper", file: "services/privileged-helper/src/server.ts", text: "fwconsole.status" },
  { id: "no-false-fwconsole-status-client", file: "services/control-plane/src/adapters/privileged.ts", text: "fwconsole.status" }
  ,{ id: "no-generated-build-identity", file: "services/privileged-helper/src/server.ts", text: "generated-build-info" }
  ,{ id: "no-environment-payload-digest", file: "services/control-plane/src/payload-identity.ts", text: "process.env.MATERIALPBX_PAYLOAD_SHA" }
  ,{ id: "no-proc-environment-attestation", file: "deploy/production-bootstrap.sh", text: "/proc/$helper_pid/environ" }
];

function inspect(sourceFiles) {
  const problems = [];
  for (const row of requirements) {
    if (!sourceFiles.get(row.file)?.includes(row.includes)) problems.push(row.id);
  }
  for (const row of forbidden) {
    if (sourceFiles.get(row.file)?.includes(row.text)) problems.push(row.id);
  }
  const firstboot = sourceFiles.get("deploy/pbx/materialpbx-firstboot.sh") ?? "";
  const order = [
    firstboot.indexOf("materialpbx-configure-integrations.sh --check"),
    firstboot.indexOf("if [ ! -e \"$phase_journal\" ]; then"),
    firstboot.indexOf('rm -f -- "$marker"'),
    firstboot.indexOf("write_phase installer-running"),
    firstboot.indexOf("apt-get update"),
    firstboot.indexOf('write_marker "$base_marker" base-installed'),
    firstboot.indexOf("write_phase integrations-running"),
    firstboot.indexOf("timeout --foreground 240s /usr/local/libexec/materialpbx-configure-integrations.sh"),
    firstboot.indexOf("wait_for 'the privileged helper' helper_ready"),
    firstboot.lastIndexOf('write_marker "$marker" ready'),
    firstboot.lastIndexOf("write_phase ready")
  ];
  if (order.some(value => value < 0) || order.some((value, index) => index > 0 && value <= order[index - 1])) problems.push("firstboot-order");
  const production = sourceFiles.get("deploy/production-bootstrap.sh") ?? "";
  const productionOrder = [
    production.indexOf("Another MaterialPBX production bootstrap is already active."),
    production.indexOf("A partial FreePBX installation was detected"),
    production.indexOf('timeout --foreground 90m "$installer_path" --skipversion'),
    production.indexOf("fwconsole ma install materialpbx", production.indexOf('timeout --foreground 90m "$installer_path" --skipversion')),
    production.indexOf("service_transaction_active=true"),
    production.indexOf('atomic_link "$control_generation" "$control_link"'),
    production.indexOf("timeout 45s systemctl start materialpbx-privileged-helper.service", production.indexOf('atomic_link "$control_generation" "$control_link"')),
    production.indexOf('probe_helper_attestation system.identity "$helper_installed_manifest_sha"'),
    production.indexOf("timeout 45s systemctl start materialpbx-control-plane.service", production.indexOf('probe_helper_attestation system.identity "$helper_installed_manifest_sha"')),
    production.indexOf("http://127.0.0.1:${control_port}/readyz"),
    production.indexOf('mv -f "$services_marker_temp" "$services_marker"'),
    production.lastIndexOf('mv -f "$marker_temp" "$deployment_marker"')
  ];
  if (productionOrder.some(value => value < 0) || productionOrder.some((value, index) => index > 0 && value <= productionOrder[index - 1])) problems.push("production-bootstrap-order");
  return problems;
}

const problems = inspect(files);
if (problems.length) throw new Error(`Runtime mount contract failed: ${problems.join(", ")}`);

for (const row of requirements) {
  const mutated = new Map(files);
  mutated.set(row.file, files.get(row.file).replace(row.includes, `REMOVED_CONTRACT_ROW_${row.id}`));
  const result = inspect(mutated);
  if (!result.includes(row.id)) throw new Error(`Negative regression did not fail for ${row.id}`);
}

for (const row of forbidden) {
  const mutated = new Map(files);
  mutated.set(row.file, `${files.get(row.file)}\n${row.text}\n`);
  const result = inspect(mutated);
  if (!result.includes(row.id)) throw new Error(`Negative regression did not fail for ${row.id}`);
}

console.log(`Runtime mount contract passed: ${requirements.length} required rows and ${forbidden.length} forbidden rows; every negative regression turned red.`);
