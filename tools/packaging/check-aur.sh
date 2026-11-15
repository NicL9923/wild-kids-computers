#!/usr/bin/env bash
# Validates the AUR package against the Arch package in release/, before a release exists: fills
# a copy of the PKGBUILD from local checksums, checks .SRCINFO with makepkg, builds the package,
# runs namcap on both, and then installs and launches the result like the other package checks.
# Needs podman and `npm run dist` on Linux. Output goes to reports/packaging/aur/.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/reports/packaging/aur"
podman unshare rm -rf "$out"
mkdir -p "$out/build" "$out/package"
cp -r "$root/packaging/aur/wild-kids-computers-bin/." "$out/build/"
node "$root/tools/packaging/release.ts" checksums "$root/release"
node "$root/tools/packaging/aurPackage.ts" "$root/release/SHA256SUMS" "$out/build"
# makepkg uses a source file that is already beside the PKGBUILD instead of downloading it.
cp "$root"/release/*.pkg.tar.zst "$out/build/"

podman run --rm --interactive --security-opt label=disable \
  --volume "$out:/aur" docker.io/library/archlinux:latest bash -s << 'CONTAINER'
set -euo pipefail
pacman -Syu --noconfirm > /dev/null
pacman -S --noconfirm --needed base-devel namcap > /dev/null
useradd --create-home builder
chown -R builder /aur
cd /aur/build
runuser -u builder -- makepkg --printsrcinfo > /aur/srcinfo.generated
if diff -u .SRCINFO /aur/srcinfo.generated > /aur/srcinfo.diff; then echo "srcinfo_matches=yes"; else echo "srcinfo_matches=no"; fi > /aur/result.txt
runuser -u builder -- makepkg --force --nodeps > /aur/makepkg.log 2>&1 && echo "makepkg=yes" >> /aur/result.txt || echo "makepkg=no" >> /aur/result.txt
cp ./*-bin-*.pkg.tar.zst /aur/package/
# namcap reads library links against installed packages, so the dependencies go in first.
pacman -S --noconfirm --needed $(sed -n 's/^\tdepends = //p' .SRCINFO) > /dev/null
namcap PKGBUILD > /aur/namcap-pkgbuild.txt 2>&1 || true
namcap /aur/package/*.pkg.tar.zst > /aur/namcap-package.txt 2>&1 || true
chown -R root:root /aur
CONTAINER
cat "$out/result.txt"
echo "namcap on the PKGBUILD:"
cat "$out/namcap-pkgbuild.txt"
echo "namcap on the package:"
cat "$out/namcap-package.txt"
grep -qx 'srcinfo_matches=yes' "$out/result.txt" && grep -qx 'makepkg=yes' "$out/result.txt"

# The AUR-built package then goes through the same install and launch check as the release one.
check="$out/check"
mkdir -p "$check"
podman run --rm --security-opt label=disable --cap-add SYS_ADMIN,NET_ADMIN,NET_RAW \
  --security-opt seccomp=unconfined --shm-size 1g \
  --volume "$out/package:/release:ro" \
  --volume "$root/tools/packaging/container:/checks:ro" \
  --volume "$check:/out" \
  docker.io/library/archlinux:latest bash /checks/run-check.sh pacman "/release/$(basename "$out"/package/*.pkg.tar.zst)" /out || true
node "$root/tools/packaging/summarizeCheck.ts" "$check/result.txt" "$check/session.txt"
