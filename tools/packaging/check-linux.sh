#!/usr/bin/env bash
# Installs and starts each Linux build in release/ on a fresh container of its distribution,
# under a headless Wayland compositor with no X server, and removes it again. Needs podman and
# the builds from `npm run dist` on Linux. Results and screenshots go to reports/packaging/.
#
#   tools/packaging/check-linux.sh                 every check
#   tools/packaging/check-linux.sh arch-pacman ... only these checks
#
# Each check writes reports/packaging/<check>/result.txt, and this script prints a summary and
# fails when a check did not install, start, map a native Wayland window, run sandboxed, close
# from the compositor, stay off the network, or remove cleanly. See tools/packaging/README.md.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
release="$root/release"
reports="$root/reports/packaging"

# check name, image, kind, artifact glob
CHECKS=(
  "arch-pacman docker.io/library/archlinux:latest pacman *.pkg.tar.zst"
  "arch-appimage docker.io/library/archlinux:latest appimage *.AppImage"
  "arch-tarball docker.io/library/archlinux:latest tarball *.tar.gz"
  "ubuntu-24.04-deb docker.io/library/ubuntu:24.04 deb *.deb"
  "ubuntu-26.04-deb docker.io/library/ubuntu:26.04 deb *.deb"
  "ubuntu-26.04-appimage docker.io/library/ubuntu:26.04 appimage-extract *.AppImage"
  "debian-13-deb docker.io/library/debian:13 deb *.deb"
  "fedora-rpm docker.io/library/fedora:latest rpm *.rpm"
  "fedora-tarball docker.io/library/fedora:latest tarball *.tar.gz"
)

selected=("$@")
failed=0
for line in "${CHECKS[@]}"; do
  read -r name image kind glob <<< "$line"
  if [ ${#selected[@]} -gt 0 ] && [[ ! " ${selected[*]} " =~ " $name " ]]; then continue; fi
  # shellcheck disable=SC2206 # the glob is meant to expand
  matches=("$release"/$glob)
  if [ ! -f "${matches[0]}" ]; then
    echo "$name: no release/$glob. Run npm run dist first." >&2
    failed=1
    continue
  fi
  out="$reports/$name"
  # An earlier run that stopped early can leave files owned by the container user.
  podman unshare rm -rf "$out"
  mkdir -p "$out"
  echo "== $name on $image"
  # The capabilities stay inside the container's user namespace. SYS_ADMIN and the unconfined
  # seccomp filter let the app make its own sandbox namespaces and mount the AppImage, as on a
  # desktop; NET_ADMIN and NET_RAW build the capture namespace. The app itself runs as an
  # ordinary user without them. Labels are off so SELinux hosts can share the checkout.
  podman run --rm \
    --security-opt label=disable \
    --cap-add SYS_ADMIN,NET_ADMIN,NET_RAW \
    --security-opt seccomp=unconfined \
    --device /dev/fuse \
    --shm-size 1g \
    --volume "$release:/release:ro" \
    --volume "$root/tools/packaging/container:/checks:ro" \
    --volume "$out:/out" \
    "$image" bash /checks/run-check.sh "$kind" "/release/$(basename "${matches[0]}")" /out ||
    true
  if ! node "$root/tools/packaging/summarizeCheck.ts" "$out/result.txt" "$out/session.txt"; then failed=1; fi
done
exit "$failed"
