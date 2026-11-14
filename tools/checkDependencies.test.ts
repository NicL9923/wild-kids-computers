import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { findDeniedPackages, findDisallowedLicenses, isAllowedLicense } from './checkDependencies.ts';

const cleanPackageJson = { dependencies: { react: '19.3.1' }, devDependencies: { vite: '8.3.8' } };

function lockfileWith(packages: Record<string, { name?: string; dev?: boolean; link?: boolean; license?: string }>) {
  return { lockfileVersion: 3, packages: { '': { name: 'wild-kids-computers' }, ...packages } };
}

/** The paths of the fields a ZodError names, so a test asserts which field failed. */
function issuePath(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ZodError) return error.issues.map((issue) => issue.path.join('.'));
    throw error;
  }
  throw new Error('expected a ZodError');
}

const cleanLockfile = lockfileWith({
  'node_modules/react': { license: 'MIT' },
  'node_modules/vite': { dev: true, license: 'MIT' },
});

describe('findDeniedPackages', () => {
  it('passes a clean project', () => {
    expect(findDeniedPackages(cleanPackageJson, cleanLockfile)).toEqual([]);
  });

  it.each([
    ['dependencies', 'axios', 'HTTP client'],
    ['devDependencies', 'posthog-js', 'analytics'],
    ['optionalDependencies', '@sentry/electron', 'crash reporting'],
    ['peerDependencies', 'electron-updater', 'updater'],
  ] as const)('denies a direct %s entry %s as %s', (field, name, category) => {
    const pkg = { ...cleanPackageJson, [field]: { [name]: '1.0.0' } };
    expect(findDeniedPackages(pkg, cleanLockfile)).toEqual([{ name, category, where: `package.json ${field}` }]);
  });

  it('denies a package hidden behind an npm alias', () => {
    const pkg = { dependencies: { fetcher: 'npm:axios@1.7.0' } };
    expect(findDeniedPackages(pkg, cleanLockfile)).toEqual([
      { name: 'axios', category: 'HTTP client', where: 'package.json dependencies (alias "fetcher")' },
    ]);
  });

  it('denies a scoped package behind an npm alias', () => {
    const pkg = { dependencies: { errors: 'npm:@sentry/browser@9.0.0' } };
    expect(findDeniedPackages(pkg, cleanLockfile).map((v) => v.name)).toEqual(['@sentry/browser']);
  });

  it('denies a transitive package that ships with the app', () => {
    const lock = lockfileWith({ 'node_modules/some-lib/node_modules/node-fetch': {} });
    expect(findDeniedPackages(cleanPackageJson, lock)).toEqual([
      {
        name: 'node-fetch',
        category: 'HTTP client',
        where: 'package-lock.json node_modules/some-lib/node_modules/node-fetch',
      },
    ]);
  });

  it('denies a lockfile alias by its real name', () => {
    const lock = lockfileWith({ 'node_modules/innocent': { name: 'got' } });
    expect(findDeniedPackages(cleanPackageJson, lock).map((v) => v.where)).toEqual([
      'package-lock.json node_modules/innocent (alias)',
    ]);
  });

  it('allows a dev-only transitive package, which never ships', () => {
    const lock = lockfileWith({ 'node_modules/got': { dev: true } });
    expect(findDeniedPackages(cleanPackageJson, lock)).toEqual([]);
  });

  it.each(['gotham', 'axios-mock-free-name', '@sentry-internal-lookalike/x', 'react-insight'])(
    'does not deny %s, which only resembles a denied name',
    (name) => {
      expect(findDeniedPackages({ dependencies: { [name]: '1.0.0' } }, cleanLockfile)).toEqual([]);
    },
  );

  describe('rejects malformed input', () => {
    it('a package.json that is not an object', () => {
      expect(issuePath(() => findDeniedPackages(null, cleanLockfile))).toEqual(['']);
    });

    it('a dependency map that is not an object', () => {
      expect(issuePath(() => findDeniedPackages({ dependencies: ['axios'] }, cleanLockfile))).toEqual(['dependencies']);
    });

    it('a lockfile without packages', () => {
      expect(issuePath(() => findDeniedPackages(cleanPackageJson, { lockfileVersion: 3 }))).toEqual(['packages']);
    });

    it('a version 1 lockfile, which has no packages map to read', () => {
      expect(issuePath(() => findDeniedPackages(cleanPackageJson, { lockfileVersion: 1, packages: {} }))).toEqual([
        'lockfileVersion',
      ]);
    });
  });
});

describe('isAllowedLicense', () => {
  it.each([
    ['one license', 'MIT'],
    ['a choice with one allowed side', '(MIT OR GPL-3.0-only)'],
    ['AND of allowed licenses', 'MIT AND ISC'],
    ['a group before OR', '(MIT AND Zlib) OR GPL-2.0'],
    ['an exception on an allowed license', 'Apache-2.0 WITH LLVM-exception'],
    ['nested groups', '((MIT))'],
    ['AND over two choices', '(MIT OR GPL-3.0-only) AND (ISC OR GPL-2.0-only)'],
    ['an allowed choice before a copyleft AND', 'MIT OR (GPL-3.0-only AND ISC)'],
    ['AND binding tighter than OR', 'GPL-3.0-only AND ISC OR MIT'],
  ])('allows %s', (_label, expression) => {
    expect(isAllowedLicense(expression)).toBe(true);
  });

  it.each([
    ['a copyleft license', 'GPL-3.0-only'],
    ['a ShareAlike license', 'CC-BY-SA-4.0'],
    ['a NonCommercial license', 'CC-BY-NC-4.0'],
    ['AND with a copyleft term', 'MIT AND GPL-3.0-only'],
    // Dropping the parentheses turned this into (GPL AND MIT) OR ISC, which passed.
    ['a copyleft term AND a group of choices', 'GPL-3.0-only AND (MIT OR ISC)'],
    ['an exception on a copyleft license', 'GPL-2.0-only WITH Classpath-exception-2.0'],
    ['WITH after a group', '(MIT OR ISC) WITH LLVM-exception'],
    ['WITH and no exception', 'MIT WITH'],
    ['an unclosed group', '(MIT OR ISC'],
    ['a stray closing parenthesis', 'MIT) OR (ISC'],
    ['two licenses with no operator', 'MIT ISC'],
    ['a lowercase operator', 'GPL-3.0-only and MIT'],
    ['a trailing operator', 'MIT AND'],
    ['an empty group', '()'],
    ['a custom license file', 'SEE LICENSE IN LICENSE.txt'],
    ['an empty string', ''],
    ['no license', undefined],
  ])('rejects %s', (_label, expression) => {
    expect(isAllowedLicense(expression)).toBe(false);
  });
});

describe('findDisallowedLicenses', () => {
  it('passes shipped packages with allowed licenses', () => {
    expect(findDisallowedLicenses(cleanLockfile)).toEqual([]);
  });

  it('reports a shipped package with a copyleft license', () => {
    const lock = lockfileWith({ 'node_modules/copyleft': { license: 'AGPL-3.0-only' } });
    expect(findDisallowedLicenses(lock)).toEqual([
      { name: 'copyleft', license: 'AGPL-3.0-only', where: 'node_modules/copyleft' },
    ]);
  });

  it('reports a shipped package that declares no license', () => {
    const lock = lockfileWith({ 'node_modules/mystery': {} });
    expect(findDisallowedLicenses(lock)).toEqual([
      { name: 'mystery', license: undefined, where: 'node_modules/mystery' },
    ]);
  });

  it('ignores dev-only packages and workspace links, which do not ship', () => {
    const lock = lockfileWith({
      'node_modules/build-tool': { dev: true, license: 'GPL-3.0-only' },
      'node_modules/local': { link: true },
    });
    expect(findDisallowedLicenses(lock)).toEqual([]);
  });
});
