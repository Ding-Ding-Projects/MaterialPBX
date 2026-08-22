#!/bin/sh
set -eu

secret_dir=/run/materialpbx-secrets
for name in ami-secret ari-secret; do
  test -s "$secret_dir/$name" || { echo "Missing required integration credential file: $secret_dir/$name" >&2; exit 66; }
done

umask 077
ami_secret=$(tr -d '\r\n' < "$secret_dir/ami-secret")
ari_secret=$(tr -d '\r\n' < "$secret_dir/ari-secret")

cat > /etc/asterisk/manager_custom.conf <<EOF
[materialpbx]
secret=${ami_secret}
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
read=system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate
write=system,call,command,agent,user,config,dtmf,reporting,originate
writetimeout=1000
EOF

cat > /etc/asterisk/ari_custom.conf <<EOF
[materialpbx]
type=user
read_only=no
password=${ari_secret}
password_format=plain
EOF

cat > /etc/asterisk/http_custom.conf <<'EOF'
[general]
enabled=yes
bindaddr=127.0.0.1
bindport=8088
EOF

php -r '
  include "/etc/freepbx.conf";
  $user = $amp_conf["AMPDBUSER"] ?? "freepbxuser";
  $pass = $amp_conf["AMPDBPASS"] ?? null;
  $name = $amp_conf["AMPDBNAME"] ?? "asterisk";
  if (!is_string($pass) || $pass === "") { fwrite(STDERR, "FreePBX database credential is unavailable.\n"); exit(1); }
  file_put_contents("/run/materialpbx-secrets/freepbx-dsn", "mysql://" . rawurlencode($user) . ":" . rawurlencode($pass) . "@127.0.0.1:3306/" . rawurlencode($name) . "\n", LOCK_EX);
  chmod("/run/materialpbx-secrets/freepbx-dsn", 0600);
'

fwconsole reload --quiet
