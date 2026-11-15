# Wild Kids - Computers

A free, offline desktop app where children aged 3 to 12 learn to use a computer by playing and painting. It is a current take on the idea behind GCompris and Tux Paint.

The app has no accounts, ads, purchases, telemetry, or network requests.

## Status

Milestone 1 is complete. Installers for Linux, macOS, and Windows are on the [releases page](https://github.com/NicL9923/wild-kids-computers/releases).

## Install

Download the file for your system from the [releases page](https://github.com/NicL9923/wild-kids-computers/releases). The installers are not signed, so each system warns before it opens the app the first time; the steps below say what you will see. To check a download, put it beside the release's `SHA256SUMS` file and run `sha256sum --check --ignore-missing SHA256SUMS`.

Replace `0.1.0` below with the version you downloaded. The app never needs the internet after it is installed.

### Omarchy and Arch Linux

Install the Arch package:

```sh
sudo pacman -U ./wild-kids-computers-0.1.0-1-x86_64.pkg.tar.zst
```

Open it from the app launcher (Super + Space on Omarchy) as Wild Kids - Computers, or run `wild-kids-computers`. Remove it with `sudo pacman -R wild-kids-computers`.

Once the AUR package is published, `yay -S wild-kids-computers-bin` or Omarchy's menu, Install > AUR, installs it and keeps it updated with the rest of the system.

On Omarchy the app runs as a native Wayland window, with no setting needed. Super + W asks the app to close, which goes through the parent gate when kiosk lock is on. Kiosk lock makes the window fullscreen, but Hyprland's own shortcuts, such as switching workspaces, still work. No Hyprland window rule is needed. If you want one, the window's class is `wild-kids-computers`.

### Debian and Ubuntu

```sh
sudo apt install ./wild-kids-computers-0.1.0-linux-amd64.deb
```

This works on Debian 12 and 13 and Ubuntu 22.04 and later. On Ubuntu 24.04 and later, the package also installs the AppArmor permission the app's sandbox needs. Remove it with `sudo apt remove wild-kids-computers`.

### Fedora

```sh
sudo dnf install ./wild-kids-computers-0.1.0-linux-x86_64.rpm
```

Use `dnf`. Plain `rpm -i` refuses an unsigned package on current Fedora. Remove it with `sudo dnf remove wild-kids-computers`. The package names libraries rather than Fedora package names, so it may also install on openSUSE with `zypper`, which has not been tested.

### AppImage, for other Linux systems

```sh
chmod +x wild-kids-computers-0.1.0-linux-x86_64.AppImage
./wild-kids-computers-0.1.0-linux-x86_64.AppImage
```

It needs FUSE 3 (`fusermount3`, from the `fuse3` package), which most desktops already have. Without FUSE, add `--appimage-extract-and-run`. Remove it by deleting the file.

Do not use the AppImage on Ubuntu 24.04 or later. Ubuntu blocks the sandbox the app needs for an AppImage, and the app will not run without its sandbox: it shows a message and quits. Use the `.deb` instead.

### Tarball

```sh
tar -xzf wild-kids-computers-0.1.0-linux-x64.tar.gz
./wild-kids-computers-0.1.0-linux-x64/wild-kids-computers
```

It needs the same libraries as any desktop browser, which a desktop system already has. On Ubuntu 24.04 or later, give the sandbox helper its setuid permission first: `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox` in the extracted folder. Remove it by deleting the folder.

### macOS

The app is for Macs with Apple silicon. Open the `.dmg` and drag Wild Kids - Computers to Applications.

The first time you open it, macOS says it could not verify the app is free of malware. Choose Done. Then open System Settings > Privacy & Security, scroll to Security, choose Open Anyway next to the message about Wild Kids - Computers, and confirm with your password. The button stays there for about an hour after the first try. Remove the app by moving it from Applications to the Trash.

### Windows

Run the `.exe` installer. Windows SmartScreen says "Windows protected your PC". Choose More info, then Run anyway. If Smart App Control is on, Windows blocks unsigned apps with no way past the message, and the app cannot be installed until it is signed. Remove it in Settings > Apps > Installed apps.

### Where the app keeps its data

Removing the app leaves each child's profiles, settings, and pictures. Delete this folder to remove them too:

- Linux: `~/.config/Wild Kids - Computers`
- macOS: `~/Library/Application Support/Wild Kids - Computers`
- Windows: `%APPDATA%\Wild Kids - Computers`

## For grown-ups

### The parent corner and the parent gate

The parent corner holds profiles, sound, text, session length, kiosk lock, and the skills each child has practiced. Open it with the padlock button in the bottom right corner of the meadow. The parent gate asks you to type three numbers that it shows as words, such as "four seven two". You can set a PIN of 4 to 8 digits in the parent corner to use instead. The app stores only a salted hash of the PIN.

### Forgot the parent PIN?

1. Close the app. With kiosk lock on, the close asks for the gate, so close it from the operating system instead: Force Quit on macOS, Task Manager on Windows, or your desktop's system monitor on Linux.
2. Open the app's data folder:
   - Linux: `~/.config/Wild Kids - Computers/data`
   - macOS: `~/Library/Application Support/Wild Kids - Computers/data`
   - Windows: `%APPDATA%\Wild Kids - Computers\data`
3. Delete the file `app.json`. Leave everything else.
4. Start the app. It keeps every profile, setting, and picture. It asks you to check the sound and choose kiosk lock again, and the gate goes back to the three numbers.

`app.json` holds only the PIN hash, kiosk lock, whether setup is done, and the last child who played. The gate's "Forgot the PIN?" link shows the same steps.

## Read more

- [docs/spec.md](docs/spec.md): what the app does and its hard rules
- [docs/architecture.md](docs/architecture.md): how the code is organized
- [docs/adding-an-activity.md](docs/adding-an-activity.md): how to add an activity
- [docs/decisions.md](docs/decisions.md): choices the spec left open, and why
- [docs/research.md](docs/research.md): the evidence behind the design rules
- [AGENTS.md](AGENTS.md): the repository index and every command

## Develop

Use Node 24.22.2. The version is pinned in `.node-version`, and npm refuses to install on any other version.

```sh
npm ci              # install exact dependency versions
node node_modules/electron/install.js   # download the Electron binary once
npm run dev         # Vite and Electron together, with hot reload for the renderer
npm run lint        # Oxlint with type-aware rules
npm run typecheck   # type check every project
npm test            # unit tests with coverage
npm run e2e         # build, then Playwright against Electron
npm run check       # licenses, voice clips, strings, and dependency rules
npm run dist        # unsigned installer for this operating system, written to release/
```

Without a display, run the Electron tests under a virtual screen at least 1920 by 1080: `xvfb-run -a -s "-screen 0 1920x1200x24" npm run e2e`. [AGENTS.md](AGENTS.md) lists every command.

### Linux packages

`npm run dist` on Linux builds the Arch package, the `.deb`, the `.rpm`, the tarball, and the AppImage. It needs `bsdtar` (`libarchive-tools` on Debian and Ubuntu) and `rpmbuild` (`rpm`). Then, with podman:

```sh
node tools/packaging/checkLinuxPackages.ts release   # each package's entry, icons, licenses, metadata
tools/packaging/check-linux.sh                       # install, start, and remove on Arch, Debian, Ubuntu, Fedora
tools/packaging/check-aur.sh                         # build and install the AUR package from the local Arch package
npm run build && tools/packaging/e2e-wayland.sh      # end-to-end specs on native Wayland in Arch
```

The container checks start each build under headless sway with no X server and write screenshots and results to `reports/packaging/`. [tools/packaging/README.md](tools/packaging/README.md) says what each one proves.

## License

MIT. See [LICENSE](LICENSE).
