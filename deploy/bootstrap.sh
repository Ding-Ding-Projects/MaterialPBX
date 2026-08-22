#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this bootstrap with sudo so it can create the host secret directory and start the system container." >&2
  exit 77
fi
if [ "$#" -ne 1 ]; then
  echo "Usage: sudo ./deploy/bootstrap.sh https://pbx.example.net" >&2
  exit 64
fi
script_path=$(readlink -f -- "$0") || { echo "Cannot resolve the bootstrap path." >&2; exit 65; }
script_dir=$(CDPATH='' cd -- "$(dirname -- "$script_path")" && pwd -P) || { echo "Cannot resolve the bootstrap directory." >&2; exit 65; }
repo_root=$(CDPATH='' cd -- "$script_dir/.." && pwd -P) || { echo "Cannot resolve the repository root." >&2; exit 65; }
compose_file=$repo_root/docker-compose.yml
test -f "$compose_file" && test ! -L "$compose_file" || { echo "The expected repository-root docker-compose.yml is missing or is a symbolic link." >&2; exit 65; }
echo "This bootstrap starts a disposable container lab only. For hosted production on a persistent Debian 12 host, use deploy/production-bootstrap.sh."
public_url=$1
case "$public_url" in https://*) ;; *) echo "The public URL must use HTTPS." >&2; exit 64;; esac
test "$(uname -m)" = x86_64 || { echo "The current deployment supports amd64 hosts only." >&2; exit 64; }
test -r /etc/os-release || { echo "Cannot identify the host operating system." >&2; exit 65; }
# shellcheck source=/dev/null
. /etc/os-release
test "${ID:-}" = debian && test "${VERSION_ID:-}" = 12 || { echo "The current deployment supports Debian 12 only." >&2; exit 65; }
command -v docker >/dev/null 2>&1 || { echo "Docker Engine with the Compose plugin is required on the host." >&2; exit 69; }
docker compose version >/dev/null 2>&1 || { echo "The Docker Compose plugin is unavailable." >&2; exit 69; }

secret_dir=${MATERIALPBX_SECRET_DIR:-/etc/materialpbx/secrets}
case "$secret_dir" in /*) ;; *) echo "MATERIALPBX_SECRET_DIR must be an absolute host path." >&2; exit 64;; esac
install -d -m 0700 "$secret_dir"
secret_dir=$(readlink -f -- "$secret_dir") || { echo "Cannot resolve the host secret directory." >&2; exit 65; }
generate_secret() {
  path=$1
  if [ ! -s "$path" ]; then
    umask 077
    openssl rand -base64 48 | tr -d '\n' > "$path"
    printf '\n' >> "$path"
    chmod 0600 "$path"
  fi
}
generate_secret "$secret_dir/admin-token"
generate_secret "$secret_dir/ami-secret"
generate_secret "$secret_dir/ari-secret"
export MATERIALPBX_PUBLIC_URL="$public_url"
export MATERIALPBX_SECRET_DIR="$secret_dir"
export MATERIALPBX_HOSTNAME="${MATERIALPBX_HOSTNAME:-$(printf '%s' "$public_url" | sed -E 's#^https://([^/:]+).*#\1#')}"
export MATERIALPBX_NODE_NAME="${MATERIALPBX_NODE_NAME:-MaterialPBX}"

docker compose --project-directory "$repo_root" --file "$compose_file" --profile lab build --pull
docker compose --project-directory "$repo_root" --file "$compose_file" --profile lab up -d privileged-helper-image pbx control-plane

echo "MaterialPBX onboarding started. FreePBX first boot can take a substantial time."
echo "Follow progress with: docker compose --project-directory '$repo_root' --file '$compose_file' --profile lab logs -f pbx"
echo "The control plane binds to 127.0.0.1:${MATERIALPBX_CONTROL_PORT:-4280}; publish it only through the HTTPS URL ${public_url}."
echo "Configure the Debian host firewall and fail2ban before exposing SIP, HTTP, or RTP. The containers do not own host firewall policy."
