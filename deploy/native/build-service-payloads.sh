#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd)
command -v realpath >/dev/null 2>&1 || { echo "GNU realpath is required to validate the native payload output path." >&2; exit 69; }
output_dir=${MATERIALPBX_NATIVE_PAYLOAD_OUTPUT:-$repo_root/dist/native-services}
output_dir=$(realpath -m -s -- "$output_dir")
output_parent=$(dirname -- "$output_dir")
stage=
previous=
activation_complete=false
activation_started=false
previous_moved=false
new_activated=false

fail() {
  printf '%s\n' "$1" >&2
  exit "${2:-1}"
}

validate_output_path() {
  case "$output_dir" in
    /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
      fail "Refusing unsafe native payload output path: $output_dir" 64
      ;;
  esac
  test "$output_dir" != "$repo_root" || fail "The native payload output cannot replace the repository root." 64
  test "$output_parent" != "$output_dir" || fail "The native payload output must have a distinct parent directory." 64

  probe=$output_parent
  while [ "$probe" != / ]; do
    if [ -e "$probe" ] || [ -L "$probe" ]; then
      test ! -L "$probe" || fail "The native payload output path crosses a symbolic-link ancestor: $probe" 64
      test -d "$probe" || fail "The native payload output parent is not a directory: $probe" 64
    fi
    probe=$(dirname -- "$probe")
  done
  if [ -e "$output_dir" ] || [ -L "$output_dir" ]; then
    test ! -L "$output_dir" || fail "The native payload output cannot be a symbolic link." 64
    test -d "$output_dir" || fail "The native payload output must be a directory when it already exists." 64
  fi
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e
  if [ "$activation_complete" != true ] && [ "$activation_started" = true ]; then
    if [ "$previous_moved" = true ] && [ -n "$previous" ] && [ -d "$previous" ]; then
      if [ "$new_activated" = true ] && { [ -e "$output_dir" ] || [ -L "$output_dir" ]; }; then rm -rf -- "$output_dir"; fi
      if [ ! -e "$output_dir" ] && ! mv -- "$previous" "$output_dir"; then
        printf '%s\n' "Native payload activation failed and the last-good output could not be restored from $previous." >&2
        exit 71
      fi
      previous=
    elif [ "$new_activated" = true ] && [ -e "$output_dir" ]; then
      rm -rf -- "$output_dir"
    fi
  fi
  if [ -n "$stage" ] && [ -e "$stage" ]; then rm -rf -- "$stage"; fi
  if [ "$activation_complete" = true ] && [ -n "$previous" ] && [ -e "$previous" ]; then rm -rf -- "$previous"; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

validate_output_path

command -v node >/dev/null 2>&1 || { echo "Node.js 22 or newer is required to build the native service payloads." >&2; exit 69; }
node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
test "$node_major" -ge 22 || { echo "Node.js 22 or newer is required to build the native service payloads." >&2; exit 69; }
command -v npm >/dev/null 2>&1 || { echo "npm is required to run the repository build scripts." >&2; exit 69; }

for project in packages/protocol services/control-plane services/privileged-helper; do
  test -d "$repo_root/$project/node_modules" || {
    echo "The locked repository dependencies for $project are absent. Run the repository dependency fetcher before building; this script will not perform a network install." >&2
    exit 69
  }
done

npm --prefix "$repo_root/packages/protocol" run build
npm --prefix "$repo_root/services/control-plane" run build
npm --prefix "$repo_root/services/privileged-helper" run build

install -d -m 0755 "$output_parent"
stage=$(mktemp -d "$output_parent/.native-services.stage.XXXXXX")

bundle_service() {
  service=$1
  source_dir=$repo_root/services/$service
  bundle_stage=$stage/$service
  install -d -m 0755 "$bundle_stage"
  cp -a "$source_dir/dist" "$bundle_stage/dist"
  cp -aL "$source_dir/node_modules" "$bundle_stage/node_modules"
  cp "$source_dir/package.json" "$bundle_stage/package.json"
  cp "$source_dir/package-lock.json" "$bundle_stage/package-lock.json"
  npm --prefix "$bundle_stage" prune --omit=dev --ignore-scripts --offline
  # npm writes this install-state cache with a leading dot. It is not needed at
  # runtime and cannot be admitted by the installed payload path grammar.
  rm -f -- "$bundle_stage/node_modules/.package-lock.json"
  # Runtime services invoke no package CLIs. npm's leading-dot shim directory
  # is outside the immutable manifest grammar and would be unused after install.
  rm -rf -- "$bundle_stage/node_modules/.bin"
  # thread-stream publishes its upstream test fixtures in the production
  # package, including one ZIP whose directory contains spaces. The service
  # never imports those fixtures, and immutable payloads intentionally admit
  # runtime files only.
  rm -rf -- "$bundle_stage/node_modules/thread-stream/test"
  rm -rf -- "$bundle_stage/node_modules/@materialpbx/protocol"
  install -d -m 0755 "$bundle_stage/node_modules/@materialpbx/protocol"
  cp -a "$repo_root/packages/protocol/dist" "$bundle_stage/node_modules/@materialpbx/protocol/dist"
  cp "$repo_root/packages/protocol/package.json" "$bundle_stage/node_modules/@materialpbx/protocol/package.json"
  if find "$bundle_stage" -type l -print -quit | grep -q .; then
    echo "The $service payload contains a symbolic link." >&2
    exit 65
  fi
  if find "$bundle_stage" ! -type d ! -type f -print -quit | grep -q .; then
    echo "The $service payload contains a special file." >&2
    exit 65
  fi
  test -s "$bundle_stage/dist/server.js" || { echo "The $service build did not produce dist/server.js." >&2; exit 65; }
  test -s "$bundle_stage/node_modules/@materialpbx/protocol/dist/index.js" || { echo "The $service bundle did not contain the built protocol runtime." >&2; exit 65; }
  node --check "$bundle_stage/dist/server.js"
  if find "$bundle_stage" -perm /7022 -print -quit | grep -q .; then
    echo "The $service payload contains a special mode or group/world-writable inode." >&2
    exit 65
  fi
  if ! find "$bundle_stage" -type f -printf '%P\n' | LC_ALL=C awk '
    $0 !~ /^[A-Za-z0-9@][A-Za-z0-9@._\/-]*$/ { print "invalid payload path: " $0 > "/dev/stderr"; bad=1 }
    $0 ~ /(^|[/])\.\.([/]|$)/ || $0 ~ /(^|[/])\.([/]|$)/ || $0 ~ /[/][/]/ { print "unsafe payload path: " $0 > "/dev/stderr"; bad=1 }
    seen[$0]++ { print "duplicate payload path: " $0 > "/dev/stderr"; bad=1 }
    END { exit bad ? 1 : 0 }
  '; then
    echo "The $service payload contains a file path outside the installed manifest grammar." >&2
    exit 65
  fi
  (
    cd "$bundle_stage"
    find . -type f ! -path './dist/payload-files.sha256' -printf '%P\0' | LC_ALL=C sort -z | xargs -0 sha256sum > "$stage/$service.payload-files.sha256"
  )
  mv "$stage/$service.payload-files.sha256" "$bundle_stage/dist/payload-files.sha256"
  (cd "$bundle_stage" && test -s dist/payload-files.sha256 && sha256sum -c dist/payload-files.sha256 >/dev/null)
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -C "$bundle_stage" -cf - . | gzip -n > "$stage/$service.tar.gz"
  test -s "$stage/$service.tar.gz"
  tar -tzf "$stage/$service.tar.gz" | grep -Fxq './dist/server.js'
  rm -rf -- "$bundle_stage"
}

bundle_service control-plane
bundle_service privileged-helper
(
  cd "$stage"
  sha256sum control-plane.tar.gz privileged-helper.tar.gz > manifest.sha256
  sha256sum -c manifest.sha256 >/dev/null
)

if [ -e "$output_dir" ]; then
  previous="${output_dir}.previous.$(date -u +%Y%m%dT%H%M%SZ).$$"
  test ! -e "$previous" || fail "The native payload rollback path already exists: $previous" 73
  activation_started=true
  mv "$output_dir" "$previous"
  previous_moved=true
else
  activation_started=true
fi
mv "$stage" "$output_dir"
new_activated=true
test -s "$output_dir/control-plane.tar.gz"
test -s "$output_dir/privileged-helper.tar.gz"
(cd "$output_dir" && sha256sum -c manifest.sha256 >/dev/null)
activation_complete=true
stage=
if [ -n "$previous" ]; then rm -rf -- "$previous"; previous=; fi

echo "Native service payloads built at $output_dir without installing network packages."
