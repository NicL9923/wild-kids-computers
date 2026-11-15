#!/usr/bin/env bash
# Runs end-to-end specs against the unpackaged build on native Wayland: an Arch Linux container,
# a headless sway with no X server, and Playwright driving Electron as an ordinary user. Run
# `npm run build` first. Output goes to reports/packaging/e2e-wayland/.
#
#   tools/packaging/e2e-wayland.sh                       the default set below
#   tools/packaging/e2e-wayland.sh e2e/smoke.spec.ts     only these specs
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/reports/packaging/e2e-wayland"
node_home=$(dirname "$(dirname "$(readlink -f "$(command -v node)")")")
mkdir -p "$out"

specs=("$@")
if [ ${#specs[@]} -eq 0 ]; then
  specs=(
    e2e/smoke.spec.ts
    e2e/shell
    e2e/network/noNetwork.spec.ts
    e2e/network/rendererIsolation.spec.ts
    e2e/activities/pop-the-seed-pods.spec.ts
    e2e/activities/open-and-close.spec.ts
    e2e/paint
  )
fi

# The same user id as the person running this, so test output in the checkout stays theirs.
podman run --rm --interactive \
  --security-opt label=disable \
  --security-opt seccomp=unconfined \
  --cap-add SYS_ADMIN \
  --shm-size 2g \
  --userns keep-id \
  --user root \
  --env HOST_UID="$(id -u)" \
  --volume "$root:$root" \
  --volume "$node_home:/opt/node:ro" \
  --workdir "$root" \
  docker.io/library/archlinux:latest bash -s -- "$out" "${specs[@]}" << 'CONTAINER'
set -euo pipefail
out=$1
shift
pacman -Syu --noconfirm > /dev/null
# What the Arch package depends on, plus the compositor. No Xwayland and no X server.
pacman -S --noconfirm --needed alsa-lib at-spi2-core gtk3 libcups libpulse mesa nss sway jq procps-ng > /dev/null
install -m 0755 "$(command -v sway)" /usr/local/bin/sway
user=$(getent passwd "$HOST_UID" | cut -d: -f1)
runuser -u "$user" -- bash -s -- "$out" "$@" << 'SESSION'
set -euo pipefail
out=$1
shift
export PATH="/opt/node/bin:$PATH"
XDG_RUNTIME_DIR=$(mktemp -d)
export XDG_RUNTIME_DIR XDG_SESSION_TYPE=wayland WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1
unset DISPLAY
sway --unsupported-gpu --config tools/packaging/container/sway.conf > "$out/compositor.log" 2>&1 &
for _ in $(seq 1 100); do [ -S "$XDG_RUNTIME_DIR/wayland-1" ] && break; sleep 0.1; done
export WAYLAND_DISPLAY=wayland-1 npm_config_update_notifier=false
SWAYSOCK=$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'sway-ipc.*' -print -quit)
export SWAYSOCK
{
  echo "image=$(. /etc/os-release && echo "$PRETTY_NAME")"
  echo "xwayland=$(command -v Xwayland || echo none)"
  echo "specs=$*"
} > "$out/environment.txt"
# Every window the tests open, sampled once a second, shows which shell it used.
while sleep 1; do
  swaymsg -t get_tree 2> /dev/null | jq -r '.. | objects | select(.app_id? != null) | "\(.app_id) \(.shell)"'
done >> "$out/windows.raw" &
sampler=$!
status=0
npx playwright test --project=electron --reporter=list "$@" > "$out/playwright.log" 2>&1 || status=$?
kill "$sampler" 2> /dev/null || true
sort -u "$out/windows.raw" > "$out/windows.txt"
rm -f "$out/windows.raw"
echo "exit=$status" >> "$out/environment.txt"
exit "$status"
SESSION
CONTAINER
