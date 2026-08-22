# Debian 12 system-container deployment

## Supported shape

The supplied deployment is an amd64 Debian 12 system-container adaptation of the official FreePBX 17 installer. The pinned source and SHA-256 are recorded in `deploy/dependencies.lock.json`. It is not a Sangoma-supported FreePBX deployment appliance.

The PBX container uses host networking because SIP, RTP, ICE, provider ACLs, and advertised media addresses become unreliable behind generic port mapping. The control-plane sidecar uses `network_mode: service:pbx`, sharing that network namespace without opening an independent path.

The deployment does not use blanket privileged mode, mount the Docker socket, mount the host root filesystem, or claim DAHDI support. The system container receives a reviewed capability set and writable cgroup access so systemd and telephony services can run. This is a broader kernel boundary than an ordinary application container and belongs on a dedicated, patched host.

## One-command onboarding

On a Debian 12 amd64 host with Docker Engine and the Compose plugin:

```sh
sudo ./deploy/bootstrap.sh https://pbx.example.net
```

The bootstrap validates the platform, creates private credential files under `/etc/materialpbx/secrets` by default, builds the pinned images, and starts first boot. It never prints credential values. The upstream installation is lengthy; follow progress with:

```sh
docker compose logs -f pbx
```

First boot verifies the installer digest, runs it once, verifies `fwconsole` and Asterisk, installs the bridge module, configures loopback-only AMI/ARI users, writes a local database DSN into the protected host secret directory, reloads FreePBX, and starts the helper.

## Host-owned networking and intrusion controls

Host networking means the Debian host owns every listening port. Before external use, configure:

- an HTTPS reverse proxy for FreePBX and the control plane;
- firewall allowlists for administration, SIP transports, and the selected RTP range;
- provider source restrictions where stable networks are published;
- fail2ban filters and jails using actual FreePBX/Asterisk logs;
- rate and concurrency limits appropriate to each trunk;
- DNS, certificates, NTP, backup destinations, and monitoring.

The Compose project intentionally does not rewrite nftables, iptables, firewalld, or fail2ban. Container-local rules do not reliably protect host-network sockets, and an automatic firewall edit could disconnect an administrator or conflict with the host source of truth.

## Volumes, secrets, and upgrades

Named volumes retain MariaDB data, Asterisk configuration, prompts and libraries, call spool and recordings, the FreePBX web tree, MaterialPBX state, the helper socket, and helper runtime. Credential files are mounted from the protected host directory and consumed as Compose secrets.

Back up named volumes and protected secrets together. A backup without federation identity or database credentials cannot restore the same identity. A copied secret directory must not enter source control, logs, support bundles, or unencrypted archives.

Updating the pinned installer is an explicit reviewed change. Rebuilding an image does not automatically migrate an installed FreePBX instance. Module and operating-system updates must be staged, backed up, and validated against a copy.

## Limitations

- Only Debian 12 amd64 hosts are supported by the bootstrap.
- DAHDI, PCI/USB telephony cards, timing devices, and kernel modules are not exposed or claimed.
- The control plane binds to loopback and requires separately configured HTTPS publication.
- The official installer targets a full Debian host; service, cgroup, package, and upgrade assumptions can differ in a system container.
- Container construction, first boot, systemd startup, calls, RTP, upgrades, backups, and restores were not verified during the accelerated delivery pass.
- Commercial modules, carrier services, emergency calling, lawful recording, and STIR/SHAKEN require separate licenses, credentials, legal review, and provider configuration.

## Failure recovery

If first boot fails, retain volumes, read `/var/log/pbx/freepbx17-install.log` and the container journal, correct the cause, and restart the PBX container. The marker is written only after FreePBX, Asterisk, bridge installation, and integration configuration succeed. Do not create it manually.

If the sidecar fails, the PBX continues independently. Restore the missing secret, helper socket, volume permission, HTTPS boundary, or database access and restart only the sidecar. Do not widen helper-socket permissions or expose it over TCP.
