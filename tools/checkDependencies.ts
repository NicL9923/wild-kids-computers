import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Hard rule 1: the app makes no network request. This check fails when package.json or the
 * runtime part of the lockfile names an HTTP client, analytics, crash reporting, or an updater.
 * It also fails when a package that ships with the app has a license outside a permissive
 * allow list, or declares none.
 *
 * What it reads:
 * - Every direct dependency in package.json, dev or not. App code can import a devDependency and
 *   Vite will bundle it, so a direct devDependency counts.
 * - Every lockfile package that is not dev-only. These ship with the app.
 *
 * Dev-only transitive packages are allowed. Build tools download Electron and fonts with HTTP
 * clients at build time, which never reaches the app. knip fails on an import of a package that
 * package.json does not list, so app code cannot reach those packages either.
 */

export type DenyCategory = 'HTTP client' | 'analytics' | 'crash reporting' | 'updater';

/** An exact package name, or a scope ending in a slash that denies every package in it. */
export const DENY_LIST: ReadonlyArray<{ match: string; category: DenyCategory }> = [
  ...[
    'axios',
    'got',
    'node-fetch',
    'cross-fetch',
    'isomorphic-fetch',
    'whatwg-fetch',
    'undici',
    'ky',
    'ofetch',
    'redaxios',
    'wretch',
    'superagent',
    'request',
    'needle',
    'phin',
    'bent',
    'make-fetch-happen',
    'follow-redirects',
    'simple-get',
    'ws',
    'socket.io-client',
    'graphql-request',
    '@apollo/client',
    '@urql/core',
    'urql',
  ].map((match) => ({ match, category: 'HTTP client' as const })),
  ...[
    'posthog-js',
    'posthog-node',
    'mixpanel',
    'mixpanel-browser',
    'amplitude-js',
    '@amplitude/',
    '@segment/',
    'analytics-node',
    'react-ga',
    'react-ga4',
    'universal-analytics',
    '@vercel/analytics',
    '@datadog/',
    'plausible-tracker',
    '@aptabase/',
    'logrocket',
    '@fullstory/',
    '@hotjar/',
    'newrelic',
    '@newrelic/',
    'applicationinsights',
    '@microsoft/applicationinsights-web',
    'electron-google-analytics',
    'insight',
  ].map((match) => ({ match, category: 'analytics' as const })),
  ...[
    '@sentry/',
    'raven',
    'raven-js',
    'bugsnag',
    '@bugsnag/',
    'rollbar',
    '@honeybadger-io/',
    'trackjs',
    '@elastic/apm-rum',
    'elastic-apm-node',
    'airbrake',
    '@airbrake/',
    '@backtrace/',
    'backtrace-node',
    '@appsignal/',
  ].map((match) => ({ match, category: 'crash reporting' as const })),
  ...[
    'electron-updater',
    'update-electron-app',
    'electron-simple-updater',
    'electron-differential-updater',
    '@todesktop/runtime',
  ].map((match) => ({ match, category: 'updater' as const })),
];

export interface Violation {
  name: string;
  category: DenyCategory;
  where: string;
}

/** Permissive licenses a shipped package may use. The asset licenses are included for font and data packages. */
export const ALLOWED_PACKAGE_LICENSES: ReadonlySet<string> = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'OFL-1.1',
  'Unlicense',
  'Zlib',
]);

export interface LicenseViolation {
  name: string;
  license: string | undefined;
  where: string;
}

/**
 * Whether an SPDX expression is acceptable. `A OR B` needs one allowed side, `A AND B` needs
 * both. A `WITH` exception is judged by its base license. Parentheses are ignored, which is
 * enough for the expressions npm packages use.
 */
export function isAllowedLicense(expression: string | undefined): boolean {
  if (expression === undefined || expression.trim() === '') return false;
  const flat = expression.replaceAll(/[()]/g, ' ').trim();
  return flat
    .split(/\s+OR\s+/)
    .some((alternative) =>
      alternative
        .split(/\s+AND\s+/)
        .every((term) => ALLOWED_PACKAGE_LICENSES.has(term.split(/\s+WITH\s+/)[0]?.trim() ?? '')),
    );
}

export function denyCategoryFor(name: string): DenyCategory | undefined {
  const rule = DENY_LIST.find(({ match }) => (match.endsWith('/') ? name.startsWith(match) : name === match));
  return rule?.category;
}

const dependencyMap = z.record(z.string(), z.string());

const packageJsonSchema = z.object({
  dependencies: dependencyMap.optional(),
  devDependencies: dependencyMap.optional(),
  optionalDependencies: dependencyMap.optional(),
  peerDependencies: dependencyMap.optional(),
});

const lockfileSchema = z.object({
  lockfileVersion: z.number().int().min(2, 'lockfileVersion must be 2 or higher, which npm 7 and later write'),
  packages: z.record(
    z.string(),
    z.object({
      name: z.string().optional(),
      dev: z.boolean().optional(),
      link: z.boolean().optional(),
      license: z.string().optional(),
    }),
  ),
});

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

/** For an npm alias such as `"fetcher": "npm:axios@1.0.0"`, returns the real package name. */
function aliasTarget(spec: string): string | undefined {
  if (!spec.startsWith('npm:')) return undefined;
  const target = spec.slice('npm:'.length);
  const versionAt = target.indexOf('@', 1);
  return versionAt === -1 ? target : target.slice(0, versionAt);
}

/** The package name from a lockfile key such as `node_modules/a/node_modules/@scope/b`. */
function nameFromLockKey(key: string): string | undefined {
  const marker = 'node_modules/';
  const index = key.lastIndexOf(marker);
  return index === -1 ? undefined : key.slice(index + marker.length);
}

export function findDeniedPackages(packageJson: unknown, lockfile: unknown): Violation[] {
  const pkg = packageJsonSchema.parse(packageJson);
  const lock = lockfileSchema.parse(lockfile);
  const violations: Violation[] = [];

  const consider = (name: string | undefined, where: string) => {
    if (name === undefined) return;
    const category = denyCategoryFor(name);
    if (category !== undefined) violations.push({ name, category, where });
  };

  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      consider(name, `package.json ${field}`);
      consider(aliasTarget(spec), `package.json ${field} (alias "${name}")`);
    }
  }

  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || entry.dev === true) continue;
    consider(nameFromLockKey(key), `package-lock.json ${key}`);
    if (entry.name !== undefined && entry.name !== nameFromLockKey(key)) {
      consider(entry.name, `package-lock.json ${key} (alias)`);
    }
  }

  return violations;
}

/** Packages that ship with the app and whose license is missing or not on the allow list. */
export function findDisallowedLicenses(lockfile: unknown): LicenseViolation[] {
  const lock = lockfileSchema.parse(lockfile);
  const violations: LicenseViolation[] = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || entry.dev === true || entry.link === true) continue;
    if (isAllowedLicense(entry.license)) continue;
    violations.push({ name: entry.name ?? nameFromLockKey(key) ?? key, license: entry.license, where: key });
  }
  return violations;
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

if (import.meta.main) {
  const root = process.cwd();
  const lockfile = readJson(path.join(root, 'package-lock.json'));
  const denied = findDeniedPackages(readJson(path.join(root, 'package.json')), lockfile);
  const licenses = findDisallowedLicenses(lockfile);
  if (denied.length > 0) {
    console.error('check:dependencies failed. Hard rule 1 denies these packages:');
    for (const v of denied) console.error(`  ${v.name} (${v.category}) in ${v.where}`);
  }
  if (licenses.length > 0) {
    console.error('check:dependencies failed. These shipped packages have a license outside the allow list:');
    for (const v of licenses) console.error(`  ${v.name} (${v.license ?? 'no license declared'}) at ${v.where}`);
  }
  if (denied.length > 0 || licenses.length > 0) process.exit(1);
  console.log('check:dependencies passed. No denied packages, and every shipped package has an allowed license.');
}
