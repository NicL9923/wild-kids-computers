import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LINUX_SIZES } from '../appIcon.ts';
import { NOTICES_FILE_NAME } from '../notices.ts';
import { APP_ID } from './summarizeCheck.ts';

/**
 * Opens every Linux build in a folder and checks what a person installing it relies on: the
 * desktop entry and its window match, the icons, the license and third-party notices, the package
 * metadata, and the Chromium sandbox helper. Needs bsdtar, which reads pacman, deb, rpm, and tar
 * archives alike.
 *
 *   node tools/packaging/checkLinuxPackages.ts [release]
 */

export type LinuxKind = 'pacman' | 'deb' | 'rpm' | 'tarball' | 'appimage';

export function kindOf(file: string): LinuxKind | null {
  if (file.endsWith('.pkg.tar.zst')) return 'pacman';
  if (file.endsWith('.deb')) return 'deb';
  if (file.endsWith('.rpm')) return 'rpm';
  if (file.endsWith('.tar.gz')) return 'tarball';
  if (file.endsWith('.AppImage')) return 'appimage';
  return null;
}

interface PackageMetadata {
  name: string | undefined;
  version: string | undefined;
  arch: string | undefined;
  license: string | undefined;
  url: string | undefined;
  depends: string[];
}

/** What a reader found inside one build. Paths are relative, with no leading ./ or /. */
export interface PackageView {
  kind: LinuxKind;
  /** File modes by path, as numbers such as 0o755 or 0o4755. Directories are left out. */
  files: ReadonlyMap<string, number>;
  /** Package manager metadata. Null for the tarball and the AppImage, which have none. */
  metadata: PackageMetadata | null;
  desktopEntry: string | null;
  /** The script the package manager runs after installing. */
  installScript: string | null;
}

export interface Expected {
  version: string;
  homepage: string;
}

const PROGRAM_DIR = 'opt/Wild Kids - Computers';
const DESKTOP_FILE = `usr/share/applications/${APP_ID}.desktop`;

/** The key=value pairs of the [Desktop Entry] group. */
export function desktopEntryKeys(text: string): Map<string, string> {
  const keys = new Map<string, string>();
  let inMainGroup = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('[')) inMainGroup = line.trim() === '[Desktop Entry]';
    else if (inMainGroup && line.includes('=')) {
      const at = line.indexOf('=');
      keys.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
  }
  return keys;
}

function desktopProblems(text: string | null, where: string): string[] {
  if (text === null) return [`no desktop entry at ${where}`];
  const keys = desktopEntryKeys(text);
  const problems: string[] = [];
  const want = (key: string, value: string) => {
    if (keys.get(key) !== value)
      problems.push(`desktop entry ${key} is ${keys.get(key) ?? 'missing'}, expected ${value}`);
  };
  want('Type', 'Application');
  want('Name', 'Wild Kids - Computers');
  want('Icon', APP_ID);
  // The window's Wayland app id and X11 class, so the launcher and the dock match the window.
  want('StartupWMClass', APP_ID);
  want('Terminal', 'false');
  if ((keys.get('Comment') ?? '') === '') problems.push('desktop entry has no Comment');
  const categories = (keys.get('Categories') ?? '').split(';');
  for (const category of ['Education', 'KidsGame']) {
    if (!categories.includes(category)) problems.push(`desktop entry Categories has no ${category}`);
  }
  const exec = keys.get('Exec') ?? '';
  if (exec === '') problems.push('desktop entry has no Exec');
  if (/--no-sandbox|--disable-seccomp-filter-sandbox/.test(exec))
    problems.push(`desktop entry Exec turns the sandbox off: ${exec}`);
  return problems;
}

function metadataProblems(view: PackageView, expected: Expected): string[] {
  const meta = view.metadata;
  if (meta === null) return ['the package has no metadata'];
  const problems: string[] = [];
  if (meta.name !== APP_ID) problems.push(`package name is ${meta.name ?? 'missing'}, expected ${APP_ID}`);
  // pacman appends the release number: 0.1.0-1.
  const version = view.kind === 'pacman' ? meta.version?.replace(/-\d+$/, '') : meta.version;
  if (version !== expected.version)
    problems.push(`package version is ${meta.version ?? 'missing'}, expected ${expected.version}`);
  const arch = view.kind === 'deb' ? 'amd64' : 'x86_64';
  if (meta.arch !== arch) problems.push(`package architecture is ${meta.arch ?? 'missing'}, expected ${arch}`);
  if (view.kind !== 'deb' && meta.license !== 'MIT')
    problems.push(`package license is ${meta.license ?? 'missing'}, expected MIT`);
  if (meta.url !== expected.homepage)
    problems.push(`package homepage is ${meta.url ?? 'missing'}, expected ${expected.homepage}`);
  if (!meta.depends.some((dependency) => /gtk-?3/i.test(dependency))) {
    problems.push(`package dependencies do not name GTK 3: ${meta.depends.join(', ') || 'none'}`);
  }
  return problems;
}

/** Every reason this build is not fit to ship, empty when it is. */
export function packageProblems(view: PackageView, expected: Expected): string[] {
  const problems: string[] = [];
  const programDir =
    view.kind === 'tarball' ? (topDirectory(view.files) ?? '') : view.kind === 'appimage' ? '' : PROGRAM_DIR;
  const inProgram = (name: string) => (programDir === '' ? name : `${programDir}/${name}`);
  const requireFile = (file: string, what: string) => {
    if (!view.files.has(file)) problems.push(`${what} is missing: ${file}`);
  };

  const executable = view.files.get(inProgram(APP_ID));
  if (executable === undefined) problems.push(`the program is missing: ${inProgram(APP_ID)}`);
  else if ((executable & 0o111) === 0) problems.push(`the program is not executable: mode ${executable.toString(8)}`);
  requireFile(inProgram('resources/app.asar'), 'the app archive');
  requireFile(inProgram(`resources/${NOTICES_FILE_NAME}`), 'the third-party notices');
  requireFile(inProgram('resources/icon.png'), 'the window icon');
  requireFile(inProgram('LICENSE.electron.txt'), "Electron's license");
  requireFile(inProgram('LICENSES.chromium.html'), "Chromium's licenses");

  // The sandbox helper ships 0755. A package's install script makes it setuid root only on a
  // system without unprivileged user namespaces, where Chromium needs it.
  const helper = view.files.get(inProgram('chrome-sandbox'));
  if (helper === undefined) problems.push('the sandbox helper chrome-sandbox is missing');
  else if (view.kind !== 'appimage' && helper !== 0o755) {
    problems.push(`chrome-sandbox has mode ${helper.toString(8)} in the archive, expected 755`);
  }

  if (view.kind === 'pacman' || view.kind === 'deb' || view.kind === 'rpm') {
    problems.push(...desktopProblems(view.desktopEntry, DESKTOP_FILE));
    for (const size of LINUX_SIZES)
      requireFile(`usr/share/icons/hicolor/${size}x${size}/apps/${APP_ID}.png`, 'an icon');
    requireFile(
      view.kind === 'deb' ? `usr/share/doc/${APP_ID}/copyright` : `usr/share/licenses/${APP_ID}/LICENSE`,
      'the license',
    );
    problems.push(...metadataProblems(view, expected));
    const script = view.installScript ?? '';
    if (!script.includes(`chmod 4755 '/${PROGRAM_DIR}/chrome-sandbox'`)) {
      problems.push('the install script does not make chrome-sandbox setuid where user namespaces are off');
    }
    if (!script.includes('/usr/bin/wild-kids-computers')) problems.push('the install script does not add the command');
  }
  if (view.kind === 'appimage') {
    problems.push(...desktopProblems(view.desktopEntry, `${APP_ID}.desktop`));
    requireFile('.DirIcon', 'the AppImage icon');
    requireFile('AppRun', 'the AppImage launcher');
  }
  return problems;
}

function topDirectory(files: ReadonlyMap<string, number>): string | null {
  const first = files.keys().next();
  return first.done === true ? null : (first.value.split('/')[0] ?? null);
}

/** Parses `bsdtar -tv` lines into file modes. Directories and links are left out. */
export function parseTarListing(listing: string): Map<string, number> {
  const files = new Map<string, number>();
  const line = /^([-dlbcps])([rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+\d+\s+\w{3}\s+\d+\s+(?:\d{4}|\d{1,2}:\d{2})\s+(.+)$/;
  for (const raw of listing.split('\n')) {
    const match = line.exec(raw);
    if (match === null || match[1] !== '-') continue;
    const name = (match[3] ?? '').replace(/^\.?\//, '');
    files.set(name, permissionBits(match[2] ?? ''));
  }
  return files;
}

/** rwsr-xr-x to 0o4755. */
export function permissionBits(text: string): number {
  if (!/^[rwxsStT-]{9}$/.test(text)) throw new Error(`Not a permission string: ${text}`);
  let mode = 0;
  for (let i = 0; i < 9; i++) {
    const char = text[i] ?? '-';
    const bit = 1 << (8 - i);
    if (char !== '-' && char !== 'S' && char !== 'T') mode |= bit;
  }
  if (/[sS]/.test(text[2] ?? '')) mode |= 0o4000;
  if (/[sS]/.test(text[5] ?? '')) mode |= 0o2000;
  if (/[tT]/.test(text[8] ?? '')) mode |= 0o1000;
  return mode;
}

/** Fields of a pacman .PKGINFO, a Debian control file, or rpm's query output. */
export function parseFields(text: string, separator: ' = ' | ': '): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  for (const line of text.split('\n')) {
    const at = line.indexOf(separator);
    if (at <= 0 || line.startsWith(' ') || line.startsWith('#')) continue;
    const key = line.slice(0, at);
    fields.set(key, [...(fields.get(key) ?? []), line.slice(at + separator.length)]);
  }
  return fields;
}

function bsdtar(args: string[]): string {
  return execFileSync('bsdtar', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readArchive(file: string, kind: LinuxKind): PackageView {
  if (kind === 'deb') {
    const work = mkdtempSync(path.join(os.tmpdir(), 'wkc-deb-'));
    try {
      execFileSync('bsdtar', ['-xf', file, '-C', work]);
      const member = (prefix: string) => {
        const name = readdirSync(work).find((entry) => entry.startsWith(prefix));
        if (name === undefined) throw new Error(`${file} has no ${prefix}*`);
        return path.join(work, name);
      };
      const data = member('data.tar');
      const control = member('control.tar');
      const fields = parseFields(bsdtar(['-xOf', control, './control']), ': ');
      const one = (key: string) => fields.get(key)?.[0];
      return {
        kind,
        files: parseTarListing(bsdtar(['-tvf', data])),
        metadata: {
          name: one('Package'),
          version: one('Version'),
          arch: one('Architecture'),
          license: undefined,
          url: one('Homepage'),
          depends: (one('Depends') ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        },
        desktopEntry: bsdtar(['-xOf', data, `./${DESKTOP_FILE}`]) || null,
        installScript: bsdtar(['-xOf', control, './postinst']) || null,
      };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  const files = parseTarListing(bsdtar(['-tvf', file]));
  if (kind === 'tarball') return { kind, files, metadata: null, desktopEntry: null, installScript: null };
  const desktopEntry = bsdtar(['-xOf', file, kind === 'rpm' ? `./${DESKTOP_FILE}` : DESKTOP_FILE]) || null;
  if (kind === 'pacman') {
    const info = parseFields(bsdtar(['-xOf', file, '.PKGINFO']), ' = ');
    const one = (key: string) => info.get(key)?.[0];
    return {
      kind,
      files,
      metadata: {
        name: one('pkgname'),
        version: one('pkgver'),
        arch: one('arch'),
        license: one('license'),
        url: one('url'),
        depends: info.get('depend') ?? [],
      },
      desktopEntry,
      installScript: bsdtar(['-xOf', file, '.INSTALL']) || null,
    };
  }
  // rpm: bsdtar reads the payload, and rpm itself reads the header.
  const query = (format: string) => execFileSync('rpm', ['-qp', '--qf', format, file], { encoding: 'utf8' });
  return {
    kind,
    files,
    metadata: {
      name: query('%{NAME}'),
      version: query('%{VERSION}'),
      arch: query('%{ARCH}'),
      license: query('%{LICENSE}'),
      url: query('%{URL}'),
      depends: execFileSync('rpm', ['-qp', '--requires', file], { encoding: 'utf8' }).split('\n').filter(Boolean),
    },
    desktopEntry,
    installScript: execFileSync('rpm', ['-qp', '--scripts', file], { encoding: 'utf8' }),
  };
}

/** The AppImage extracts itself; no FUSE is needed for that. */
function readAppImage(file: string): PackageView {
  const work = mkdtempSync(path.join(os.tmpdir(), 'wkc-appimage-'));
  try {
    execFileSync(path.resolve(file), ['--appimage-extract'], { cwd: work, stdio: 'ignore' });
    const root = path.join(work, 'squashfs-root');
    const files = new Map<string, number>();
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      const full = path.join(entry.parentPath, entry.name);
      const stat = lstatSync(full);
      // .DirIcon is a link to the icon, so links count as present files here.
      if (stat.isFile() || stat.isSymbolicLink()) files.set(path.relative(root, full), stat.mode & 0o7777);
    }
    let desktopEntry: string | null = null;
    try {
      desktopEntry = readFileSync(path.join(root, `${APP_ID}.desktop`), 'utf8');
    } catch {
      desktopEntry = null;
    }
    return { kind: 'appimage', files, metadata: null, desktopEntry, installScript: null };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const dir = process.argv[2] ?? 'release';
  const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
  const field = (key: string) => String(typeof pkg === 'object' && pkg !== null ? Reflect.get(pkg, key) : undefined);
  const expected = { version: field('version'), homepage: field('homepage') };
  const builds = readdirSync(dir)
    .map((name) => ({ name, kind: kindOf(name) }))
    .filter((build): build is { name: string; kind: LinuxKind } => build.kind !== null);
  const missing = (['pacman', 'deb', 'rpm', 'tarball', 'appimage'] as const).filter(
    (kind) => !builds.some((build) => build.kind === kind),
  );
  let failed = missing.length > 0;
  if (failed) console.error(`check:linux-packages: no ${missing.join(', ')} build in ${dir}`);
  for (const build of builds) {
    const file = path.join(dir, build.name);
    const view = build.kind === 'appimage' ? readAppImage(file) : readArchive(file, build.kind);
    const problems = packageProblems(view, expected);
    if (problems.length === 0) {
      console.log(`ok ${build.name}`);
      continue;
    }
    failed = true;
    console.error(`FAIL ${build.name}`);
    for (const problem of problems) console.error(`  ${problem}`);
  }
  process.exit(failed ? 1 : 0);
}
