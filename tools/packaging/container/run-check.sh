#!/usr/bin/env bash
# Runs as root inside a fresh distribution container. Installs one Linux build of the app the
# way a person would, checks that every library it links resolves, starts it as an ordinary user
# under a headless Wayland compositor in a network namespace that captures every packet, and
# removes it again.
#
#   run-check.sh <kind> <artifact> <out-dir>
#
# kind is pacman, deb, rpm, appimage, appimage-extract, or tarball. artifact is a path under
# /release. Results go to <out-dir>/result.txt as key=value lines, beside the session's files.
set -euo pipefail

kind=$1
artifact=$2
out=$3
here=$(dirname "$(readlink -f "$0")")
mkdir -p "$out"
# Container root is the person running the check, so handing the files back lets them read and
# delete the results.
trap 'chown -R root:root "$out"' EXIT
result="$out/result.txt"
: > "$result"
note() { printf '%s=%s\n' "$1" "$2" >> "$result"; }
fail() {
  note error "$1"
  echo "run-check: $1" >&2
  exit 1
}

app=wild-kids-computers
install_dir="/opt/Wild Kids - Computers"
. /etc/os-release
note image "$PRETTY_NAME"
note kind "$kind"
note artifact "$(basename "$artifact")"

case $ID in
  arch)
    pm_install() { pacman -S --noconfirm --needed "$@" > /dev/null; }
    # Arch supports only full upgrades, and the image is older than the repositories.
    pacman -Syu --noconfirm > /dev/null
    ;;
  ubuntu | debian)
    export DEBIAN_FRONTEND=noninteractive
    pm_install() { apt-get install -y --no-install-recommends "$@" > /dev/null; }
    apt-get update -qq > /dev/null
    ;;
  fedora)
    pm_install() { dnf install -y -q --setopt=install_weak_deps=False "$@" > /dev/null; }
    ;;
  *) fail "unsupported image $ID" ;;
esac

# Every ELF file the app ships must find each library it links, from the system or the app.
check_libraries() {
  local dir=$1 missing
  missing=$(find "$dir" -maxdepth 1 -type f \( -name "$app" -o -name '*.so*' -o -name chrome_crashpad_handler -o -name chrome-sandbox \) \
    -exec sh -c 'LD_LIBRARY_PATH="$1" ldd "$2" 2> /dev/null | grep "not found" | sed "s|^|$(basename "$2"): |"' _ "$dir" {} \; | sort -u)
  if [ -n "$missing" ]; then
    printf '%s\n' "$missing" > "$out/missing-libraries.txt"
    note libraries_resolve no
  else
    note libraries_resolve yes
  fi
}

user_home=/home/kid
launch=()
case $kind in
  pacman)
    pacman -U --noconfirm "$artifact" > "$out/install.log" 2>&1 || fail "pacman -U failed"
    ;;
  deb)
    apt-get install -y "$artifact" > "$out/install.log" 2>&1 || fail "apt-get install failed"
    ;;
  rpm)
    dnf install -y "$artifact" > "$out/install.log" 2>&1 || fail "dnf install failed"
    ;;
  appimage | appimage-extract | tarball)
    # The AppImage and the tarball carry no dependency list. They use the libraries every desktop
    # already has, which a bare container image lacks, so the check adds a desktop's set.
    case $ID in
      arch) pm_install alsa-lib gtk3 libcups libpulse mesa nss > "$out/install.log" 2>&1 ;;
      ubuntu | debian) pm_install libasound2t64 libgbm1 libgtk-3-0t64 libnss3 libpulse0 libcups2t64 > "$out/install.log" 2>&1 ;;
      fedora) pm_install alsa-lib cups-libs gtk3 mesa-libgbm nss pulseaudio-libs > "$out/install.log" 2>&1 ;;
    esac
    ;;
  *) fail "unknown kind $kind" ;;
esac
note installed yes

case $kind in
  pacman | deb | rpm)
    check_libraries "$install_dir"
    note sandbox_helper_mode "$(stat -c '%a %U' "$install_dir/chrome-sandbox")"
    if [ "$ID" = ubuntu ]; then
      # Ubuntu 24.04 and later need the AppArmor profile the deb installs to let the sandbox make
      # user namespaces. The container has no AppArmor to load it into, so this parses it the way
      # the install script's own dry run does.
      pm_install apparmor
      if apparmor_parser --skip-kernel-load --debug "$install_dir/resources/apparmor-profile" > "$out/apparmor.log" 2>&1; then
        note apparmor_profile_parses yes
      else
        note apparmor_profile_parses no
      fi
    fi
    note command "$(readlink -f /usr/bin/$app || echo missing)"
    desktop=/usr/share/applications/$app.desktop
    [ -f "$desktop" ] || fail "no desktop entry at $desktop"
    cp "$desktop" "$out/"
    note desktop_icon "$(find /usr/share/icons/hicolor -name "$app.png" | wc -l)"
    # Start it the way a launcher does: the Exec line of the desktop entry, without the field code.
    exec_line=$(sed -n 's/^Exec=//p' "$desktop" | sed 's/ %U$//')
    eval "launch=($exec_line)"
    ;;
esac

# The tools the check needs, installed after the ldd check so they cannot hide a missing library.
case $ID in
  arch) pm_install sway grim jq tcpdump iproute2 procps-ng fuse3 > /dev/null ;;
  ubuntu | debian) pm_install sway grim jq tcpdump iproute2 procps fuse3 ca-certificates > /dev/null ;;
  fedora) pm_install sway grim jq tcpdump iproute procps-ng fuse3 util-linux shadow-utils > /dev/null ;;
esac
if [ "${WKC_COMPOSITOR:-sway}" = hyprland ]; then pm_install hyprland > /dev/null; fi
# Some distributions give sway a file capability for realtime scheduling, which a container
# cannot grant. A copy without it runs everywhere.
install -m 0755 "$(command -v sway)" /usr/local/bin/sway
# Xwayland must not be there to fall back to.
if command -v Xwayland > /dev/null && [ "${WKC_COMPOSITOR:-sway}" = sway ]; then
  note xwayland_installed yes
else
  note xwayland_installed no
fi

# The AppImage must run with FUSE 3 alone, as on a fresh Omarchy or Ubuntu.
if ldconfig -p 2> /dev/null | grep -q 'libfuse.so.2 '; then note fuse2_present yes; else note fuse2_present no; fi

id kid > /dev/null 2>&1 || useradd --create-home --home-dir "$user_home" kid
chown -R kid "$out"

case $kind in
  appimage)
    install -o kid -m 0755 "$artifact" "$user_home/$app.AppImage"
    launch=("$user_home/$app.AppImage")
    ;;
  appimage-extract)
    install -o kid -m 0755 "$artifact" "$user_home/$app.AppImage"
    launch=("$user_home/$app.AppImage" --appimage-extract-and-run)
    ;;
  tarball)
    runuser -u kid -- mkdir -p "$user_home/apps"
    runuser -u kid -- tar -xzf "$artifact" -C "$user_home/apps"
    dir=$(find "$user_home/apps" -mindepth 1 -maxdepth 1 -type d | head -n 1)
    check_libraries "$dir"
    note sandbox_helper_mode "$(stat -c '%a %U' "$dir/chrome-sandbox")"
    launch=("$dir/$app")
    ;;
esac

# A new network namespace whose only way out is a dummy interface. Every packet the app sends,
# to the loopback proxy or to any address, lands in the capture, and none reaches a network.
session_status=0
unshare --net -- bash -s -- "$out" "$here" "${launch[@]}" << 'NETNS' || session_status=$?
set -euo pipefail
out=$1
here=$2
shift 2
ip link set lo up
ip link add wkc0 type dummy
ip addr add 10.203.0.1/24 dev wkc0
ip -6 addr add fd00:203::1/64 dev wkc0 nodad
ip link set wkc0 up
ip route add default via 10.203.0.254 dev wkc0
ip -6 route add default via fd00:203::fe dev wkc0
# The kernel's own neighbor discovery and multicast reports on the new interface are ICMPv6. The
# app cannot send ICMP from its sandbox, so the capture leaves ICMPv6 out and counts the rest.
tcpdump -i any -n -U -w "$out/network.pcap" 'not icmp6' > "$out/tcpdump.log" 2>&1 &
tcpdump_pid=$!
sleep 1
status=0
runuser -u kid -- env WKC_COMPOSITOR="${WKC_COMPOSITOR:-sway}" "$here/session.sh" "$out" "$@" || status=$?
sleep 1
kill -INT "$tcpdump_pid"
wait "$tcpdump_pid" || true
packets=$(tcpdump -r "$out/network.pcap" -n 2> /dev/null | tee "$out/packets.txt" | wc -l)
printf 'network_packets=%s\n' "$packets" >> "$out/result.txt"
exit "$status"
NETNS
note session_status "$session_status"

case $kind in
  pacman) pacman -R --noconfirm "$app" > "$out/remove.log" 2>&1 || fail "pacman -R failed" ;;
  deb) apt-get purge -y "$app" > "$out/remove.log" 2>&1 || fail "apt-get purge failed" ;;
  rpm) dnf remove -y "$app" > "$out/remove.log" 2>&1 || fail "dnf remove failed" ;;
esac
case $kind in
  pacman | deb | rpm)
    left=""
    for path in "$install_dir" "/usr/bin/$app" "/usr/share/applications/$app.desktop" "/usr/share/icons/hicolor/256x256/apps/$app.png"; do
      if [ -e "$path" ] || [ -L "$path" ]; then left="$left $path"; fi
    done
    note removed_cleanly "$([ -z "$left" ] && echo yes || echo "no:$left")"
    ;;
esac
