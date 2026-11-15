import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Points the AUR package at a release: sets pkgver and the Arch package's checksum in the
 * PKGBUILD and .SRCINFO from the release's SHA256SUMS.
 *
 *   node tools/packaging/aurPackage.ts <SHA256SUMS> [folder]
 *
 * The folder defaults to packaging/aur/wild-kids-computers-bin; check-aur.sh points a copy at
 * a local build.
 * The version comes from package.json. Publishing to the AUR is a person's step; see
 * packaging/aur/README.md.
 */

export const AUR_DIR = 'packaging/aur/wild-kids-computers-bin';

/** The release's Arch package name, as electron-builder.yml's pacman artifactName writes it. */
export function archPackageName(version: string): string {
  return `wild-kids-computers-${version}-1-x86_64.pkg.tar.zst`;
}

/** The digest of one file in a SHA256SUMS text. */
export function checksumFor(sums: string, file: string): string {
  const matches = sums
    .split('\n')
    .map((line) => /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim()))
    .filter((match) => match !== null && match[2] === file);
  if (matches.length !== 1) throw new Error(`SHA256SUMS has ${matches.length} lines for ${file}, expected 1`);
  return matches[0]?.[1] ?? '';
}

function replaceLine(text: string, pattern: RegExp, line: string, what: string): string {
  if (!pattern.test(text)) throw new Error(`No ${what} line to update`);
  return text.replace(pattern, line);
}

/** The PKGBUILD and .SRCINFO for this version and checksum. */
export function updateAur(
  files: { pkgbuild: string; srcinfo: string },
  version: string,
  sha256: string,
): { pkgbuild: string; srcinfo: string } {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`The AUR version must be plain x.y.z, got "${version}". pkgver cannot hold a hyphen.`);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Not a SHA-256 hex digest');
  const pkgbuild = replaceLine(
    replaceLine(files.pkgbuild, /^pkgver=.*$/m, `pkgver=${version}`, 'pkgver'),
    /^sha256sums=\(.*\)$/m,
    `sha256sums=('${sha256}')`,
    'sha256sums',
  );
  const file = archPackageName(version);
  let srcinfo = replaceLine(files.srcinfo, /^\tpkgver = .*$/m, `\tpkgver = ${version}`, '.SRCINFO pkgver');
  srcinfo = replaceLine(srcinfo, /^\tnoextract = .*$/m, `\tnoextract = ${file}`, '.SRCINFO noextract');
  srcinfo = replaceLine(
    srcinfo,
    /^\tsource = .*$/m,
    `\tsource = ${file}::https://github.com/NicL9923/wild-kids-computers/releases/download/v${version}/${file}`,
    '.SRCINFO source',
  );
  srcinfo = replaceLine(srcinfo, /^\tsha256sums = .*$/m, `\tsha256sums = ${sha256}`, '.SRCINFO sha256sums');
  return { pkgbuild, srcinfo };
}

if (import.meta.main) {
  const [sumsFile, folder = AUR_DIR] = process.argv.slice(2);
  if (sumsFile === undefined) {
    console.error('Usage: node tools/packaging/aurPackage.ts <SHA256SUMS> [folder]');
    process.exit(2);
  }
  const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
  const version = String(typeof pkg === 'object' && pkg !== null ? Reflect.get(pkg, 'version') : undefined);
  const sha256 = checksumFor(readFileSync(sumsFile, 'utf8'), archPackageName(version));
  const pkgbuildPath = path.join(folder, 'PKGBUILD');
  const srcinfoPath = path.join(folder, '.SRCINFO');
  const updated = updateAur(
    { pkgbuild: readFileSync(pkgbuildPath, 'utf8'), srcinfo: readFileSync(srcinfoPath, 'utf8') },
    version,
    sha256,
  );
  writeFileSync(pkgbuildPath, updated.pkgbuild);
  writeFileSync(srcinfoPath, updated.srcinfo);
  console.log(`Pointed the AUR package at ${version} with checksum ${sha256}.`);
}
