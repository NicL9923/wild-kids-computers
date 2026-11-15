#!/usr/bin/env bash
# Runs inside a check container as the unprivileged user. Starts a headless Wayland compositor
# with no X server, launches the app with the given command, and records what a person at the
# screen would see: the window's app id and shell, a screenshot of the first screen, whether
# each renderer is sandboxed, and whether a close from the compositor ends the app.
#
#   session.sh <out-dir> <command...>
#
# The compositor is sway, or Hyprland when WKC_COMPOSITOR=hyprland. Results go to
# <out-dir>/session.txt as key=value lines; run-check.sh reads them.
set -euo pipefail

out=$1
shift
mkdir -p "$out"
result="$out/session.txt"
: > "$result"
note() { printf '%s=%s\n' "$1" "$2" >> "$result"; }

app_id=wild-kids-computers
compositor=${WKC_COMPOSITOR:-sway}
here=$(dirname "$(readlink -f "$0")")

XDG_RUNTIME_DIR=$(mktemp -d)
export XDG_RUNTIME_DIR
chmod 700 "$XDG_RUNTIME_DIR"
# No X server and no X display. The app can only show a window as a native Wayland client.
unset DISPLAY WAYLAND_DISPLAY
# A Wayland login sets this. Electron 38 and later choose Wayland from it.
export XDG_SESSION_TYPE=wayland

case $compositor in
  sway)
    export WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1
    # The host's GPU driver can show through the container. sway draws with pixman here and never
    # touches it, so its driver check does not apply.
    sway --unsupported-gpu --config "$here/sway.conf" > "$out/compositor.log" 2>&1 &
    ;;
  hyprland)
    export AQ_NO_KMS_REQUIREMENT=1 LIBGL_ALWAYS_SOFTWARE=1
    Hyprland --config "$here/hyprland.conf" > "$out/compositor.log" 2>&1 &
    ;;
  *)
    echo "Unknown compositor $compositor" >&2
    exit 2
    ;;
esac
compositor_pid=$!
note compositor "$compositor"

for _ in $(seq 1 100); do
  socket=$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'wayland-*' ! -name '*.lock' -print -quit)
  [ -n "$socket" ] && break
  sleep 0.1
done
if [ -z "${socket:-}" ]; then
  note compositor_started no
  exit 1
fi
note compositor_started yes
export WAYLAND_DISPLAY
WAYLAND_DISPLAY=$(basename "$socket")
if [ "$compositor" = sway ]; then
  SWAYSOCK=$(find "$XDG_RUNTIME_DIR" -maxdepth 1 -name 'sway-ipc.*' -print -quit)
  export SWAYSOCK
fi

# The window this app id names, as JSON with app_id, shell, and size, or nothing.
find_window() {
  if [ "$compositor" = sway ]; then
    swaymsg -t get_tree 2> /dev/null |
      jq -c --arg id "$app_id" '[.. | objects | select(.app_id? == $id)] | first // empty
        | {app_id, shell, width: .rect.width, height: .rect.height, fullscreen: .fullscreen_mode}'
  else
    hyprctl clients -j 2> /dev/null |
      jq -c --arg id "$app_id" '[.[] | select(.class == $id)] | first // empty
        | {app_id: .class, shell: (if .xwayland then "xwayland" else "xdg_shell" end),
           width: .size[0], height: .size[1], fullscreen: .fullscreen}'
  fi
}

close_window() {
  if [ "$compositor" = sway ]; then
    swaymsg "[app_id=\"$app_id\"] kill" > /dev/null
  else
    hyprctl dispatch closewindow "class:^($app_id)$" > /dev/null
  fi
}

"$@" > "$out/app.log" 2>&1 &
app_pid=$!

window=""
for _ in $(seq 1 600); do
  window=$(find_window || true)
  [ -n "$window" ] && break
  kill -0 "$app_pid" 2> /dev/null || break
  sleep 0.1
done
if [ -z "$window" ]; then
  note window_mapped no
  if [ "$compositor" = sway ]; then swaymsg -t get_tree > "$out/tree.json" 2>&1 || true; fi
  kill "$app_pid" 2> /dev/null || true
  kill "$compositor_pid" 2> /dev/null || true
  exit 1
fi
note window_mapped yes
note window "$window"

# The first screen speaks and fades in. Give it time to settle before the picture.
sleep 6
grim "$out/first-screen.png" && note screenshot first-screen.png

# Every process of the app runs the same executable. The browser process has no --type switch.
browser=""
renderers=()
for pid in $(pgrep -f -- "$app_id" || true); do
  exe=$(readlink "/proc/$pid/exe" 2> /dev/null || true)
  [ "$(basename "$exe")" = "$app_id" ] || continue
  cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2> /dev/null || true)
  case $cmdline in
    *--type=renderer*) renderers+=("$pid") ;;
    *--type=*) ;;
    *) browser=$pid ;;
  esac
done
note browser_pid "${browser:-none}"
[ -n "$browser" ] && note browser_exe "$(readlink "/proc/$browser/exe")"
note renderer_count "${#renderers[@]}"
if [ -n "$browser" ]; then
  if tr '\0' '\n' < "/proc/$browser/cmdline" | grep -qx -- '--no-sandbox'; then
    note browser_no_sandbox_switch yes
  else
    note browser_no_sandbox_switch no
  fi
  note browser_env_display "$(tr '\0' '\n' < "/proc/$browser/environ" | grep -c '^DISPLAY=' || true)"
fi
# Hard rule 8: seccomp filter mode 2 in every renderer, and a namespace sandbox. A renderer in
# its own user namespace used the unprivileged namespace sandbox; one in the browser's user
# namespace but its own PID namespace used the setuid helper.
sandboxed=0
for pid in "${renderers[@]}"; do
  seccomp=$(awk '/^Seccomp:/ {print $2}' "/proc/$pid/status")
  kind=none
  if [ -n "$browser" ]; then
    if [ "$(readlink "/proc/$pid/ns/user")" != "$(readlink "/proc/$browser/ns/user")" ]; then
      kind=user-namespace
    elif [ "$(readlink "/proc/$pid/ns/pid")" != "$(readlink "/proc/$browser/ns/pid")" ]; then
      kind=setuid-helper
    fi
  fi
  note "renderer_$pid" "seccomp=$seccomp namespace=$kind"
  if [ "$seccomp" = 2 ] && [ "$kind" != none ]; then sandboxed=$((sandboxed + 1)); fi
done
if [ "${#renderers[@]}" -gt 0 ] && [ "$sandboxed" = "${#renderers[@]}" ]; then
  note sandbox on
else
  note sandbox off
fi

# A close from the compositor is a close request: without kiosk lock the app saves and quits.
close_window
for _ in $(seq 1 200); do
  kill -0 "$app_pid" 2> /dev/null || break
  sleep 0.1
done
if kill -0 "$app_pid" 2> /dev/null; then
  note closed_by_compositor no
  kill "$app_pid" 2> /dev/null || true
else
  status=0
  wait "$app_pid" || status=$?
  note closed_by_compositor yes
  note app_exit_status "$status"
fi
pgrep -x Xwayland > /dev/null && note xwayland_running yes || note xwayland_running no

kill "$compositor_pid" 2> /dev/null || true
wait "$compositor_pid" 2> /dev/null || true
