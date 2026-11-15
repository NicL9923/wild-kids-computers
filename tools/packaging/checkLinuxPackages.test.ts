import { describe, expect, it } from 'vitest';
import { LINUX_SIZES } from '../appIcon.ts';
import {
  desktopEntryKeys,
  kindOf,
  packageProblems,
  parseFields,
  parseTarListing,
  permissionBits,
  type LinuxKind,
  type PackageView,
} from './checkLinuxPackages.ts';

const EXPECTED = { version: '0.1.0', homepage: 'https://github.com/NicL9923/wild-kids-computers' };
const PROGRAM = 'opt/Wild Kids - Computers';

const DESKTOP = `[Desktop Entry]
Name=Wild Kids - Computers
Exec="/opt/Wild Kids - Computers/wild-kids-computers" %U
Terminal=false
Type=Application
Icon=wild-kids-computers
StartupWMClass=wild-kids-computers
Comment=A free, offline desktop app
Categories=Education;Game;KidsGame;
`;

const INSTALL_SCRIPT = `ln -sf '/opt/Wild Kids - Computers/wild-kids-computers' '/usr/bin/wild-kids-computers'
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/Wild Kids - Computers/chrome-sandbox' || true
fi`;

function programFiles(dir: string): [string, number][] {
  const at = (name: string) => (dir === '' ? name : `${dir}/${name}`);
  return [
    [at('wild-kids-computers'), 0o755],
    [at('chrome-sandbox'), 0o755],
    [at('resources/app.asar'), 0o644],
    [at('resources/third-party-notices.txt'), 0o644],
    [at('resources/icon.png'), 0o644],
    [at('LICENSE.electron.txt'), 0o644],
    [at('LICENSES.chromium.html'), 0o644],
  ];
}

/** A build that passes, of the given kind. */
function passing(kind: LinuxKind): PackageView {
  if (kind === 'tarball') {
    return {
      kind,
      files: new Map(programFiles('wild-kids-computers-0.1.0')),
      metadata: null,
      desktopEntry: null,
      installScript: null,
    };
  }
  if (kind === 'appimage') {
    return {
      kind,
      files: new Map([...programFiles(''), ['.DirIcon', 0o777], ['AppRun', 0o755]]),
      metadata: null,
      desktopEntry: DESKTOP.replace(/^Exec=.*$/m, 'Exec=AppRun %U'),
      installScript: null,
    };
  }
  const license =
    kind === 'deb' ? 'usr/share/doc/wild-kids-computers/copyright' : 'usr/share/licenses/wild-kids-computers/LICENSE';
  const icons = LINUX_SIZES.map((size): [string, number] => [
    `usr/share/icons/hicolor/${size}x${size}/apps/wild-kids-computers.png`,
    0o644,
  ]);
  return {
    kind,
    files: new Map([
      ...programFiles(PROGRAM),
      ...icons,
      [license, 0o644],
      ['usr/share/applications/wild-kids-computers.desktop', 0o644],
    ]),
    metadata: {
      name: 'wild-kids-computers',
      version: kind === 'pacman' ? '0.1.0-1' : '0.1.0',
      arch: kind === 'deb' ? 'amd64' : 'x86_64',
      license: kind === 'deb' ? undefined : 'MIT',
      url: EXPECTED.homepage,
      depends: [kind === 'rpm' ? 'libgtk-3.so.0()(64bit)' : kind === 'deb' ? 'libgtk-3-0' : 'gtk3', 'nss'],
    },
    desktopEntry: DESKTOP,
    installScript: INSTALL_SCRIPT,
  };
}

function without(view: PackageView, file: string): PackageView {
  const files = new Map(view.files);
  files.delete(file);
  return { ...view, files };
}

describe('kindOf', () => {
  it.each([
    ['a.pkg.tar.zst', 'pacman'],
    ['a.deb', 'deb'],
    ['a.rpm', 'rpm'],
    ['a.tar.gz', 'tarball'],
    ['a.AppImage', 'appimage'],
    ['a.dmg', null],
    ['a.deb.blockmap', null],
  ])('reads %s as %s', (file, kind) => {
    expect(kindOf(file)).toBe(kind);
  });
});

describe('packageProblems', () => {
  it.each<LinuxKind>(['pacman', 'deb', 'rpm', 'tarball', 'appimage'])('passes a complete %s build', (kind) => {
    expect(packageProblems(passing(kind), EXPECTED)).toEqual([]);
  });

  const pacman = passing('pacman');
  const meta = pacman.metadata ?? {
    name: undefined,
    version: undefined,
    arch: undefined,
    license: undefined,
    url: undefined,
    depends: [],
  };
  it.each<[string, PackageView, string]>([
    ['the program is missing', without(pacman, `${PROGRAM}/wild-kids-computers`), 'the program is missing'],
    [
      'the program is not executable',
      { ...pacman, files: new Map([...pacman.files, [`${PROGRAM}/wild-kids-computers`, 0o644]]) },
      'not executable',
    ],
    [
      'the notices are missing',
      without(pacman, `${PROGRAM}/resources/third-party-notices.txt`),
      'third-party notices is missing',
    ],
    ['the window icon is missing', without(pacman, `${PROGRAM}/resources/icon.png`), 'window icon is missing'],
    [
      "Chromium's licenses are missing",
      without(pacman, `${PROGRAM}/LICENSES.chromium.html`),
      "Chromium's licenses is missing",
    ],
    ['the sandbox helper is missing', without(pacman, `${PROGRAM}/chrome-sandbox`), 'chrome-sandbox is missing'],
    [
      'the sandbox helper ships setuid',
      { ...pacman, files: new Map([...pacman.files, [`${PROGRAM}/chrome-sandbox`, 0o4755]]) },
      'mode 4755 in the archive',
    ],
    ['the desktop entry is missing', { ...pacman, desktopEntry: null }, 'no desktop entry'],
    [
      'the window class does not match',
      {
        ...pacman,
        desktopEntry: DESKTOP.replace('StartupWMClass=wild-kids-computers', 'StartupWMClass=Wild Kids - Computers'),
      },
      'StartupWMClass is Wild Kids - Computers',
    ],
    [
      'the icon name is wrong',
      { ...pacman, desktopEntry: DESKTOP.replace('Icon=wild-kids-computers', 'Icon=electron') },
      'Icon is electron',
    ],
    ['Education is not a category', { ...pacman, desktopEntry: DESKTOP.replace('Education;', '') }, 'no Education'],
    ['the comment is empty', { ...pacman, desktopEntry: DESKTOP.replace(/^Comment=.*$/m, 'Comment=') }, 'no Comment'],
    [
      'Exec turns the sandbox off',
      { ...pacman, desktopEntry: DESKTOP.replace(' %U', ' --no-sandbox %U') },
      'turns the sandbox off',
    ],
    [
      'a hicolor icon size is missing',
      without(pacman, 'usr/share/icons/hicolor/16x16/apps/wild-kids-computers.png'),
      'an icon is missing',
    ],
    [
      'the license is missing',
      without(pacman, 'usr/share/licenses/wild-kids-computers/LICENSE'),
      'the license is missing',
    ],
    ['the package has no metadata', { ...pacman, metadata: null }, 'no metadata'],
    [
      'the package has another name',
      { ...pacman, metadata: { ...meta, name: 'wild-kids' } },
      'package name is wild-kids',
    ],
    ['the version is stale', { ...pacman, metadata: { ...meta, version: '0.0.9-1' } }, 'package version is 0.0.9-1'],
    ['the architecture is wrong', { ...pacman, metadata: { ...meta, arch: 'amd64' } }, 'architecture is amd64'],
    ['the license field is wrong', { ...pacman, metadata: { ...meta, license: 'GPL' } }, 'license is GPL'],
    ['the homepage is wrong', { ...pacman, metadata: { ...meta, url: undefined } }, 'homepage is missing'],
    [
      'the dependencies leave out GTK',
      { ...pacman, metadata: { ...meta, depends: ['nss'] } },
      'do not name GTK 3: nss',
    ],
    [
      'the install script has no setuid fallback',
      { ...pacman, installScript: 'ln -sf x /usr/bin/wild-kids-computers' },
      'does not make chrome-sandbox setuid',
    ],
    [
      'the install script adds no command',
      { ...pacman, installScript: INSTALL_SCRIPT.split('\n').slice(1).join('\n') },
      'does not add the command',
    ],
  ])('fails a pacman build when %s', (_label, view, reason) => {
    expect(packageProblems(view, EXPECTED)).toContainEqual(expect.stringContaining(reason));
  });

  it('expects the Debian copyright file and amd64 for a deb', () => {
    const deb = passing('deb');
    expect(packageProblems(without(deb, 'usr/share/doc/wild-kids-computers/copyright'), EXPECTED)).toContainEqual(
      expect.stringContaining('the license is missing'),
    );
    expect(
      packageProblems({ ...deb, metadata: deb.metadata && { ...deb.metadata, arch: 'x86_64' } }, EXPECTED),
    ).toContainEqual(expect.stringContaining('expected amd64'));
  });

  it('fails an AppImage without its launcher or with a sandbox-off Exec line', () => {
    const appimage = passing('appimage');
    expect(packageProblems(without(appimage, 'AppRun'), EXPECTED)).toContainEqual(
      expect.stringContaining('launcher is missing'),
    );
    expect(
      packageProblems(
        { ...appimage, desktopEntry: DESKTOP.replace(/^Exec=.*$/m, 'Exec=AppRun --no-sandbox %U') },
        EXPECTED,
      ),
    ).toContainEqual(expect.stringContaining('turns the sandbox off'));
  });

  it('finds a tarball program under its top folder', () => {
    const tarball = passing('tarball');
    expect(packageProblems(without(tarball, 'wild-kids-computers-0.1.0/resources/app.asar'), EXPECTED)).toContainEqual(
      expect.stringContaining('app archive is missing'),
    );
  });
});

describe('parseTarListing', () => {
  it('reads modes and names with spaces, and leaves out folders and links', () => {
    const listing = [
      'drwxr-xr-x  0 0      0           0 Nov 14 18:22 opt/Wild Kids - Computers/',
      '-rwsr-xr-x  0 0      0       15216 Nov 14 18:22 opt/Wild Kids - Computers/chrome-sandbox',
      '-rw-r--r--  1 root   root     1096 Nov 13  2025 ./opt/Wild Kids - Computers/LICENSE.electron.txt',
      'lrwxrwxrwx  0 0      0           0 Nov 14 18:22 .DirIcon -> icon.png',
    ].join('\n');
    expect([...parseTarListing(listing)]).toEqual([
      ['opt/Wild Kids - Computers/chrome-sandbox', 0o4755],
      ['opt/Wild Kids - Computers/LICENSE.electron.txt', 0o644],
    ]);
  });
});

describe('permissionBits', () => {
  it.each([
    ['rwxr-xr-x', 0o755],
    ['rwsr-xr-x', 0o4755],
    ['rwSr--r--', 0o4644],
    ['rwxrwsrwt', 0o3777],
  ])('reads %s', (text, mode) => {
    expect(permissionBits(text)).toBe(mode);
  });

  it('rejects text that is not a permission string', () => {
    expect(() => permissionBits('rwxr-x')).toThrow('Not a permission string');
  });
});

describe('parseFields', () => {
  it('collects repeated keys and skips comments and continuation lines', () => {
    const fields = parseFields('# generated\npkgname = app\ndepend = a\ndepend = b\n second line\n', ' = ');
    expect(fields.get('pkgname')).toEqual(['app']);
    expect(fields.get('depend')).toEqual(['a', 'b']);
  });
});

describe('desktopEntryKeys', () => {
  it('reads only the main group, so an action cannot override Exec', () => {
    const keys = desktopEntryKeys(`${DESKTOP}\n[Desktop Action Safe]\nExec=app --no-sandbox\n`);
    expect(keys.get('Exec')).toBe('"/opt/Wild Kids - Computers/wild-kids-computers" %U');
  });
});
