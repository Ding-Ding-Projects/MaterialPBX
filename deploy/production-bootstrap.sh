#!/bin/sh
set -eu

installer_commit=b023b8426786a518d25dfc0d11ba0c0314fcd927
installer_sha256=afef5e4b480cf545b2035f92068dc2fdd32452989d170a16a84acb6e37b7d564
installer_url="https://raw.githubusercontent.com/FreePBX/sng_freepbx_debian_install/${installer_commit}/sng_freepbx_debian_install.sh"
installer_path=/usr/local/libexec/materialpbx/freepbx17-install.sh
deployment_marker=/var/lib/materialpbx/native-production-installed
services_marker=/var/lib/materialpbx/native-services-installed
module_version=0.1.0
module_target=/var/www/html/admin/modules/materialpbx
marker_temp=
module_stage=
module_source_manifest=
module_stage_manifest=
module_backup=
module_failed=
module_replacement_active=false
module_had_previous=false
module_new_active=false
service_stage_root=
service_transaction_active=false
service_links_activated=false
service_snapshot_root=
service_transaction_root=
control_link=/opt/materialpbx/control-plane
helper_link=/opt/materialpbx/privileged-helper
release_root=/opt/materialpbx/releases
control_release_root=$release_root/control-plane
helper_release_root=$release_root/privileged-helper
control_generation=
helper_generation=
control_installed_manifest_sha=
helper_installed_manifest_sha=
control_previous_kind=absent
helper_previous_kind=absent
control_previous_target=
helper_previous_target=
control_legacy_backup=
helper_legacy_backup=
control_was_active=false
helper_was_active=false
control_was_enabled=not-found
helper_was_enabled=not-found
control_previous_pid=0
helper_previous_pid=0
control_previous_started=0
helper_previous_started=0
installer_download=
control_env_temp=
helper_env_temp=
services_marker_temp=
rollback_failed=false

fail() {
  printf '%s\n' "$1" >&2
  exit "${2:-1}"
}

archive_safe() {
  archive=$1
  tar --quoting-style=escape -tzf "$archive" | awk '
    index($0, "\\") != 0 { bad=1 }
    $0 == "" { bad=1 }
    $0 !~ /^\.[/]/ { bad=1 }
    $0 ~ /(^|[/])\.\.([/]|$)/ { bad=1 }
    $0 ~ /[/][/]/ { bad=1 }
    seen[$0]++ { bad=1 }
    END { exit bad ? 1 : 0 }
  ' || return 1
  tar --numeric-owner --quoting-style=escape -tvzf "$archive" | awk '
    {
      mode=$1
      type=substr(mode,1,1)
      if (type != "-" && type != "d") bad=1
      if (mode ~ /[sStT]/) bad=1
      if ($2 != "0/0") bad=1
    }
    END { exit bad ? 1 : 0 }
  '
}

atomic_link() {
  link_target=$1
  link_path=$2
  link_temp="${link_path}.tmp.$$"
  rm -f -- "$link_temp"
  ln -s -- "$link_target" "$link_temp"
  mv -Tf -- "$link_temp" "$link_path"
}

snapshot_file() {
  snapshot_key=$1
  snapshot_path=$2
  if [ -L "$snapshot_path" ]; then fail "Refusing to snapshot symbolic-link configuration path: $snapshot_path" 78; fi
  if [ -f "$snapshot_path" ]; then
    cp -p -- "$snapshot_path" "$service_snapshot_root/$snapshot_key"
  elif [ -e "$snapshot_path" ]; then
    fail "Refusing to snapshot non-regular configuration path: $snapshot_path" 78
  else
    : > "$service_snapshot_root/$snapshot_key.absent"
  fi
}

restore_file() {
  snapshot_key=$1
  snapshot_path=$2
  if [ -f "$service_snapshot_root/$snapshot_key.absent" ]; then
    rm -f -- "$snapshot_path"
    return
  fi
  test -f "$service_snapshot_root/$snapshot_key" || return 1
  restore_dir=$(dirname -- "$snapshot_path")
  test -d "$restore_dir" && test ! -L "$restore_dir" || return 1
  restore_temp=$(mktemp "$restore_dir/.materialpbx.restore.XXXXXX")
  cp -p -- "$service_snapshot_root/$snapshot_key" "$restore_temp"
  chown --reference="$service_snapshot_root/$snapshot_key" "$restore_temp"
  chmod --reference="$service_snapshot_root/$snapshot_key" "$restore_temp"
  mv -f -- "$restore_temp" "$snapshot_path"
}

restore_target() {
  target_kind=$1
  target_path=$2
  previous_target=$3
  legacy_backup=$4
  case "$target_kind" in
    absent)
      if [ -L "$target_path" ]; then rm -f -- "$target_path"; elif [ -e "$target_path" ]; then return 1; fi
      ;;
    symlink)
      if [ -L "$target_path" ]; then rm -f -- "$target_path"; elif [ -e "$target_path" ]; then return 1; fi
      test -d "$previous_target" && atomic_link "$previous_target" "$target_path"
      ;;
    legacy)
      if [ -d "$legacy_backup" ]; then
        if [ -L "$target_path" ]; then rm -f -- "$target_path"; elif [ -e "$target_path" ]; then return 1; fi
        mv -- "$legacy_backup" "$target_path"
      else
        test -d "$target_path" && test ! -L "$target_path"
      fi
      ;;
    *) return 1 ;;
  esac
}

restore_enablement() {
  unit=$1
  previous_state=$2
  if ! systemctl cat "$unit" >/dev/null 2>&1; then return 0; fi
  case "$previous_state" in
    enabled|linked|alias) systemctl enable "$unit" >/dev/null ;;
    enabled-runtime|linked-runtime) systemctl enable --runtime "$unit" >/dev/null ;;
    masked) systemctl mask "$unit" >/dev/null ;;
    masked-runtime) systemctl mask --runtime "$unit" >/dev/null ;;
    *) systemctl disable "$unit" >/dev/null 2>&1 || true ;;
  esac
}

verify_target() {
  target_kind=$1
  target_path=$2
  previous_target=$3
  case "$target_kind" in
    absent) test ! -e "$target_path" && test ! -L "$target_path" ;;
    symlink) test -L "$target_path" && test "$(readlink -f -- "$target_path")" = "$previous_target" ;;
    legacy) test -d "$target_path" && test ! -L "$target_path" ;;
    *) return 1 ;;
  esac
}

verify_enablement() {
  unit=$1
  expected_state=$2
  observed_state=$(systemctl is-enabled "$unit" 2>/dev/null || true)
  [ -n "$observed_state" ] || observed_state=not-found
  test "$observed_state" = "$expected_state"
}

rollback_service_transaction() {
  [ "$service_transaction_active" = true ] || return 0
  rollback_rc=0
  timeout 45s systemctl stop materialpbx-control-plane.service materialpbx-privileged-helper.service >/dev/null 2>&1 || rollback_rc=1
  systemctl is-active --quiet materialpbx-control-plane.service && rollback_rc=1
  systemctl is-active --quiet materialpbx-privileged-helper.service && rollback_rc=1
  if [ "$service_links_activated" = true ]; then
    restore_target "$control_previous_kind" "$control_link" "$control_previous_target" "$control_legacy_backup" || rollback_rc=1
    restore_target "$helper_previous_kind" "$helper_link" "$helper_previous_target" "$helper_legacy_backup" || rollback_rc=1
  fi

  restore_file control-unit /etc/systemd/system/materialpbx-control-plane.service || rollback_rc=1
  restore_file helper-unit /etc/systemd/system/materialpbx-privileged-helper.service || rollback_rc=1
  restore_file control-env /etc/materialpbx/control-plane.env || rollback_rc=1
  restore_file helper-env /etc/materialpbx/privileged-helper.env || rollback_rc=1
  restore_file configure-script /usr/local/libexec/materialpbx/configure-integrations.sh || rollback_rc=1
  restore_file helper-probe /usr/local/libexec/materialpbx/helper-probe.mjs || rollback_rc=1
  restore_file prepare-runtime /usr/local/libexec/materialpbx/prepare-helper-runtime.sh || rollback_rc=1
  restore_file manager-conf /etc/asterisk/manager_custom.conf || rollback_rc=1
  restore_file ari-conf /etc/asterisk/ari_custom.conf || rollback_rc=1
  restore_file http-conf /etc/asterisk/http_custom.conf || rollback_rc=1
  restore_file freepbx-dsn /etc/materialpbx/secrets/freepbx-dsn || rollback_rc=1
  restore_file services-marker "$services_marker" || rollback_rc=1
  restore_file deployment-marker "$deployment_marker" || rollback_rc=1
  if [ -f "$service_snapshot_root/recordings.acl" ]; then setfacl --restore="$service_snapshot_root/recordings.acl" || rollback_rc=1; fi

  systemctl daemon-reload >/dev/null 2>&1 || rollback_rc=1
  restore_enablement materialpbx-privileged-helper.service "$helper_was_enabled" || rollback_rc=1
  restore_enablement materialpbx-control-plane.service "$control_was_enabled" || rollback_rc=1
  verify_target "$control_previous_kind" "$control_link" "$control_previous_target" || rollback_rc=1
  verify_target "$helper_previous_kind" "$helper_link" "$helper_previous_target" || rollback_rc=1
  verify_enablement materialpbx-privileged-helper.service "$helper_was_enabled" || rollback_rc=1
  verify_enablement materialpbx-control-plane.service "$control_was_enabled" || rollback_rc=1
  if [ "$helper_was_active" = true ]; then
    timeout 45s systemctl start materialpbx-privileged-helper.service >/dev/null 2>&1 || rollback_rc=1
  fi
  if [ "$control_was_active" = true ]; then
    timeout 45s systemctl start materialpbx-control-plane.service >/dev/null 2>&1 || rollback_rc=1
  fi
  if [ "$helper_was_active" = true ]; then systemctl is-active --quiet materialpbx-privileged-helper.service || rollback_rc=1; else ! systemctl is-active --quiet materialpbx-privileged-helper.service || rollback_rc=1; fi
  if [ "$control_was_active" = true ]; then systemctl is-active --quiet materialpbx-control-plane.service || rollback_rc=1; else ! systemctl is-active --quiet materialpbx-control-plane.service || rollback_rc=1; fi
  if [ "$rollback_rc" -eq 0 ]; then
    rm -rf -- "$service_snapshot_root"
    service_transaction_active=false
    return 0
  fi
  printf '%s\n' "Service rollback verification failed. Recovery material remains at $service_snapshot_root and $service_transaction_root." >&2
  return 1
}

rollback_module() {
  [ "$module_replacement_active" = true ] || return 0
  module_rollback_rc=0
  if [ "$module_new_active" = true ] && [ -e "$module_target" ]; then
    module_failed="$(dirname -- "$module_target")/.materialpbx.failed.$(date -u +%Y%m%dT%H%M%SZ).$$"
    mv -- "$module_target" "$module_failed" || module_rollback_rc=1
  fi
  if [ "$module_had_previous" = true ]; then
    if [ -d "$module_backup" ]; then
      mv -- "$module_backup" "$module_target" || module_rollback_rc=1
      timeout 300s fwconsole ma install materialpbx >/dev/null 2>&1 || module_rollback_rc=1
      timeout 300s fwconsole reload >/dev/null 2>&1 || module_rollback_rc=1
      timeout 20s fwconsole ma list 2>/dev/null | grep -Eiq '^\|[[:space:]]*materialpbx[[:space:]]*\|[^|]*\|[[:space:]]*Enabled[[:space:]]*\|' || module_rollback_rc=1
      timeout 20s fwconsole materialpbx --help 2>/dev/null | grep -Fq 'Run bounded MaterialPBX bridge operations' || module_rollback_rc=1
    elif [ "$module_new_active" = true ]; then
      module_rollback_rc=1
    fi
  else
    printf '%s\n' "The first MaterialPBX module installation did not complete. Its failed files were preserved, but FreePBX database changes require reviewed recovery before another installer is run." >&2
  fi
  if [ "$module_rollback_rc" -eq 0 ]; then module_replacement_active=false; return 0; fi
  printf '%s\n' "MaterialPBX module rollback verification failed. Review $module_backup and $module_failed before retrying." >&2
  return 1
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e
  rollback_service_transaction || rollback_failed=true
  rollback_module || rollback_failed=true
  if [ -n "$marker_temp" ]; then rm -f -- "$marker_temp"; fi
  if [ -n "$installer_download" ]; then rm -f -- "$installer_download"; fi
  if [ -n "$control_env_temp" ]; then rm -f -- "$control_env_temp"; fi
  if [ -n "$helper_env_temp" ]; then rm -f -- "$helper_env_temp"; fi
  if [ -n "$services_marker_temp" ]; then rm -f -- "$services_marker_temp"; fi
  if [ -n "$module_source_manifest" ]; then rm -f -- "$module_source_manifest"; fi
  if [ -n "$module_stage_manifest" ]; then rm -f -- "$module_stage_manifest"; fi
  if [ -n "$module_stage" ]; then rm -rf -- "$module_stage"; fi
  if [ -n "$service_stage_root" ]; then rm -rf -- "$service_stage_root"; fi
  if [ "$rollback_failed" = true ]; then exit 71; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$(id -u)" -ne 0 ]; then
  fail "Run this production bootstrap with sudo on the Debian host." 77
fi
if [ "$#" -ne 1 ]; then
  fail "Usage: sudo sh ./deploy/production-bootstrap.sh pbx.example.net" 64
fi
fqdn=$1
printf '%s\n' "$fqdn" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' || fail "Use a valid fully qualified PBX hostname such as pbx.example.net." 64

for command_name in awk cmp cp cut find flock grep install ln mktemp mv readlink realpath sed sha256sum stat systemctl tar timeout tr; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required production-bootstrap command is unavailable before host mutation: $command_name" 69
done
lock_path=/run/lock/materialpbx-production-bootstrap.lock
test -d /run/lock && test ! -L /run/lock || fail "The system lock directory is unavailable or unsafe." 78
if [ -e "$lock_path" ] || [ -L "$lock_path" ]; then
  test -f "$lock_path" && test ! -L "$lock_path" || fail "The production-bootstrap lock path is not a regular file." 78
fi
exec 9>"$lock_path"
chown root:root "$lock_path"
chmod 0600 "$lock_path"
flock -n 9 || fail "Another MaterialPBX production bootstrap is already active." 75

test "$(uname -m)" = x86_64 || fail "The production bootstrap supports amd64 hosts only." 64
test -r /etc/os-release || fail "Cannot identify the host operating system." 65
# shellcheck source=/dev/null
. /etc/os-release
test "${ID:-}" = debian && test "${VERSION_ID:-}" = 12 || fail "The production bootstrap supports Debian 12 only." 65
test "$(cat /proc/1/comm 2>/dev/null)" = systemd || fail "Production requires a persistent Debian host with systemd as PID 1." 65
if systemd-detect-virt --quiet --container; then
  fail "Production installation inside a container was refused. Use a persistent Debian 12 host root filesystem." 78
fi

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH='' cd -- "$script_dir/.." && pwd)
module_source=$repo_root/services/freepbx-module
payload_dir=${MATERIALPBX_NATIVE_PAYLOAD_DIR:-$repo_root/dist/native-services}
native_assets=$repo_root/deploy/native
test -f "$module_source/module.xml" || fail "The MaterialPBX FreePBX module source is missing." 66
grep -Fxq "  <version>$module_version</version>" "$module_source/module.xml" || fail "The MaterialPBX module version does not match the production bootstrap." 65
for asset in build-service-payloads.sh materialpbx-control-plane.service materialpbx-privileged-helper.service materialpbx-prepare-helper-runtime.sh; do
  test -s "$native_assets/$asset" || fail "The native deployment asset $asset is missing." 66
done

control_port=${MATERIALPBX_CONTROL_PORT:-4280}
case "$control_port" in ''|*[!0-9]*) fail "The MaterialPBX control-plane port must be numeric." 64;; esac
test "$control_port" -ge 1 && test "$control_port" -le 65535 || fail "The MaterialPBX control-plane port must be between 1 and 65535." 64
node_name=${MATERIALPBX_NODE_NAME:-MaterialPBX}
test "${#node_name}" -le 128 || fail "The MaterialPBX node name must be 128 characters or fewer." 64
printf '%s\n' "$node_name" | grep -Eq '^[A-Za-z0-9._ -]+$' || fail "The MaterialPBX node name contains unsupported characters." 64
escaped_node_name=$(printf '%s' "$node_name" | sed 's/[\\"]/\\&/g')

if find "$module_source" -type l -print -quit | grep -q .; then fail "The MaterialPBX module source contains a symbolic link." 65; fi
if find "$module_source" ! -type d ! -type f -print -quit | grep -q .; then fail "The MaterialPBX module source contains a special file." 65; fi
if find "$module_source" -perm /7000 -print -quit | grep -q .; then fail "The MaterialPBX module source contains a special permission mode." 65; fi
if [ -L "$module_target" ]; then fail "The installed MaterialPBX module cannot be a symbolic link." 78; fi
if [ -e "$module_target" ]; then
  test -d "$module_target" || fail "The installed MaterialPBX module is not a directory." 78
  if find "$module_target" -type l -print -quit | grep -q .; then fail "The installed MaterialPBX module contains a symbolic link; reviewed migration is required." 78; fi
  if find "$module_target" ! -type d ! -type f -print -quit | grep -q .; then fail "The installed MaterialPBX module contains a special file; reviewed migration is required." 78; fi
  if find "$module_target" ! -user root -o ! -group root | grep -q .; then fail "The installed MaterialPBX module is not fully root-owned; reviewed migration is required before root fwconsole use." 78; fi
  if find "$module_target" -perm /7022 -print -quit | grep -q .; then fail "The installed MaterialPBX module has a writable or special permission mode; reviewed migration is required before root fwconsole use." 78; fi
fi

for payload in control-plane.tar.gz privileged-helper.tar.gz manifest.sha256; do
  test -s "$payload_dir/$payload" || fail "The bundled native service payload $payload is missing. Build it with deploy/native/build-service-payloads.sh before running production bootstrap; network package installation is intentionally unavailable here." 69
  test -f "$payload_dir/$payload" && test ! -L "$payload_dir/$payload" || fail "The bundled native service payload $payload must be a regular file, not a link or special file." 65
done
test ! -L "$payload_dir" || fail "The native payload directory cannot be a symbolic link." 65
outer_manifest_entries=$(awk '
  NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-f]+$/ { bad=1 }
  $2 == "control-plane.tar.gz" { control++ }
  $2 == "privileged-helper.tar.gz" { helper++ }
  $2 != "control-plane.tar.gz" && $2 != "privileged-helper.tar.gz" { bad=1 }
  END { if (bad || control != 1 || helper != 1 || NR != 2) exit 1; print NR }
' "$payload_dir/manifest.sha256") || fail "The native payload manifest must contain exactly the two expected archive digests." 65
test "$outer_manifest_entries" -eq 2 || fail "The native payload manifest is incomplete." 65
(
  cd "$payload_dir"
  sha256sum -c manifest.sha256 >/dev/null
) || fail "The bundled native service payload digest does not match its manifest." 65
control_payload_sha=$(awk '$2 == "control-plane.tar.gz" { print $1 }' "$payload_dir/manifest.sha256")
helper_payload_sha=$(awk '$2 == "privileged-helper.tar.gz" { print $1 }' "$payload_dir/manifest.sha256")
archive_safe "$payload_dir/control-plane.tar.gz" || fail "The control-plane archive failed its full header preflight before host mutation." 65
archive_safe "$payload_dir/privileged-helper.tar.gz" || fail "The privileged-helper archive failed its full header preflight before host mutation." 65

freepbx_files_complete() {
  test -s /etc/freepbx.conf &&
    test -x /usr/sbin/fwconsole &&
    test -x /usr/sbin/asterisk &&
    test -x /usr/bin/php &&
    test -x /usr/sbin/apache2 &&
    test -x /usr/sbin/mariadbd &&
    test -f /var/www/html/admin/bootstrap.php &&
    test -f /lib/systemd/system/freepbx.service &&
    test -d /var/lib/mysql/asterisk
}

assert_supported_versions() {
  freepbx_version_output=$(timeout 20s /usr/sbin/fwconsole --version 2>/dev/null) || fail "The installed FreePBX version could not be read without mutation." 78
  freepbx_major=$(printf '%s\n' "$freepbx_version_output" | sed -n 's/.*FreePBX[^0-9]*\([0-9][0-9]*\).*/\1/p' | sed -n '1p')
  if [ -z "$freepbx_major" ]; then freepbx_major=$(printf '%s\n' "$freepbx_version_output" | sed -n 's/^[^0-9]*\([0-9][0-9]*\).*/\1/p' | sed -n '1p'); fi
  test "$freepbx_major" = 17 || fail "The existing PBX is not supported FreePBX 17; automatic mutation was refused." 78
  asterisk_version_output=$(timeout 20s /usr/sbin/asterisk -V 2>/dev/null) || fail "The installed Asterisk version could not be read without mutation." 78
  asterisk_major=$(printf '%s\n' "$asterisk_version_output" | sed -n 's/.*Asterisk[[:space:]]*\([0-9][0-9]*\).*/\1/p' | sed -n '1p')
  case "$asterisk_major" in 18|20|21|22) ;; *) fail "The existing PBX uses an unsupported Asterisk major version; expected 18, 20, 21, or 22." 78;; esac
}

validate_existing_group() {
  expected_group=$1
  allowed_members=$2
  group_record=$(getent group "$expected_group" 2>/dev/null || true)
  [ -n "$group_record" ] || return 0
  group_gid=$(printf '%s\n' "$group_record" | awk -F: 'NR == 1 { print $3 }')
  case "$group_gid" in ''|*[!0-9]*) fail "The existing $expected_group group has an invalid numeric ID." 78;; esac
  test "$group_gid" -lt 1000 || fail "The existing $expected_group name belongs to a non-system group." 78
  group_name_count=$(getent group | awk -F: -v gid="$group_gid" '$3 == gid { count++ } END { print count+0 }')
  test "$group_name_count" -eq 1 || fail "The existing $expected_group numeric ID is shared by another group." 78
  group_members=$(printf '%s\n' "$group_record" | awk -F: 'NR == 1 { print $4 }')
  old_ifs=$IFS
  IFS=,
  for group_member in $group_members; do
    [ -z "$group_member" ] && continue
    case " $allowed_members " in *" $group_member "*) ;; *) fail "The existing $expected_group group contains an unintended member: $group_member" 78;; esac
  done
  IFS=$old_ifs
}

validate_existing_identity() {
  validate_existing_group materialpbx-control "materialpbx-control"
  validate_existing_group materialpbx-socket "materialpbx-control"
  if getent passwd materialpbx-control >/dev/null 2>&1; then
    user_record=$(getent passwd materialpbx-control)
    user_uid=$(printf '%s\n' "$user_record" | awk -F: 'NR == 1 { print $3 }')
    user_gid=$(printf '%s\n' "$user_record" | awk -F: 'NR == 1 { print $4 }')
    user_home=$(printf '%s\n' "$user_record" | awk -F: 'NR == 1 { print $6 }')
    user_shell=$(printf '%s\n' "$user_record" | awk -F: 'NR == 1 { print $7 }')
    case "$user_uid" in ''|*[!0-9]*) fail "The existing materialpbx-control user has an invalid numeric ID." 78;; esac
    test "$user_uid" -lt 1000 || fail "The existing materialpbx-control name belongs to a non-system user." 78
    user_name_count=$(getent passwd | awk -F: -v uid="$user_uid" '$3 == uid { count++ } END { print count+0 }')
    test "$user_name_count" -eq 1 || fail "The materialpbx-control numeric ID is shared by another user." 78
    control_group_record=$(getent group materialpbx-control 2>/dev/null || true)
    test -n "$control_group_record" || fail "The materialpbx-control user exists without its dedicated group." 78
    expected_control_gid=$(printf '%s\n' "$control_group_record" | awk -F: 'NR == 1 { print $3 }')
    test "$user_gid" = "$expected_control_gid" || fail "The existing materialpbx-control user has an unexpected primary group." 78
    test "$user_home" = /var/lib/materialpbx/control-plane || fail "The existing materialpbx-control user has an unexpected home directory." 78
    test "$user_shell" = /usr/sbin/nologin || fail "The existing materialpbx-control user has an interactive or unexpected shell." 78
    for user_group in $(id -nG materialpbx-control); do
      case "$user_group" in materialpbx-control|materialpbx-socket|materialpbx-recordings) ;; *) fail "The materialpbx-control user belongs to an unintended supplementary group: $user_group" 78;; esac
    done
  fi
}

existing_freepbx_state=false
for existing_path in /etc/freepbx.conf /usr/sbin/fwconsole /usr/sbin/asterisk /var/www/html/admin/bootstrap.php /lib/systemd/system/freepbx.service /var/lib/mysql/asterisk; do
  if [ -e "$existing_path" ]; then existing_freepbx_state=true; break; fi
done
if [ "$existing_freepbx_state" = true ]; then
  freepbx_files_complete || fail "A partial FreePBX installation was detected before host mutation. Restore or migrate it; automatic installer replay was refused." 78
  assert_supported_versions
fi
validate_existing_identity

for conflicting_unit in freeswitch.service kamailio.service opensips.service 3cxpbx.service fusionpbx.service issabel.service; do
  systemctl is-active --quiet "$conflicting_unit" && fail "Conflicting telephony workload is active: $conflicting_unit" 78
done
if command -v docker >/dev/null 2>&1; then
  lab_containers=$(docker ps --filter label=com.docker.compose.service=pbx --format '{{.ID}}' 2>/dev/null || true)
  test -z "$lab_containers" || fail "A containerized PBX lab is active. Stop and preserve it before native production installation." 78
fi
if command -v podman >/dev/null 2>&1; then
  lab_containers=$(podman ps --filter label=com.docker.compose.service=pbx --format '{{.ID}}' 2>/dev/null || true)
  test -z "$lab_containers" || fail "A containerized PBX lab is active. Stop and preserve it before native production installation." 78
fi
if command -v ss >/dev/null 2>&1; then
  if ! systemctl is-active --quiet materialpbx-control-plane.service; then
    if ss -H -ltn "sport = :$control_port" 2>/dev/null | grep -q .; then fail "The requested control-plane port is already in use: $control_port" 78; fi
  fi
  if [ "$existing_freepbx_state" = false ]; then
    for reserved_port in 80 443 3306 5038 5060 5061 8088; do
      if ss -H -ltn "sport = :$reserved_port" 2>/dev/null | grep -q . || ss -H -lun "sport = :$reserved_port" 2>/dev/null | grep -q .; then
        fail "A workload already owns PBX port $reserved_port on a host with no complete FreePBX installation." 78
      fi
    done
  fi
fi

for existing_target in "$control_link" "$helper_link"; do
  if [ -L "$existing_target" ]; then
    existing_destination=$(readlink -f -- "$existing_target") || fail "A native service active link is broken: $existing_target" 78
    case "$existing_destination" in "$release_root"/*) ;; *) fail "A native service active link points outside the managed release root: $existing_target" 78;; esac
  elif [ -e "$existing_target" ]; then
    test -d "$existing_target" || fail "A native service target is neither a directory nor a managed active link: $existing_target" 78
  fi
done

export DEBIAN_FRONTEND=noninteractive
timeout --foreground 10m apt-get update
timeout --foreground 10m apt-get install -y --no-install-recommends acl ca-certificates coreutils curl openssl tar util-linux

current_hostname=$(hostname -f 2>/dev/null || true)
if [ "$current_hostname" != "$fqdn" ]; then
  hostnamectl set-hostname "$fqdn"
fi
if ! getent hosts "$fqdn" >/dev/null 2>&1; then
  printf '127.0.1.1 %s %s\n' "$fqdn" "${fqdn%%.*}" >> /etc/hosts
fi
test "$(hostname -f)" = "$fqdn" || fail "The host could not resolve its configured fully qualified hostname." 65

install -d -m 0755 "$(dirname -- "$installer_path")"
installer_download=$(mktemp "${installer_path}.download.XXXXXX")
timeout --foreground 5m curl --fail --location --proto '=https' --tlsv1.2 --output "$installer_download" "$installer_url"
printf '%s  %s\n' "$installer_sha256" "$installer_download" | sha256sum -c - >/dev/null || fail "The pinned FreePBX installer digest does not match." 65
install -m 0755 "$installer_download" "$installer_path"
rm -f -- "$installer_download"
installer_download=

freepbx_schema_ready() {
  timeout 120s systemctl start mariadb.service || return 1
  existing_inventory=$(timeout 30s fwconsole ma list 2>/dev/null) || return 1
  printf '%s\n' "$existing_inventory" | grep -Eiq '^\|[[:space:]]*framework[[:space:]]*\|[^|]*\|[[:space:]]*Enabled[[:space:]]*\|'
}

if [ "$existing_freepbx_state" = true ] && freepbx_schema_ready; then
  echo "Existing FreePBX installation detected; the upstream installer will not be replayed."
elif [ "$existing_freepbx_state" = true ]; then
  fail "The complete FreePBX 17 file inventory exists, but its schema is not ready. Installer replay was refused; restore database readiness or perform a reviewed migration." 78
else
  echo "Starting the pinned official FreePBX 17 installer on the persistent Debian host."
  timeout --foreground 90m "$installer_path" --skipversion
fi

test -s /etc/freepbx.conf || fail "FreePBX did not create /etc/freepbx.conf." 70
test -x /usr/sbin/fwconsole || fail "FreePBX did not install fwconsole." 70
timeout 120s systemctl enable --now mariadb.service redis-server.service apache2.service
timeout 30s systemctl enable freepbx.service
timeout 300s fwconsole start >/dev/null
assert_supported_versions
timeout 20s asterisk -rx 'core show version' >/dev/null

module_parent=$(dirname -- "$module_target")
test -d "$module_parent" && test ! -L "$module_parent" || fail "The FreePBX module directory is unavailable or unsafe." 78
module_source_manifest=$(mktemp /run/materialpbx-module-source.XXXXXX)
module_stage_manifest=$(mktemp /run/materialpbx-module-stage.XXXXXX)
(
  cd "$module_source"
  find . -type f -print0 | sort -z | xargs -0 sha256sum
) > "$module_source_manifest"
test -s "$module_source_manifest" || fail "The MaterialPBX module source has no regular files." 65
module_stage=$(mktemp -d "$(dirname -- "$module_target")/.materialpbx.stage.XXXXXX")
cp -R -- "$module_source/." "$module_stage/"
if find "$module_stage" -type l -print -quit | grep -q .; then fail "The staged MaterialPBX module contains a symbolic link." 65; fi
if find "$module_stage" ! -type d ! -type f -print -quit | grep -q .; then fail "The staged MaterialPBX module contains a special file." 65; fi
(
  cd "$module_stage"
  find . -type f -print0 | sort -z | xargs -0 sha256sum
) > "$module_stage_manifest"
cmp -s "$module_source_manifest" "$module_stage_manifest" || fail "The MaterialPBX module changed or lost files while it was staged." 65
(
  cd "$module_source"
  find . -type f -print0 | sort -z | xargs -0 sha256sum
) > "$module_source_manifest"
cmp -s "$module_source_manifest" "$module_stage_manifest" || fail "The MaterialPBX module source changed during privileged staging." 65
chown -R root:root "$module_stage"
find "$module_stage" -type d -exec chmod 0755 {} +
find "$module_stage" -type f -exec chmod 0644 {} +
if find "$module_stage" ! -user root -o ! -group root | grep -q .; then fail "The staged MaterialPBX module is not fully root-owned." 65; fi
if find "$module_stage" -type f -perm /022 -print -quit | grep -q .; then fail "The staged MaterialPBX module contains writable code." 65; fi
module_backup="$module_parent/.materialpbx.rollback.$(date -u +%Y%m%dT%H%M%SZ).$$"
test ! -e "$module_backup" || fail "The MaterialPBX module rollback slot already exists." 73
if [ -L "$module_target" ]; then fail "The installed MaterialPBX module cannot be a symbolic link." 78; fi
if [ -e "$module_target" ]; then
  test -d "$module_target" || fail "The installed MaterialPBX module is not a directory." 78
  module_replacement_active=true
  module_had_previous=true
  mv -- "$module_target" "$module_backup"
else
  module_replacement_active=true
fi
mv -- "$module_stage" "$module_target"
module_stage=
module_new_active=true
timeout 300s fwconsole ma install materialpbx || fail "The MaterialPBX module installation failed; automatic file rollback will run when a previous module exists." 70
timeout 300s fwconsole reload >/dev/null
module_inventory=$(timeout 20s fwconsole ma list)
printf '%s\n' "$module_inventory" | grep -Eiq '^\|[[:space:]]*materialpbx[[:space:]]*\|[^|]*\|[[:space:]]*Enabled[[:space:]]*\|' || fail "The MaterialPBX module is not enabled." 70
timeout 20s fwconsole materialpbx --help 2>/dev/null | grep -Fq 'Run bounded MaterialPBX bridge operations' || fail "The MaterialPBX module command did not load after installation." 70
if [ "$module_had_previous" = false ]; then
  module_replacement_active=false
  printf '%s\n' "The first MaterialPBX module installation is active. Later service rollback will not claim to reverse FreePBX database installation state."
fi

command -v node >/dev/null 2>&1 || fail "The installed FreePBX runtime did not provide Node.js for the bundled MaterialPBX services." 69
node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
test "$node_major" -ge 22 || fail "The bundled MaterialPBX services require Node.js 22 or newer." 69

if ! getent group materialpbx-control >/dev/null 2>&1; then
  groupadd --system materialpbx-control
fi
if ! getent group materialpbx-socket >/dev/null 2>&1; then
  groupadd --system materialpbx-socket
fi
if ! getent group materialpbx-recordings >/dev/null 2>&1; then
  groupadd --system materialpbx-recordings
fi
if ! getent passwd materialpbx-control >/dev/null 2>&1; then
  useradd --system --gid materialpbx-control --home-dir /var/lib/materialpbx/control-plane --shell /usr/sbin/nologin materialpbx-control
fi
control_uid=$(id -u materialpbx-control)
control_gid=$(getent group materialpbx-control | cut -d: -f3)
socket_gid=$(getent group materialpbx-socket | cut -d: -f3)
test -n "$control_uid" && test -n "$control_gid" && test -n "$socket_gid" || fail "The dedicated MaterialPBX control-plane identity is unavailable." 70
usermod -a -G materialpbx-socket,materialpbx-recordings materialpbx-control
validate_existing_identity
socket_group_members=$(getent group materialpbx-socket | awk -F: 'NR == 1 { print $4 }')
test "$socket_group_members" = materialpbx-control || fail "The privileged-helper socket group must contain only materialpbx-control." 78

secret_dir=/etc/materialpbx/secrets
install -d -o root -g root -m 0700 "$secret_dir"
generate_secret() {
  secret_path=$1
  if [ ! -e "$secret_path" ]; then
    secret_temp=$(mktemp "${secret_path}.tmp.XXXXXX")
    openssl rand -base64 48 | tr -d '\n' > "$secret_temp"
    printf '\n' >> "$secret_temp"
    chown root:root "$secret_temp"
    chmod 0600 "$secret_temp"
    test -s "$secret_temp"
    mv -f "$secret_temp" "$secret_path"
  fi
  chown root:root "$secret_path"
  chmod 0600 "$secret_path"
  test "$(stat -c '%a:%U:%G' "$secret_path")" = '600:root:root' || fail "A MaterialPBX secret file does not have the required owner or mode." 70
}
generate_secret "$secret_dir/admin-token"
generate_secret "$secret_dir/ami-secret"
generate_secret "$secret_dir/ari-secret"

install -d -o materialpbx-control -g materialpbx-control -m 0750 /var/lib/materialpbx/control-plane
payload_manifest_safe() {
  manifest=$1
  LC_ALL=C awk '
    {
      hash=substr($0,1,64)
      separator=substr($0,65,2)
      path=substr($0,67)
      if (length(hash) != 64 || hash !~ /^[0-9a-f]+$/ || separator != "  ") bad=1
      if (path !~ /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/ || path ~ /(^|[/])\.\.([/]|$)/ || path ~ /(^|[/])\.([/]|$)/ || path ~ /[/][/]/) bad=1
      if (path == "dist/payload-files.sha256" || path == "payload-archive.sha256" || seen[path]++) bad=1
      if (previous != "" && path <= previous) bad=1
      previous=path
    }
    END { exit bad || NR == 0 ? 1 : 0 }
  ' "$manifest"
}

validate_generation() {
  generation=$1
  expected_sha=$2
  test -d "$generation" && test ! -L "$generation" || return 1
  test "$(cat "$generation/payload-archive.sha256" 2>/dev/null)" = "$expected_sha" || return 1
  test -s "$generation/dist/server.js" || return 1
  test -s "$generation/node_modules/@materialpbx/protocol/dist/index.js" || return 1
  test -s "$generation/dist/payload-files.sha256" || return 1
  payload_manifest_safe "$generation/dist/payload-files.sha256" || return 1
  ! find "$generation" -type l -print -quit | grep -q . || return 1
  ! find "$generation" ! -type d ! -type f -print -quit | grep -q . || return 1
  ! find "$generation" -perm /7022 -print -quit | grep -q . || return 1
  ! find "$generation" ! -user root -print -quit | grep -q . || return 1
  ! find "$generation" ! -group root -print -quit | grep -q . || return 1
  ! find "$generation" -type d ! -perm -005 -print -quit | grep -q . || return 1
  ! find "$generation" -type f ! -perm -004 -print -quit | grep -q . || return 1
  manifest_paths=$(awk '{ print substr($0,67) }' "$generation/dist/payload-files.sha256") || return 1
  actual_paths=$(cd "$generation" && find . -type f ! -path './dist/payload-files.sha256' ! -name payload-archive.sha256 -printf '%P\n' | LC_ALL=C sort) || return 1
  test "$manifest_paths" = "$actual_paths" || return 1
  (cd "$generation" && sha256sum -c dist/payload-files.sha256 >/dev/null) || return 1
  node --check "$generation/dist/server.js" >/dev/null
}

extract_generation() {
  archive=$1
  destination=$2
  expected_sha=$3
  staged_archive="$service_stage_root/.archive.$expected_sha"
  test ! -e "$staged_archive" || fail "The native service archive staging path already exists." 73
  cp --no-preserve=ownership,mode -- "$archive" "$staged_archive"
  chmod 0600 "$staged_archive"
  observed_archive_sha=$(sha256sum "$staged_archive" | cut -d' ' -f1)
  test "$observed_archive_sha" = "$expected_sha" || fail "A native service archive changed after its outer manifest was verified." 65
  archive_safe "$staged_archive" || fail "A native service archive contains an unsafe member path, owner, type, link, or special mode." 65
  install -d -o root -g root -m 0755 "$destination"
  tar --extract --gzip --file "$staged_archive" --directory "$destination" --no-same-owner --no-same-permissions --delay-directory-restore
  rm -f -- "$staged_archive"
  if find "$destination" -type l -print -quit | grep -q .; then fail "A native service payload extracted a symbolic link." 65; fi
  if find "$destination" ! -type d ! -type f -print -quit | grep -q .; then fail "A native service payload extracted a special file." 65; fi
  if find "$destination" -perm /7022 -print -quit | grep -q .; then fail "A native service payload extracted a special mode or group/world-writable inode." 65; fi
  payload_manifest_safe "$destination/dist/payload-files.sha256" || fail "A native service payload file manifest contains an unsafe path." 65
  (cd "$destination" && sha256sum -c dist/payload-files.sha256 >/dev/null) || fail "A native service payload file manifest did not validate." 65
  chown -R root:root "$destination"
  find "$destination" -type d -exec chmod 0755 {} +
  find "$destination" -type f -exec chmod 0644 {} +
  printf '%s\n' "$expected_sha" > "$destination/payload-archive.sha256"
  chown root:root "$destination/payload-archive.sha256"
  chmod 0444 "$destination/payload-archive.sha256"
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ).$$"
install -d -o root -g root -m 0755 /opt/materialpbx "$release_root" "$control_release_root" "$helper_release_root"
service_stage_root=$(mktemp -d "$release_root/.stage.XXXXXX")
control_generation="$control_release_root/$control_payload_sha"
helper_generation="$helper_release_root/$helper_payload_sha"
if [ -e "$control_generation" ] || [ -L "$control_generation" ]; then
  validate_generation "$control_generation" "$control_payload_sha" || fail "The existing control-plane generation failed integrity validation." 65
else
  extract_generation "$payload_dir/control-plane.tar.gz" "$service_stage_root/control-plane" "$control_payload_sha"
  validate_generation "$service_stage_root/control-plane" "$control_payload_sha" || fail "The staged control-plane generation failed integrity validation." 65
  mv -- "$service_stage_root/control-plane" "$control_generation"
fi
if [ -e "$helper_generation" ] || [ -L "$helper_generation" ]; then
  validate_generation "$helper_generation" "$helper_payload_sha" || fail "The existing privileged-helper generation failed integrity validation." 65
else
  extract_generation "$payload_dir/privileged-helper.tar.gz" "$service_stage_root/privileged-helper" "$helper_payload_sha"
  validate_generation "$service_stage_root/privileged-helper" "$helper_payload_sha" || fail "The staged privileged-helper generation failed integrity validation." 65
  mv -- "$service_stage_root/privileged-helper" "$helper_generation"
fi
rmdir "$service_stage_root"
service_stage_root=
control_installed_manifest_sha=$(sha256sum "$control_generation/dist/payload-files.sha256" | cut -d' ' -f1)
helper_installed_manifest_sha=$(sha256sum "$helper_generation/dist/payload-files.sha256" | cut -d' ' -f1)
if [ "${#control_installed_manifest_sha}" -ne 64 ] || ! printf '%s\n' "$control_installed_manifest_sha" | grep -Eq '^[0-9a-f]{64}$'; then
  fail "The installed control-plane manifest digest is invalid." 65
fi
if [ "${#helper_installed_manifest_sha}" -ne 64 ] || ! printf '%s\n' "$helper_installed_manifest_sha" | grep -Eq '^[0-9a-f]{64}$'; then
  fail "The installed privileged-helper manifest digest is invalid." 65
fi

service_snapshot_root="/var/lib/materialpbx/native-transactions/$timestamp"
service_transaction_root="/opt/materialpbx/transactions/$timestamp"
install -d -o root -g root -m 0700 "$service_snapshot_root" "$service_transaction_root"
control_was_enabled=$(systemctl is-enabled materialpbx-control-plane.service 2>/dev/null || true)
helper_was_enabled=$(systemctl is-enabled materialpbx-privileged-helper.service 2>/dev/null || true)
[ -n "$control_was_enabled" ] || control_was_enabled=not-found
[ -n "$helper_was_enabled" ] || helper_was_enabled=not-found
if systemctl is-active --quiet materialpbx-control-plane.service; then control_was_active=true; fi
if systemctl is-active --quiet materialpbx-privileged-helper.service; then helper_was_active=true; fi
control_previous_pid=$(systemctl show -p MainPID --value materialpbx-control-plane.service 2>/dev/null || printf '0')
helper_previous_pid=$(systemctl show -p MainPID --value materialpbx-privileged-helper.service 2>/dev/null || printf '0')
control_previous_started=$(systemctl show -p ExecMainStartTimestampMonotonic --value materialpbx-control-plane.service 2>/dev/null || printf '0')
helper_previous_started=$(systemctl show -p ExecMainStartTimestampMonotonic --value materialpbx-privileged-helper.service 2>/dev/null || printf '0')
case "$control_previous_pid" in ''|*[!0-9]*) control_previous_pid=0;; esac
case "$helper_previous_pid" in ''|*[!0-9]*) helper_previous_pid=0;; esac
case "$control_previous_started" in ''|*[!0-9]*) control_previous_started=0;; esac
case "$helper_previous_started" in ''|*[!0-9]*) helper_previous_started=0;; esac

if [ -L "$control_link" ]; then control_previous_kind=symlink; control_previous_target=$(readlink -f -- "$control_link"); elif [ -d "$control_link" ]; then control_previous_kind=legacy; control_legacy_backup="$service_transaction_root/control-plane.legacy"; fi
if [ -L "$helper_link" ]; then helper_previous_kind=symlink; helper_previous_target=$(readlink -f -- "$helper_link"); elif [ -d "$helper_link" ]; then helper_previous_kind=legacy; helper_legacy_backup="$service_transaction_root/privileged-helper.legacy"; fi

snapshot_file control-unit /etc/systemd/system/materialpbx-control-plane.service
snapshot_file helper-unit /etc/systemd/system/materialpbx-privileged-helper.service
snapshot_file control-env /etc/materialpbx/control-plane.env
snapshot_file helper-env /etc/materialpbx/privileged-helper.env
snapshot_file configure-script /usr/local/libexec/materialpbx/configure-integrations.sh
snapshot_file helper-probe /usr/local/libexec/materialpbx/helper-probe.mjs
snapshot_file prepare-runtime /usr/local/libexec/materialpbx/prepare-helper-runtime.sh
snapshot_file manager-conf /etc/asterisk/manager_custom.conf
snapshot_file ari-conf /etc/asterisk/ari_custom.conf
snapshot_file http-conf /etc/asterisk/http_custom.conf
snapshot_file freepbx-dsn "$secret_dir/freepbx-dsn"
snapshot_file services-marker "$services_marker"
snapshot_file deployment-marker "$deployment_marker"
if [ -d /var/spool/asterisk/monitor ]; then getfacl -Rp /var/spool/asterisk/monitor > "$service_snapshot_root/recordings.acl"; fi
service_transaction_active=true

install -d -o root -g root -m 0755 /usr/local/libexec/materialpbx
install -o root -g root -m 0755 "$repo_root/deploy/pbx/materialpbx-configure-integrations.sh" /usr/local/libexec/materialpbx/configure-integrations.sh
install -o root -g root -m 0644 "$repo_root/deploy/pbx/materialpbx-helper-probe.mjs" /usr/local/libexec/materialpbx/helper-probe.mjs
install -o root -g root -m 0755 "$native_assets/materialpbx-prepare-helper-runtime.sh" /usr/local/libexec/materialpbx/prepare-helper-runtime.sh
if [ -d /var/spool/asterisk/monitor ]; then
  timeout --foreground 5m setfacl -R -m g:materialpbx-recordings:rX /var/spool/asterisk/monitor
  setfacl -m d:g:materialpbx-recordings:rX /var/spool/asterisk/monitor
fi
MATERIALPBX_SECRETS_DIR="$secret_dir" \
MATERIALPBX_CONTROL_STATE_DIR="$secret_dir" \
MATERIALPBX_CONTROL_UID=0 \
MATERIALPBX_CONTROL_GID=0 \
  timeout --foreground 240s /usr/local/libexec/materialpbx/configure-integrations.sh
test "$(stat -c '%a:%U:%G' "$secret_dir/freepbx-dsn")" = '600:root:root' || fail "The generated FreePBX database credential does not have the required owner or mode." 70

install -d -o root -g materialpbx-control -m 0750 /etc/materialpbx
control_env_temp=$(mktemp /etc/materialpbx/control-plane.env.tmp.XXXXXX)
{
  printf 'MATERIALPBX_BIND=127.0.0.1\n'
  printf 'MATERIALPBX_PORT=%s\n' "$control_port"
  printf 'MATERIALPBX_PUBLIC_URL=https://%s\n' "$fqdn"
  printf 'MATERIALPBX_DATA_DIR=/var/lib/materialpbx/control-plane\n'
  printf 'MATERIALPBX_NODE_NAME="%s"\n' "$escaped_node_name"
  printf 'ASTERISK_AMI_HOST=127.0.0.1\n'
  printf 'ASTERISK_AMI_PORT=5038\n'
  printf 'ASTERISK_AMI_USERNAME=materialpbx\n'
  printf 'ASTERISK_ARI_URL=http://127.0.0.1:8088/ari/\n'
  printf 'ASTERISK_ARI_USERNAME=materialpbx\n'
  printf 'ASTERISK_RECORDINGS_DIR=/var/spool/asterisk/monitor\n'
  printf 'PRIVILEGED_HELPER_SOCKET=/run/materialpbx/privileged.sock\n'
} > "$control_env_temp"
chown root:materialpbx-control "$control_env_temp"
chmod 0640 "$control_env_temp"
mv -f "$control_env_temp" /etc/materialpbx/control-plane.env
control_env_temp=

helper_env_temp=$(mktemp /etc/materialpbx/privileged-helper.env.tmp.XXXXXX)
{
  printf 'PRIVILEGED_HELPER_SOCKET=/run/materialpbx/privileged.sock\n'
  printf 'MATERIALPBX_SOCKET_GID=%s\n' "$socket_gid"
} > "$helper_env_temp"
chown root:root "$helper_env_temp"
chmod 0600 "$helper_env_temp"
mv -f "$helper_env_temp" /etc/materialpbx/privileged-helper.env
helper_env_temp=

install -o root -g root -m 0644 "$native_assets/materialpbx-control-plane.service" /etc/systemd/system/materialpbx-control-plane.service
install -o root -g root -m 0644 "$native_assets/materialpbx-privileged-helper.service" /etc/systemd/system/materialpbx-privileged-helper.service

timeout 45s systemctl stop materialpbx-control-plane.service materialpbx-privileged-helper.service || fail "The existing MaterialPBX services could not be stopped for atomic activation." 70
! systemctl is-active --quiet materialpbx-control-plane.service || fail "The control plane remained active after its stop request." 70
! systemctl is-active --quiet materialpbx-privileged-helper.service || fail "The privileged helper remained active after its stop request." 70

service_links_activated=true
if [ "$control_previous_kind" = legacy ]; then mv -- "$control_link" "$control_legacy_backup"; fi
if [ "$helper_previous_kind" = legacy ]; then mv -- "$helper_link" "$helper_legacy_backup"; fi
atomic_link "$control_generation" "$control_link"
atomic_link "$helper_generation" "$helper_link"
test "$(readlink -f -- "$control_link")" = "$control_generation" || fail "The control-plane active link did not select the intended generation." 70
test "$(readlink -f -- "$helper_link")" = "$helper_generation" || fail "The privileged-helper active link did not select the intended generation." 70

systemctl daemon-reload
systemctl enable materialpbx-privileged-helper.service materialpbx-control-plane.service >/dev/null
timeout 45s systemctl start materialpbx-privileged-helper.service
probe_helper_operation() {
  operation=$1
  timeout 40s setpriv --reuid="$control_uid" --regid="$control_gid" --init-groups env \
    PRIVILEGED_HELPER_SOCKET=/run/materialpbx/privileged.sock \
    MATERIALPBX_HELPER_PROBE_OPERATION="$operation" \
    /usr/bin/node /usr/local/libexec/materialpbx/helper-probe.mjs
}
probe_helper_attestation() {
  attestation_operation=$1
  expected_manifest_sha=$2
  timeout 40s setpriv --reuid="$control_uid" --regid="$control_gid" --init-groups env \
    PRIVILEGED_HELPER_SOCKET=/run/materialpbx/privileged.sock \
    /usr/bin/node -e '
      const net = require("node:net");
      const operation = process.argv[1];
      const expected = process.argv[2];
      const requestId = "00000000-0000-4000-8000-000000000002";
      const socket = net.createConnection(process.env.PRIVILEGED_HELPER_SOCKET);
      let response = "";
      const timer = setTimeout(() => socket.destroy(new Error("attestation timeout")), 30000);
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.end(JSON.stringify({ requestId, operation, parameters: {} }) + "\n"));
      socket.on("data", chunk => { response += chunk; if (response.length > 65536) socket.destroy(new Error("oversize attestation")); });
      socket.on("error", () => { clearTimeout(timer); process.exitCode = 2; });
      socket.on("close", () => {
        clearTimeout(timer);
        try {
          const envelope = JSON.parse(response.trim());
          if (envelope.requestId !== requestId || envelope.ok !== true || envelope.exitCode !== 0) throw new Error("unsuccessful attestation");
          const report = JSON.parse(envelope.stdout);
          const build = report.build;
          if (build?.service !== "@materialpbx/privileged-helper" || typeof build.serviceVersion !== "string" || build.serviceVersion.length === 0 || build.protocolVersion !== 1 || build.readinessSchemaVersion !== 1 || build.desiredStateSnapshotSchemaVersion !== 1 || build.installedManifestSha256 !== expected) throw new Error("attestation mismatch");
        } catch { process.exitCode = 1; }
      });
    ' "$attestation_operation" "$expected_manifest_sha"
}
deadline=$(($(date +%s) + 60))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if systemctl is-active --quiet materialpbx-privileged-helper.service &&
    test -S /run/materialpbx/privileged.sock &&
    probe_helper_attestation system.readiness "$helper_installed_manifest_sha"; then
    break
  fi
  sleep 2
done
systemctl is-active --quiet materialpbx-privileged-helper.service || fail "The native MaterialPBX privileged helper did not become active." 70
test -S /run/materialpbx/privileged.sock || fail "The native MaterialPBX privileged-helper socket was not published." 70
test "$(stat -c '%a:%U:%G' /run/materialpbx/privileged.sock)" = '660:root:materialpbx-socket' || fail "The native MaterialPBX privileged-helper socket owner or mode is invalid." 70
for operation in fwconsole.version asterisk.version system.capabilities; do
  probe_helper_operation "$operation" || fail "The control-plane identity could not complete the bounded $operation helper probe." 70
done
probe_helper_attestation system.identity "$helper_installed_manifest_sha" || fail "The privileged-helper process identity does not match the installed generation manifest." 70
probe_helper_attestation system.readiness "$helper_installed_manifest_sha" || fail "The privileged-helper process readiness does not match the installed generation manifest." 70

helper_pid=$(systemctl show -p MainPID --value materialpbx-privileged-helper.service)
helper_started=$(systemctl show -p ExecMainStartTimestampMonotonic --value materialpbx-privileged-helper.service)
case "$helper_pid" in ''|0|*[!0-9]*) fail "The privileged helper has no verified main process." 70;; esac
case "$helper_started" in ''|0|*[!0-9]*) fail "The privileged helper has no verified start timestamp." 70;; esac
test "$helper_previous_pid" -eq 0 || test "$helper_pid" -ne "$helper_previous_pid" || fail "The privileged helper did not start a new process for this generation." 70
test "$helper_previous_started" -eq 0 || test "$helper_started" -gt "$helper_previous_started" || fail "The privileged helper did not report a newer process start time." 70

timeout 45s systemctl start materialpbx-control-plane.service
deadline=$(($(date +%s) + 60))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if systemctl is-active --quiet materialpbx-control-plane.service && timeout 5s curl --fail --silent --max-time 3 "http://127.0.0.1:${control_port}/healthz" | grep -Fq '"status":"ok"'; then
    break
  fi
  sleep 2
done
systemctl is-active --quiet materialpbx-control-plane.service || fail "The native MaterialPBX control plane did not become active." 70
timeout 5s curl --fail --silent --max-time 3 "http://127.0.0.1:${control_port}/healthz" | grep -Fq '"status":"ok"' || fail "The native MaterialPBX control-plane health probe did not succeed." 70

control_pid=$(systemctl show -p MainPID --value materialpbx-control-plane.service)
control_started=$(systemctl show -p ExecMainStartTimestampMonotonic --value materialpbx-control-plane.service)
case "$control_pid" in ''|0|*[!0-9]*) fail "The control plane has no verified main process." 70;; esac
case "$control_started" in ''|0|*[!0-9]*) fail "The control plane has no verified start timestamp." 70;; esac
test "$control_previous_pid" -eq 0 || test "$control_pid" -ne "$control_previous_pid" || fail "The control plane did not start a new process for this generation." 70
test "$control_previous_started" -eq 0 || test "$control_started" -gt "$control_previous_started" || fail "The control plane did not report a newer process start time." 70

admin_token=$(tr -d '\r\n' < "$secret_dir/admin-token")
test -n "$admin_token" || fail "The administrator credential required for readiness verification is empty." 70
printf 'header = "Authorization: Bearer %s"\n' "$admin_token" | timeout 10s curl --config - --fail --silent --max-time 5 "http://127.0.0.1:${control_port}/readyz" | node -e '
  let bytes = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { bytes += chunk; if (bytes.length > 1048576) process.exit(2); });
  process.stdin.on("end", () => {
    try {
      const report = JSON.parse(bytes);
      const controlExpected = process.argv[1];
      const helperExpected = process.argv[2];
      const control = report?.build;
      const helper = report?.checks?.helper?.build;
      if (control?.service !== "@materialpbx/control-plane" || typeof control.serviceVersion !== "string" || control.serviceVersion.length === 0 || control.protocolVersion !== 1 || control.readinessSchemaVersion !== 1 || control.installedManifestSha256 !== controlExpected) process.exit(1);
      if (helper?.service !== "@materialpbx/privileged-helper" || typeof helper.serviceVersion !== "string" || helper.serviceVersion.length === 0 || helper.protocolVersion !== 1 || helper.readinessSchemaVersion !== 1 || helper.desiredStateSnapshotSchemaVersion !== 1 || helper.installedManifestSha256 !== helperExpected) process.exit(1);
    } catch { process.exit(2); }
  });
' "$control_installed_manifest_sha" "$helper_installed_manifest_sha" || fail "The authenticated control-plane readiness report does not match the installed service generation manifests." 70
unset admin_token

services_marker_temp=$(mktemp "${services_marker}.tmp.XXXXXX")
{
  printf 'schema=3\n'
  printf 'control_payload_sha256=%s\n' "$control_payload_sha"
  printf 'helper_payload_sha256=%s\n' "$helper_payload_sha"
  printf 'control_installed_manifest_sha256=%s\n' "$control_installed_manifest_sha"
  printf 'helper_installed_manifest_sha256=%s\n' "$helper_installed_manifest_sha"
  printf 'control_generation=%s\n' "$control_generation"
  printf 'helper_generation=%s\n' "$helper_generation"
  printf 'completed_at=%s\n' "$(date -u +%FT%TZ)"
} > "$services_marker_temp"
chown root:root "$services_marker_temp"
chmod 0600 "$services_marker_temp"
mv -f "$services_marker_temp" "$services_marker"
services_marker_temp=

install -d -m 0700 "$(dirname -- "$deployment_marker")"
marker_temp=$(mktemp "${deployment_marker}.tmp.XXXXXX")
{
  printf 'schema=2\n'
  printf 'deployment=native-debian-production\n'
  printf 'hostname=%s\n' "$fqdn"
  printf 'installer_sha256=%s\n' "$installer_sha256"
  printf 'module_version=%s\n' "$module_version"
  printf 'control_payload_sha256=%s\n' "$control_payload_sha"
  printf 'helper_payload_sha256=%s\n' "$helper_payload_sha"
  printf 'control_installed_manifest_sha256=%s\n' "$control_installed_manifest_sha"
  printf 'helper_installed_manifest_sha256=%s\n' "$helper_installed_manifest_sha"
  printf 'completed_at=%s\n' "$(date -u +%FT%TZ)"
} > "$marker_temp"
chown root:root "$marker_temp"
chmod 0600 "$marker_temp"
test -s "$marker_temp"
mv -f "$marker_temp" "$deployment_marker"
marker_temp=

if [ "$module_replacement_active" = true ]; then
  rm -rf -- "$module_backup"
  module_replacement_active=false
fi
service_transaction_active=false
if ! rm -rf -- "$service_snapshot_root"; then
  printf '%s\n' "The completed service transaction snapshot could not be removed from $service_snapshot_root." >&2
fi
if [ "$control_previous_kind" != legacy ] && [ "$helper_previous_kind" != legacy ]; then
  if ! rmdir "$service_transaction_root"; then
    printf '%s\n' "The empty service transaction directory could not be removed from $service_transaction_root." >&2
  fi
else
  printf '%s\n' "The pre-generation service directories were retained at $service_transaction_root for reviewed migration or removal."
fi

echo "The native FreePBX, Asterisk, MaterialPBX module, control plane, and privileged helper passed their bounded local readiness probes. Configure HTTPS, the host firewall, provider ACLs, backups, restore drills, and monitoring before carrying calls."
