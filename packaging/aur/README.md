# AUR package

`wild-kids-computers-bin` repackages the Arch package from a GitHub release. It is not published yet. Publishing takes an AUR account, so a person does it.

## Publish a release to the AUR

1. Wait until the GitHub release is published, then download its `SHA256SUMS`.
2. From the repository root, run `node tools/packaging/aurPackage.ts path/to/SHA256SUMS`. It sets `pkgver` and the checksum in `PKGBUILD` and `.SRCINFO`. The checksum of zeros in the repository fails on purpose until this runs.
3. Set the `# Maintainer:` line in `PKGBUILD` to your name and address.
4. On an Arch system, in `packaging/aur/wild-kids-computers-bin/`, run `makepkg --printsrcinfo > .SRCINFO` to confirm it matches, then `makepkg -si` to build and install it once.
5. The first time, clone `ssh://aur@aur.archlinux.org/wild-kids-computers-bin.git`. Copy in `PKGBUILD`, `.SRCINFO`, and `wild-kids-computers-bin.install`, commit, and push.

A `pkgrel` bump without a new version is for a change to the PKGBUILD alone.

## Checked before a release

`tools/packaging/check-aur.sh` fills a copy from the local Arch package, checks `.SRCINFO` with `makepkg --printsrcinfo`, builds it, runs `namcap`, and installs and launches the result. `namcap` reports three things that stay:

- ELF files under `/opt`. The release package keeps the program in `/opt/Wild Kids - Computers`, and this package matches it.
- `x86_64` in the source file name. The release's file name names the architecture, and only x86_64 is built.
- `libpulse` may not be needed. The app loads it at run time for sound, which `namcap` cannot see.
