# Native Debian 12 production and disposable container lab

## Supported production shape

Hosted production uses a dedicated Debian 12 amd64 host with a persistent root filesystem. The one-click bootstrap pins and verifies the official FreePBX 17 installer, refuses container execution, and installs FreePBX, Asterisk, their services, and the MaterialPBX module directly on that host:

```sh
sudo sh ./deploy/production-bootstrap.sh pbx.example.net
```

The bootstrap is deliberately guarded. A complete existing FreePBX installation is reused without replaying the upstream installer only after its package executables, web runtime, service unit, MariaDB data directory, and live FreePBX framework-module inventory all validate. A partial installation, surviving database directory without a complete runtime, invalid schema identity, or container environment is refused with a recovery message. The completion marker is written atomically only after FreePBX, Asterisk, and the MaterialPBX module are running and verified. Re-running the command on the same complete host refreshes the pinned installer file and module without reinstalling FreePBX or recreating its database.

Back up `/etc`, `/var/lib/mysql`, `/var/lib/asterisk`, `/var/spool/asterisk`, `/var/www`, `/var/lib/materialpbx`, and the host package inventory together before an operating-system, FreePBX, or module upgrade. Restore into a separate Debian 12 host and validate calls, recordings, routes, and module state before replacing the active host. A partial host is never repaired by blindly replaying the upstream installer.

The native path also installs the bundled MaterialPBX control plane and bounded privileged helper as hardened systemd services. Release bundles carry prebuilt service archives produced by `deploy/native/build-service-payloads.sh`; that builder compiles with the repository's already-fetched lockfile state, asks pnpm to deploy the frozen shared-lockfile production graph in offline mode, and dereferences that graph into the immutable payload without a network package installation. The workspace uses pnpm's injected-workspace-package snapshot contract, so deployment consumes the same lockfile and content-addressable store populated by the dependency install instead of re-resolving an npm tarball cache or a pnpm registry-metadata mirror. A source checkout must build those payloads before bootstrap. Production bootstrap rejects a missing payload, an outer or per-file digest mismatch, an unsafe archive path, a symbolic link, a group/world-writable payload, a missing protocol runtime, or a failed Node syntax check.

Service code is root-owned under `/opt/materialpbx`. A changed payload is extracted into a fresh staging directory, verified, and moved into place only after the prior version is preserved under `/var/lib/materialpbx/native-service-backups`. A failed unit start, socket probe, helper capability probe, or control-plane liveness probe triggers cleanup that moves the failed payload aside and restores the prior code when available. Matching payload hashes and installed per-file manifests permit verified idempotent reuse without replacing the code.

The control plane runs as the dedicated `materialpbx-control` system identity with no capabilities and binds only to `127.0.0.1`. Separate supplementary groups grant access only to the helper socket and recordings. The helper remains explicitly root because its bounded allowlist must run `fwconsole` and Asterisk operations, but `ProtectSystem=strict`, explicit writable paths, kernel/control-group protections, and a serialized bounded mutation queue limit that authority. The socket is ephemeral at `/run/materialpbx/privileged.sock`, owned by `root:materialpbx-socket`, and mode `0660`.

Administrator, AMI, ARI, and generated database credential sources remain root-owned mode `0600` below `/etc/materialpbx/secrets`. systemd `LoadCredential` gives the unprivileged service private runtime copies without weakening the sources. The database DSN is regenerated from `/etc/freepbx.conf`; it is never accepted from a marker or a Compose secret. `/healthz` is treated as process liveness only, while separate bounded helper probes verify `fwconsole.version`, `asterisk.version`, and the capability registry from the real control-plane identity.

## Disposable container lab

The supplied Compose deployment is an amd64 Debian 12 system-container adaptation of the official FreePBX 17 installer for disposable desktop evaluation and development only. It is behind the explicit `lab` Compose profile and is not the supported hosted-production path. The pinned source and SHA-256 are recorded in `deploy/dependencies.lock.json`. It is not a Sangoma-supported FreePBX deployment appliance.

The PBX container uses host networking because SIP, RTP, ICE, provider ACLs, and advertised media addresses become unreliable behind generic port mapping. Host networking omits Docker's ordinary hostname entry, so Compose explicitly maps the configured fully qualified PBX hostname to loopback for the official installer's `hostname -f` validation. `/sbin/init` is the direct entrypoint so systemd is PID 1 and can own the service lifecycle. The control-plane sidecar uses `network_mode: service:pbx`, sharing that network namespace without opening an independent path.

The deployment does not use blanket privileged mode, mount the Docker socket, mount the host root filesystem, or claim DAHDI support. It still grants `NET_ADMIN`, `NET_RAW`, `SYS_ADMIN`, host cgroup access, and a writable `/sys/fs/cgroup`. Because the PBX also uses host networking, those network capabilities act in the host network namespace: a compromised or faulty lab container can alter host routes, interfaces, and firewall state. `SYS_ADMIN` and writable cgroups further weaken the isolation boundary. `no-new-privileges` does not remove capabilities that were granted at container creation.

Run this lab only inside a dedicated disposable virtual machine with no unrelated workloads, credentials, or production network trust. Do not run it directly on a general-purpose workstation, shared Docker host, or production server. A dedicated patched bare-metal host reduces collateral impact but is not equivalent to virtual-machine isolation and is not the recommended boundary.

## One-command lab onboarding

On a Debian 12 amd64 host with Docker Engine and the Compose plugin:

```sh
sudo ./deploy/bootstrap.sh https://pbx.example.net
```

The lab bootstrap resolves its own repository root and always supplies both the absolute Compose file and project directory, so invoking the script from another current directory cannot select an unrelated Compose project. A custom `MATERIALPBX_SECRET_DIR` must be an absolute host path and is resolved before Compose receives it, avoiding different source directories between the bootstrap and Compose. The script validates the platform, states the production boundary, creates private credential files under `/etc/materialpbx/secrets` by default, builds the pinned images, and starts first boot through the `lab` profile. It never prints credential values. The helper runtime finishes populating its named volume before the PBX can begin initialization. The upstream installation is lengthy; follow progress with the absolute command printed by the bootstrap. From the repository root, the equivalent is:

```sh
docker compose --profile lab logs -f pbx
```

First boot checks the required AMI and ARI credential files before package installation and verifies the installer digest. It calculates an exact image identity from the installed first-boot scripts, service units, module manifest, and pinned installer, then calculates a separate runtime identity that also incorporates the privileged-helper entry point populated by the helper image. Before the installer can start, an atomic phase journal is written to the persistent MaterialPBX volume with both identities, an ephemeral container-instance identity, installer digest, module version, and phase. The phases are `untouched`, `installer-running`, `base-installed`, `integrations-running`, and `ready`.

An absent journal is accepted only when the MariaDB, Asterisk configuration/library/spool, web, and MaterialPBX data volumes are all untouched. A clean `untouched` journal may be rebound to a rebuilt container only while those volumes remain empty. Once installation starts, retries require the exact same container instance and exact same runtime identity. A recreated container, a changed runtime, a missing or malformed journal, or state that contradicts its phase is refused before installer replay. This preserves bounded retry of a failed installer in the same container without treating marker absence as proof that persistent data is disposable.

After the pinned installer completes, first boot verifies `fwconsole` and Asterisk and installs the bridge module. It records a durable base-install marker and advances the journal so an integration or readiness retry does not repeat the lengthy base installation. The integration phase verifies that numeric GID `991` is the dedicated `materialpbx-socket` group with no unexpected local members, configures loopback-only AMI/ARI users, writes a local database DSN into the private MaterialPBX state volume, reloads FreePBX, starts the helper, and waits within explicit bounds for MariaDB, Redis, Apache, Asterisk, the bridge module, HTTP, and the helper socket. The final marker and `ready` journal phase are written only after every readiness check succeeds.

## Host-owned networking and intrusion controls

Host networking means the Debian host owns every listening port. Before external use, configure:

- an HTTPS reverse proxy for FreePBX and the control plane;
- firewall allowlists for administration, SIP transports, and the selected RTP range;
- provider source restrictions where stable networks are published;
- fail2ban filters and jails using actual FreePBX/Asterisk logs;
- rate and concurrency limits appropriate to each trunk;
- DNS, certificates, NTP, backup destinations, and monitoring.

The Compose project intentionally does not rewrite nftables, iptables, or firewalld. The upstream installer enables fail2ban inside the system container, but that instance has no SSH service and cannot reliably protect host-network sockets. First boot therefore disables and clears only the container-local fail2ban unit; the host remains the source of truth for firewall and fail2ban policy. An automatic host firewall edit could disconnect an administrator or conflict with the host source of truth.

## Lab volumes, secrets, and upgrades

Named volumes retain MariaDB data, Asterisk configuration, prompts and libraries, call spool and recordings, the FreePBX web tree, MaterialPBX state, the helper socket, and helper runtime. They do not retain installed Debian packages, `/usr`, PHP, Apache, systemd unit state, Asterisk executables, or container-local `/etc/freepbx.conf`. Credential files are mounted read-only from the protected host directory at `/etc/materialpbx/secrets-input`; this location deliberately sits outside `/run` because systemd mounts a fresh tmpfs there during startup. The generated database DSN is output state rather than input credential material and is written with mode `0600` under `/var/lib/materialpbx/control-plane`. The helper socket likewise lives under `/var/lib/materialpbx-helper`, outside the systemd-owned runtime tmpfs.

Back up named volumes and protected secrets together. A backup without federation identity or database credentials cannot restore the same identity. A copied secret directory must not enter source control, logs, support bundles, or unencrypted archives.

Updating the pinned installer is an explicit reviewed change. Recreating the lab container after installation has entered `installer-running` is unsupported because the official installer mixes package/service installation with database and site initialization, exposes no package-only mode, and invokes opaque initialization code. First boot refuses a recreated lab container or changed runtime whenever the durable journal records a non-untouched phase; it will not replay the installer over surviving data. Use the native production bootstrap on a persistent host for actual service. Module and operating-system updates must be staged, backed up, and validated against a copy.

## Limitations

- Only Debian 12 amd64 hosts are supported by the bootstrap.
- Hosted production requires the native bootstrap on a persistent host root filesystem; the Compose deployment is disposable lab infrastructure.
- DAHDI, PCI/USB telephony cards, timing devices, and kernel modules are not exposed or claimed.
- The control plane binds to loopback and requires separately configured HTTPS publication.
- The official installer targets a full Debian host; service, cgroup, package, and upgrade assumptions differ in a system container, and force-recreating an initialized lab container is explicitly unsupported.
- The initial disposable first-boot proof established that systemd's `/run` tmpfs can obscure nested Compose mounts. The corrected paths and sequencing are covered by a source contract, but a successful replacement first boot, calls, RTP, upgrades, backups, and restores remain pending until the fresh runtime proof completes.
- Commercial modules, carrier services, emergency calling, lawful recording, and STIR/SHAKEN require separate licenses, credentials, legal review, and provider configuration.

## Failure recovery

If a fresh lab first boot fails after the journal reaches `installer-running` but before the base marker exists, retain the volumes, read `/var/log/pbx/freepbx17-install.log` and the container journal, correct the cause, and restart the same PBX container without force recreation. The instance and runtime identities must still match. A retry in that same container after the base-install marker resumes at integration and readiness. The final marker is written only after FreePBX, Asterisk, bridge installation, integration configuration, and bounded readiness checks succeed. Do not create or edit the journal or either marker manually.

If an initialized lab container was recreated and exits with status 78, do not delete its named volumes and do not replay the installer. Preserve the volumes as recovery input, restore the matching host and runtime from a complete backup when available, or migrate the surviving databases, recordings, and configuration into a separate verified native Debian production host. The volumes alone are not a bootable FreePBX installation.

If the native production bootstrap refuses a partial installation, restore the complete host backup or perform a reviewed migration into a new host. The bootstrap intentionally provides no force flag that could overwrite surviving PBX data.

If the sidecar fails, the PBX continues independently. Restore the missing secret, helper socket, volume permission, HTTPS boundary, or database access and restart only the sidecar. Do not widen helper-socket permissions or expose it over TCP.
