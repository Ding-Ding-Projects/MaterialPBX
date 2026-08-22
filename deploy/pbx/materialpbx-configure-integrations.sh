#!/bin/sh
set -eu

secret_dir=${MATERIALPBX_SECRETS_DIR:-/etc/materialpbx/secrets-input}
state_dir=${MATERIALPBX_CONTROL_STATE_DIR:-/var/lib/materialpbx/control-plane}
control_uid=${MATERIALPBX_CONTROL_UID:-991}
control_gid=${MATERIALPBX_CONTROL_GID:-991}
case "$control_uid:$control_gid" in *[!0-9:]*) echo "MaterialPBX control identity must use numeric user and group IDs." >&2; exit 64;; esac
for name in ami-secret ari-secret; do
  test -s "$secret_dir/$name" || { echo "Missing required integration credential file: $secret_dir/$name" >&2; exit 66; }
done
if [ "${1:-}" = "--check" ]; then
  exit 0
fi
test "$#" -eq 0 || { echo "Usage: materialpbx-configure-integrations.sh [--check]" >&2; exit 64; }

umask 077
ami_secret=$(tr -d '\r\n' < "$secret_dir/ami-secret")
ari_secret=$(tr -d '\r\n' < "$secret_dir/ari-secret")
test -n "$ami_secret" && test -n "$ari_secret" || { echo "Integration credential files must not be empty." >&2; exit 66; }

manager_temp=$(mktemp /etc/asterisk/manager_custom.conf.tmp.XXXXXX)
ari_temp=$(mktemp /etc/asterisk/ari_custom.conf.tmp.XXXXXX)
http_temp=$(mktemp /etc/asterisk/http_custom.conf.tmp.XXXXXX)
cleanup() {
  rm -f -- "$manager_temp" "$ari_temp" "$http_temp"
}
trap cleanup EXIT HUP INT TERM

cat > "$manager_temp" <<EOF
[materialpbx]
secret=${ami_secret}
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
read=system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write=system,call,command,agent,user,config,dtmf,reporting,originate
writetimeout=1000
EOF

cat > "$ari_temp" <<EOF
[materialpbx]
type=user
read_only=no
password=${ari_secret}
password_format=plain
EOF

cat > "$http_temp" <<'EOF'
[general]
enabled=yes
bindaddr=127.0.0.1
bindport=8088
EOF

for file in "$manager_temp" "$ari_temp" "$http_temp"; do
  test -s "$file"
  chown root:asterisk "$file"
  chmod 0640 "$file"
done
mv -f "$manager_temp" /etc/asterisk/manager_custom.conf
mv -f "$ari_temp" /etc/asterisk/ari_custom.conf
mv -f "$http_temp" /etc/asterisk/http_custom.conf

install -d -o "$control_uid" -g "$control_gid" -m 0750 "$state_dir"
export MATERIALPBX_DSN_PATH="$state_dir/freepbx-dsn"
# shellcheck disable=SC2016
php -r '
  include "/etc/freepbx.conf";
  $user = $amp_conf["AMPDBUSER"] ?? "freepbxuser";
  $pass = $amp_conf["AMPDBPASS"] ?? null;
  $name = $amp_conf["AMPDBNAME"] ?? "asterisk";
  $path = getenv("MATERIALPBX_DSN_PATH");
  if (!is_string($path) || $path === "") { fwrite(STDERR, "MaterialPBX database state path is unavailable.\n"); exit(1); }
  if (!is_string($pass) || $pass === "") { fwrite(STDERR, "FreePBX database credential is unavailable.\n"); exit(1); }
  $temporary = $path . ".tmp." . bin2hex(random_bytes(8));
  try {
    $payload = "mysql://" . rawurlencode($user) . ":" . rawurlencode($pass) . "@127.0.0.1:3306/" . rawurlencode($name) . "\n";
    if (file_put_contents($temporary, $payload, LOCK_EX) !== strlen($payload)) { throw new RuntimeException("Could not write MaterialPBX database state."); }
    $uid = filter_var(getenv("MATERIALPBX_CONTROL_UID"), FILTER_VALIDATE_INT, ["options" => ["min_range" => 0]]);
    $gid = filter_var(getenv("MATERIALPBX_CONTROL_GID"), FILTER_VALIDATE_INT, ["options" => ["min_range" => 0]]);
    if ($uid === false || $gid === false) { throw new RuntimeException("MaterialPBX control identity is invalid."); }
    if (!chown($temporary, $uid) || !chgrp($temporary, $gid)) { throw new RuntimeException("Could not assign MaterialPBX database state ownership."); }
    chmod($temporary, 0600);
    if (!rename($temporary, $path)) { throw new RuntimeException("Could not publish MaterialPBX database state."); }
  } finally {
    if (file_exists($temporary)) { unlink($temporary); }
  }
'
test -s "$state_dir/freepbx-dsn"

timeout 180s fwconsole reload --quiet
