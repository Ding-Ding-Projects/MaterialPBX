#!/bin/sh
set -eu

marker=/var/lib/materialpbx/freepbx-installed
lock=/run/materialpbx-firstboot.lock
mkdir -p /var/lib/materialpbx
exec 9>"$lock"
flock -n 9 || { echo "Another first-boot installation is already active." >&2; exit 75; }

test "$(dpkg --print-architecture)" = amd64 || { echo "MaterialPBX currently supports Debian 12 amd64 only." >&2; exit 64; }
test -f "$marker" && exit 0
test "$(sha256sum /usr/local/libexec/freepbx17-install.sh | cut -d' ' -f1)" = "afef5e4b480cf545b2035f92068dc2fdd32452989d170a16a84acb6e37b7d564" || {
  echo "The pinned FreePBX installer digest does not match." >&2
  exit 65
}

echo "Starting the pinned FreePBX 17 installer. Detailed logs are written by the upstream installer under /var/log/pbx/."
/usr/local/libexec/freepbx17-install.sh

fwconsole --version >/dev/null
asterisk -rx 'core show version' >/dev/null
rm -rf /var/www/html/admin/modules/materialpbx
install -d -m 0755 /var/www/html/admin/modules/materialpbx
cp -a /usr/src/materialpbx-freepbx-module/. /var/www/html/admin/modules/materialpbx/
fwconsole ma install materialpbx
/usr/local/libexec/materialpbx-configure-integrations.sh
install -d -o 991 -g 991 -m 0750 /var/lib/materialpbx/control-plane
install -m 0600 /dev/null "$marker"
date -u +%FT%TZ > "$marker"
systemctl enable --now materialpbx-privileged-helper.service
echo "FreePBX and Asterisk initialized. Host firewall and fail2ban policy remain the host administrator's responsibility."
