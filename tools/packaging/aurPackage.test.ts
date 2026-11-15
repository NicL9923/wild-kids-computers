import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archPackageName, AUR_DIR, checksumFor, updateAur } from './aurPackage.ts';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

const files = {
  pkgbuild: readFileSync(path.join(AUR_DIR, 'PKGBUILD'), 'utf8'),
  srcinfo: readFileSync(path.join(AUR_DIR, '.SRCINFO'), 'utf8'),
};

/** The depends entries of one top-level package block in electron-builder.yml. */
function builderDepends(target: string): string[] {
  const yaml = readFileSync('electron-builder.yml', 'utf8');
  const block = yaml.split(/\n(?=\S)/).find((section) => section.startsWith(`${target}:`)) ?? '';
  const list = /\n {2}depends:\n((?: {4}- .*\n)+)/.exec(`${block}\n`)?.[1] ?? '';
  return list
    .split('\n')
    .filter(Boolean)
    .map((line) => line.replace(/^ {4}- /, '').replaceAll("'", ''));
}

describe('checksumFor', () => {
  const sums = `${SHA_A}  ${archPackageName('0.2.0')}\n${SHA_B}  wild-kids-computers-0.2.0-linux-amd64.deb\n`;

  it('finds the line for the file', () => {
    expect(checksumFor(sums, archPackageName('0.2.0'))).toBe(SHA_A);
  });

  it('accepts the binary-mode marker sha256sum can write', () => {
    expect(checksumFor(`${SHA_A} *app.deb\n`, 'app.deb')).toBe(SHA_A);
  });

  it.each([
    ['no line for the file', sums, archPackageName('0.3.0'), 'has 0 lines'],
    [
      'two lines for the file',
      `${sums}${SHA_B}  ${archPackageName('0.2.0')}\n`,
      archPackageName('0.2.0'),
      'has 2 lines',
    ],
    ['a digest that is not hex', `xyz  ${archPackageName('0.2.0')}\n`, archPackageName('0.2.0'), 'has 0 lines'],
  ])('fails on %s', (_label, text, file, reason) => {
    expect(() => checksumFor(text, file)).toThrow(reason);
  });
});

describe('updateAur', () => {
  it('sets the version, source, and checksum in both files', () => {
    const updated = updateAur(files, '0.2.0', SHA_A);
    expect(updated.pkgbuild).toMatch(/^pkgver=0\.2\.0$/m);
    expect(updated.pkgbuild).toMatch(new RegExp(`^sha256sums=\\('${SHA_A}'\\)$`, 'm'));
    expect(updated.srcinfo).toContain('\tpkgver = 0.2.0\n');
    expect(updated.srcinfo).toContain(
      `\tsource = ${archPackageName('0.2.0')}::https://github.com/NicL9923/wild-kids-computers/releases/download/v0.2.0/${archPackageName('0.2.0')}\n`,
    );
    expect(updated.srcinfo).toContain(`\tnoextract = ${archPackageName('0.2.0')}\n`);
    expect(updated.srcinfo).toContain(`\tsha256sums = ${SHA_A}\n`);
    expect(updated.srcinfo).not.toContain('0.1.0');
  });

  it.each([
    ['a prerelease version pkgver cannot hold', '0.2.0-rc.1', SHA_A, 'plain x.y.z'],
    ['a digest that is not hex', '0.2.0', 'SKIP', 'Not a SHA-256'],
  ])('rejects %s', (_label, version, sha, reason) => {
    expect(() => updateAur(files, version, sha)).toThrow(reason);
  });

  it('fails when the PKGBUILD has no checksum line to update', () => {
    expect(() =>
      updateAur({ ...files, pkgbuild: files.pkgbuild.replace(/^sha256sums=.*$/m, '') }, '0.2.0', SHA_A),
    ).toThrow('No sha256sums line');
  });
});

describe('the AUR package', () => {
  it('depends on what the release Arch package depends on', () => {
    const pkgbuildDepends = [
      ...(/^depends=\(\n([\s\S]*?)\n\)/m.exec(files.pkgbuild)?.[1] ?? '').matchAll(/'([^']+)'/g),
    ].map((match) => match[1]);
    const pacman = builderDepends('pacman');
    expect(pacman.length).toBeGreaterThan(10);
    expect(pkgbuildDepends).toEqual(pacman);
    expect(files.srcinfo.match(/^\tdepends = .*$/gm)?.map((line) => line.replace('\tdepends = ', ''))).toEqual(pacman);
  });

  it('names the release package the way electron-builder names it', () => {
    const yaml = readFileSync('electron-builder.yml', 'utf8');
    expect(yaml).toContain('artifactName: ${name}-${version}-1-x86_64.pkg.tar.zst');
    expect(archPackageName('0.1.0')).toBe('wild-kids-computers-0.1.0-1-x86_64.pkg.tar.zst');
  });
});
