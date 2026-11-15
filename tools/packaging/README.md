# Packaging tools

Scripts that check the installers `npm run dist` builds, and the two release steps CI runs. The container scripts need podman and run on a Linux machine with no display.

| Tool                     | What it does                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkLinuxPackages.ts`  | Opens each Linux build in `release/` and checks the desktop entry, icons, license, third-party notices, package metadata, install script, and the mode of the sandbox helper. Needs `bsdtar`, and `rpm` for the `.rpm`. CI runs it. |
| `check-linux.sh`         | Installs each build on a fresh Arch, Debian, Ubuntu, or Fedora container, reinstalls it, starts it under headless sway, and removes it. Writes `reports/packaging/<check>/`.                                                        |
| `check-aur.sh`           | Fills a copy of the AUR package from the local Arch package's checksum, checks `.SRCINFO` with `makepkg --printsrcinfo`, builds it, runs `namcap`, and gives the result the same install and launch check.                          |
| `e2e-wayland.sh`         | Runs end-to-end specs against the unpackaged build in an Arch container on native Wayland, with no X server. Run `npm run build` first.                                                                                             |
| `smokeLaunch.ts`         | Starts a packaged build with no test hook, waits, and fails when it exits, logs a fatal error, starts no renderer, or runs a renderer outside the sandbox. CI runs it on Linux, macOS, and Windows.                                 |
| `release.ts`             | `tag <tag>` fails unless the tag is `v` and the `package.json` version. `checksums <dir>` writes `SHA256SUMS` for every installer in the folder. The release job runs both.                                                         |
| `aurPackage.ts`          | Sets `pkgver` and the checksum of the AUR package from a release's `SHA256SUMS`. See [packaging/aur/README.md](../../packaging/aur/README.md).                                                                                      |
| `summarizeCheck.ts`      | Judges one container check from its `result.txt` and `session.txt`. `check-linux.sh` and `check-aur.sh` call it.                                                                                                                    |
| `container/run-check.sh` | Runs as root in the container: installs the build the way a person would, checks that every library it links resolves, reinstalls it, and removes it.                                                                               |
| `container/session.sh`   | Runs as an ordinary user: starts sway, launches the app, and records the window's app id and shell, a screenshot, each renderer's sandbox, and whether a close from the compositor ends the app.                                    |

## What a container check proves

Each check in `check-linux.sh` passes only when all of these hold:

- The package installs on a minimal image of its distribution, pulling in its dependencies, and every library the program files link resolves. The AppImage and the tarball carry no dependency list, so their checks first add the libraries a desktop has.
- A reinstall keeps the `wild-kids-computers` command. A reinstall runs the same scripts as an upgrade.
- The window maps as a native Wayland `xdg_shell` window with the app id `wild-kids-computers`. Xwayland is not installed and no X display is set.
- Every renderer runs with a seccomp filter in its own namespace.
- A close from the compositor, the same request Omarchy's Super + W sends, ends the app with exit code 0.
- The app sends no packet. It runs in a network namespace whose only way out is a dummy interface, and `tcpdump` watches every interface, including loopback.
- Removing the package leaves no program files, command, desktop entry, or icon.

## What the checks cannot show

- **Hyprland itself.** Hyprland 0.57 needs a DRM device and a seat, or a parent compositor that shares GPU buffers. In a container without a GPU it stops at "CBackend::create() failed", alone or nested in sway. The checks use sway, a wlroots compositor with a headless backend and a software renderer, which speaks the same `xdg_shell` protocol for windows, fullscreen, and close.
- **A GPU.** sway draws with pixman and Chromium falls back to software. The checks prove the app starts and draws without a GPU, not how it behaves with one.
- **AppArmor.** The containers run on the host's kernel, so Ubuntu's user namespace restriction is not active in them. The Ubuntu checks parse the AppArmor profile the `.deb` installs. CI starts the installed `.deb` on GitHub's Ubuntu 24.04 runner, where the restriction is on.
- **Real hardware and a real Omarchy install.** Scaling, input methods, and sound on a real desktop are not covered.

## End-to-end specs on Wayland

`e2e-wayland.sh` floats the app's window, because the specs size it themselves and a tiled window ignores that. Playwright's Electron launcher adds `--enable-unsafe-swiftshader`, and with it Chromium never maps its window on a Wayland compositor without a GPU, so every click waits forever. The script sets `WKC_TEST_WAYLAND=1`, and `electron/main/testMode.ts` drops that switch in unpackaged test runs only.
