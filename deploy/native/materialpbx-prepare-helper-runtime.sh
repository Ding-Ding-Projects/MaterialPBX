#!/bin/sh
set -eu

getent group materialpbx-socket >/dev/null 2>&1 || { echo "The MaterialPBX socket-access group is unavailable." >&2; exit 70; }
install -d -o root -g materialpbx-socket -m 0750 /run/materialpbx
rm -f -- /run/materialpbx/privileged.sock
