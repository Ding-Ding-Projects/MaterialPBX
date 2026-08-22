#!/bin/sh
set -eu

marker=/var/lib/materialpbx/freepbx-installed
base_marker=/var/lib/materialpbx/freepbx-base-installed
phase_journal=/var/lib/materialpbx/freepbx-bootstrap-state
container_identity_file=/etc/materialpbx-container-instance
lock=/run/materialpbx-firstboot.lock
installer_sha256=afef5e4b480cf545b2035f92068dc2fdd32452989d170a16a84acb6e37b7d564
module_version=0.1.0
marker_schema=1
journal_schema=1
socket_group=materialpbx-socket
socket_gid=991
marker_temp=

cleanup() {
  if [ -n "$marker_temp" ]; then rm -f -- "$marker_temp"; fi
}
trap cleanup EXIT HUP INT TERM

write_marker() {
  destination=$1
  stage=$2
  marker_temp=$(mktemp "${destination}.tmp.XXXXXX")
  {
    printf 'schema=%s\n' "$marker_schema"
    printf 'stage=%s\n' "$stage"
    printf 'installer_sha256=%s\n' "$installer_sha256"
    printf 'module_version=%s\n' "$module_version"
    printf 'completed_at=%s\n' "$(date -u +%FT%TZ)"
  } > "$marker_temp"
  chmod 0600 "$marker_temp"
  test -s "$marker_temp"
  mv -f "$marker_temp" "$destination"
  marker_temp=
}

write_phase() {
  phase=$1
  marker_temp=$(mktemp "${phase_journal}.tmp.XXXXXX")
  {
    printf 'schema=%s\n' "$journal_schema"
    printf 'phase=%s\n' "$phase"
    printf 'image_identity=%s\n' "$image_identity"
    printf 'runtime_identity=%s\n' "$runtime_identity"
    printf 'container_identity=%s\n' "$container_identity"
    printf 'installer_sha256=%s\n' "$installer_sha256"
    printf 'module_version=%s\n' "$module_version"
    printf 'updated_at=%s\n' "$(date -u +%FT%TZ)"
  } > "$marker_temp"
  chmod 0600 "$marker_temp"
  test -s "$marker_temp"
  mv -f "$marker_temp" "$phase_journal"
  marker_temp=
}

journal_field_equals() {
  key=$1
  value=$2
  test "$(grep -Fxc "$key=$value" "$phase_journal")" -eq 1
}

journal_contract_valid() {
  test -f "$phase_journal" && test ! -L "$phase_journal" &&
    test "$(stat -c '%a:%u:%g' "$phase_journal")" = '600:0:0' &&
    test "$(wc -l < "$phase_journal")" -eq 8 &&
    test "$(grep -Ec '^(schema|phase|image_identity|runtime_identity|container_identity|installer_sha256|module_version|updated_at)=' "$phase_journal")" -eq 8 &&
    journal_field_equals schema "$journal_schema" &&
    journal_field_equals installer_sha256 "$installer_sha256" &&
    journal_field_equals module_version "$module_version" &&
    test "$(grep -Ec '^phase=(untouched|installer-running|base-installed|integrations-running|ready)$' "$phase_journal")" -eq 1 &&
    test "$(grep -Ec '^image_identity=[0-9a-f]{64}$' "$phase_journal")" -eq 1 &&
    test "$(grep -Ec '^runtime_identity=[0-9a-f]{64}$' "$phase_journal")" -eq 1 &&
    test "$(grep -Ec '^container_identity=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "$phase_journal")" -eq 1
}

journal_value() {
  key=$1
  sed -n "s/^${key}=//p" "$phase_journal"
}

path_has_state() {
  path=$1
  test -d "$path" || return 1
  find "$path" -mindepth 1 -maxdepth 1 ! -name lost+found -print -quit | grep -q .
}

persistent_pbx_state_present() {
  for path in /var/lib/mysql /etc/asterisk /var/lib/asterisk /var/spool/asterisk /var/www; do
    path_has_state "$path" && return 0
  done
  find /var/lib/materialpbx -mindepth 1 -maxdepth 1 ! -name "$(basename "$phase_journal")" ! -name lost+found -print -quit | grep -q .
}

initialize_identities() {
  if [ ! -e "$container_identity_file" ]; then
    marker_temp=$(mktemp "${container_identity_file}.tmp.XXXXXX")
    tr 'A-F' 'a-f' < /proc/sys/kernel/random/uuid > "$marker_temp"
    chmod 0600 "$marker_temp"
    mv -f "$marker_temp" "$container_identity_file"
    marker_temp=
  fi
  test -f "$container_identity_file" && test ! -L "$container_identity_file" || {
    echo "The container-instance identity is not a regular file." >&2
    exit 78
  }
  test "$(stat -c '%a:%u:%g' "$container_identity_file")" = '600:0:0' || {
    echo "The container-instance identity has unsafe ownership or permissions." >&2
    exit 78
  }
  container_identity=$(cat "$container_identity_file")
  printf '%s\n' "$container_identity" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' || {
    echo "The container-instance identity is malformed." >&2
    exit 78
  }
  image_identity=$(
    sha256sum \
      /usr/local/libexec/freepbx17-install.sh \
      /usr/local/libexec/materialpbx-firstboot.sh \
      /usr/local/libexec/materialpbx-configure-integrations.sh \
      /usr/local/libexec/materialpbx-helper-probe.mjs \
      /etc/systemd/system/materialpbx-firstboot.service \
      /etc/systemd/system/materialpbx-privileged-helper.service \
      /usr/src/materialpbx-freepbx-module/module.xml | sha256sum | cut -d' ' -f1
  )
  runtime_identity=$(
    {
      printf '%s  image-payload\n' "$image_identity"
      sha256sum /opt/materialpbx-helper/dist/server.js
    } | sha256sum | cut -d' ' -f1
  )
  if ! printf '%s\n' "$image_identity" | grep -Eq '^[0-9a-f]{64}$' ||
    ! printf '%s\n' "$runtime_identity" | grep -Eq '^[0-9a-f]{64}$'; then
    echo "The lab runtime identity could not be calculated." >&2
    exit 65
  fi
}

ensure_socket_identity() {
  if ! command -v getent >/dev/null 2>&1 || ! command -v groupadd >/dev/null 2>&1; then
    echo "The fixed privileged-helper socket identity tools are unavailable." >&2
    exit 69
  fi
  group_by_name=$(getent group "$socket_group" || true)
  group_by_gid=$(getent group "$socket_gid" || true)
  if [ -z "$group_by_name" ] && [ -z "$group_by_gid" ]; then
    groupadd --system --gid "$socket_gid" "$socket_group"
    group_by_name=$(getent group "$socket_group" || true)
    group_by_gid=$(getent group "$socket_gid" || true)
  fi
  test -n "$group_by_name" && test "$group_by_name" = "$group_by_gid" || {
    echo "The fixed privileged-helper socket group identity conflicts with an existing account." >&2
    exit 78
  }
  test "$(printf '%s\n' "$group_by_name" | cut -d: -f3)" = "$socket_gid" || {
    echo "The privileged-helper socket group has the wrong numeric identity." >&2
    exit 78
  }
  test -z "$(printf '%s\n' "$group_by_name" | cut -d: -f4)" || {
    echo "The privileged-helper socket group has unexpected local members." >&2
    exit 78
  }
}

base_marker_valid() {
  test -s "$base_marker" &&
    grep -Fxq "schema=$marker_schema" "$base_marker" &&
    grep -Fxq 'stage=base-installed' "$base_marker" &&
    grep -Fxq "installer_sha256=$installer_sha256" "$base_marker" &&
    grep -Fxq "module_version=$module_version" "$base_marker"
}

module_ready() {
  module_inventory=$(timeout 20s fwconsole ma list 2>/dev/null) || return 1
  printf '%s\n' "$module_inventory" | grep -Eiq '^\|[[:space:]]*materialpbx[[:space:]]*\|[^|]*\|[[:space:]]*Enabled[[:space:]]*\|'
}

runtime_payload_ready() {
  test -x /usr/sbin/fwconsole &&
    test -x /usr/sbin/asterisk &&
    test -x /usr/bin/php &&
    test -x /usr/bin/mariadb &&
    test -f /lib/systemd/system/freepbx.service
}

mariadb_ready() {
  timeout 5s mariadb-admin --protocol=socket ping --silent >/dev/null 2>&1
}

redis_ready() {
  test "$(timeout 5s redis-cli ping 2>/dev/null)" = PONG
}

http_ready() {
  timeout 10s curl --fail --silent --show-error --max-time 5 http://127.0.0.1/admin/config.php >/dev/null
}

asterisk_ready() {
  timeout 10s asterisk -rx 'core show version' >/dev/null 2>&1
}

helper_ready() {
  systemctl is-active --quiet materialpbx-privileged-helper.service &&
    test -S /var/lib/materialpbx-helper/privileged.sock &&
    timeout 10s /usr/bin/setpriv --reuid=991 --regid=991 --clear-groups /usr/bin/node /usr/local/libexec/materialpbx-helper-probe.mjs
}

integrations_ready() {
  for file in /etc/asterisk/manager_custom.conf /etc/asterisk/ari_custom.conf /etc/asterisk/http_custom.conf; do
    test -s "$file" || return 1
    test "$(stat -c '%a:%U:%G' "$file")" = '640:root:asterisk' || return 1
  done
  test -s /var/lib/materialpbx/control-plane/freepbx-dsn || return 1
  test "$(stat -c '%a:%u:%g' /var/lib/materialpbx/control-plane/freepbx-dsn)" = '600:991:991' || return 1
  grep -Fxq 'bindaddr=127.0.0.1' /etc/asterisk/http_custom.conf &&
    grep -Fxq 'permit=127.0.0.1/255.255.255.255' /etc/asterisk/manager_custom.conf &&
    grep -Fxq 'type=user' /etc/asterisk/ari_custom.conf
}

wait_for() {
  label=$1
  shift
  deadline=$(($(date +%s) + 120))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if "$@"; then return 0; fi
    sleep 2
  done
  echo "Timed out waiting for $label." >&2
  return 1
}

mkdir -p /var/lib/materialpbx
exec 9>"$lock"
flock -n 9 || { echo "Another first-boot installation is already active." >&2; exit 75; }

test "$(dpkg --print-architecture)" = amd64 || { echo "MaterialPBX currently supports Debian 12 amd64 only." >&2; exit 64; }
/usr/local/libexec/materialpbx-configure-integrations.sh --check
test "$(sha256sum /usr/local/libexec/freepbx17-install.sh | cut -d' ' -f1)" = "$installer_sha256" || {
  echo "The pinned FreePBX installer digest does not match." >&2
  exit 65
}
grep -Fxq "  <version>$module_version</version>" /usr/src/materialpbx-freepbx-module/module.xml || {
  echo "The MaterialPBX module version does not match the first-boot contract." >&2
  exit 65
}
test -s /opt/materialpbx-helper/dist/server.js || { echo "The privileged-helper runtime is unavailable." >&2; exit 69; }
initialize_identities

if [ ! -e "$phase_journal" ]; then
  if persistent_pbx_state_present; then
    echo "Persistent FreePBX, MariaDB, Asterisk, or web state exists without a trusted bootstrap journal. Automatic installer replay was refused; preserve the volumes for reviewed recovery." >&2
    exit 78
  fi
  write_phase untouched
elif ! journal_contract_valid; then
  echo "The persisted bootstrap journal is malformed or has unsafe ownership. Automatic installer replay was refused." >&2
  exit 78
fi

bootstrap_phase=$(journal_value phase)
stored_runtime_identity=$(journal_value runtime_identity)
stored_image_identity=$(journal_value image_identity)
stored_container_identity=$(journal_value container_identity)
if [ "$bootstrap_phase" = untouched ]; then
  if persistent_pbx_state_present; then
    echo "The bootstrap journal says untouched, but persistent PBX state is present. Automatic installer replay was refused." >&2
    exit 78
  fi
  if [ "$stored_image_identity" != "$image_identity" ] || [ "$stored_runtime_identity" != "$runtime_identity" ] || [ "$stored_container_identity" != "$container_identity" ]; then
    write_phase untouched
  fi
elif [ "$stored_image_identity" != "$image_identity" ] || [ "$stored_runtime_identity" != "$runtime_identity" ]; then
  echo "The persisted bootstrap journal belongs to a different lab runtime. Automatic installer replay was refused." >&2
  exit 78
elif [ "$stored_container_identity" != "$container_identity" ]; then
  echo "The persisted bootstrap journal belongs to a different container instance. Automatic installer replay over surviving PBX state was refused." >&2
  exit 78
fi

if [ -e "$base_marker" ] && ! base_marker_valid; then
  echo "The persisted FreePBX base marker does not match this image. A reviewed migration is required; automatic reinstallation was refused." >&2
  exit 78
fi

if [ -e "$base_marker" ] && ! runtime_payload_ready; then
  echo "A disposable lab container was recreated after initialization. Its package layer is not production state; automatic installer replay over surviving PBX data was refused. Restore the named volumes into a native production host with deploy/production-bootstrap.sh." >&2
  exit 78
fi

if [ -e "$base_marker" ] && [ "$(journal_value phase)" = installer-running ]; then
  write_phase base-installed
fi
case "$(journal_value phase):$(test -e "$base_marker" && printf present || printf absent)" in
  untouched:absent|installer-running:absent|base-installed:present|integrations-running:present|ready:present) ;;
  *) echo "The persisted bootstrap phase and FreePBX base marker disagree. Automatic recovery was refused." >&2; exit 78;;
esac
rm -f -- "$marker"

if [ ! -e "$base_marker" ]; then
  write_phase installer-running
  echo "Starting the pinned FreePBX 17 installer. Detailed logs are written by the upstream installer under /var/log/pbx/."
  timeout --foreground 10m apt-get update >/dev/null
  timeout --foreground 45m /usr/local/libexec/freepbx17-install.sh
  timeout 120s systemctl start mariadb.service redis-server.service apache2.service
  timeout 300s fwconsole start >/dev/null
  timeout 20s fwconsole --version >/dev/null
  asterisk_ready
  rm -rf /var/www/html/admin/modules/materialpbx
  install -d -m 0755 /var/www/html/admin/modules/materialpbx
  cp -a /usr/src/materialpbx-freepbx-module/. /var/www/html/admin/modules/materialpbx/
  timeout 300s fwconsole ma install materialpbx
  module_ready
  write_marker "$base_marker" base-installed
  write_phase base-installed
else
  test -f /etc/freepbx.conf || { echo "The persisted FreePBX base is missing /etc/freepbx.conf." >&2; exit 78; }
  test -x /usr/sbin/fwconsole || { echo "The persisted FreePBX base is missing fwconsole." >&2; exit 78; }
  timeout 120s systemctl start mariadb.service redis-server.service apache2.service
  timeout 300s fwconsole start >/dev/null
  timeout 20s fwconsole --version >/dev/null
  asterisk_ready
  module_ready
fi

if systemctl list-unit-files fail2ban.service --no-legend 2>/dev/null | grep -q '^fail2ban.service'; then
  timeout 30s systemctl disable --now fail2ban.service >/dev/null
  # disable --now owns the required state. reset-failed is cosmetic and can
  # briefly report "unit not loaded" while the generated SysV unit refreshes.
  timeout 10s systemctl reset-failed fail2ban.service >/dev/null 2>&1 || true
  if systemctl is-active --quiet fail2ban.service; then
    echo "Container-local fail2ban remained active after shutdown." >&2
    exit 1
  fi
  fail2ban_enablement=$(systemctl is-enabled fail2ban.service 2>/dev/null || true)
  case "$fail2ban_enablement" in disabled|masked) ;; *) echo "Container-local fail2ban remained enabled after shutdown." >&2; exit 1;; esac
fi

write_phase integrations-running
ensure_socket_identity
timeout --foreground 240s /usr/local/libexec/materialpbx-configure-integrations.sh
install -d -o root -g "$socket_group" -m 0750 /var/lib/materialpbx-helper
test -x /usr/bin/setpriv || { echo "The numeric-identity helper probe is unavailable." >&2; exit 69; }
timeout 30s systemctl enable --now materialpbx-privileged-helper.service

wait_for MariaDB mariadb_ready
wait_for Redis redis_ready
wait_for Apache http_ready
wait_for Asterisk asterisk_ready
wait_for 'the FreePBX module' module_ready
wait_for 'the privileged helper' helper_ready
wait_for 'the generated integration files' integrations_ready
timeout 20s fwconsole --version >/dev/null

write_marker "$marker" ready
write_phase ready
echo "FreePBX and Asterisk initialized. Host firewall and fail2ban policy remain the host administrator's responsibility."
