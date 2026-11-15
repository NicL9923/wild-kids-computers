import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The release job's two checks, run from .github/workflows/ci.yml:
 *
 *   node tools/packaging/release.ts tag <tag>          fails unless the tag is v<package.json version>
 *   node tools/packaging/release.ts checksums <dir>    writes <dir>/SHA256SUMS for every installer in it
 *
 * SHA256SUMS uses the format `sha256sum --check` reads: the hex digest, two spaces, the file name.
 */

/** The installer types a release carries. Anything else in the folder is left out of the sums. */
const INSTALLER_SUFFIXES = ['.AppImage', '.pkg.tar.zst', '.deb', '.rpm', '.tar.gz', '.dmg', '.zip', '.exe'];

const CHECKSUMS_FILE = 'SHA256SUMS';

/** Why the tag does not name this version, or null when it does. */
export function tagProblem(tag: string, version: string): string | null {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version))
    return `package.json version "${version}" is not a semantic version`;
  if (!tag.startsWith('v')) return `the tag "${tag}" does not start with v`;
  if (tag !== `v${version}`)
    return `the tag "${tag}" does not match package.json version ${version}; expected v${version}`;
  return null;
}

/** The installers among the file names, sorted, or an error naming what is wrong. */
export function installerNames(names: readonly string[]): string[] {
  const installers = names.filter((name) => INSTALLER_SUFFIXES.some((suffix) => name.endsWith(suffix))).toSorted();
  if (installers.length === 0) throw new Error('No installers to sum');
  for (const name of installers) {
    // sha256sum reads one name a line, and a name with a backslash or newline changes the format.
    if (/[\n\r\\]/.test(name)) throw new Error(`An installer name has a newline or backslash: ${JSON.stringify(name)}`);
  }
  return installers;
}

export function formatChecksums(entries: readonly { name: string; sha256: string }[]): string {
  for (const entry of entries) {
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error(`Not a SHA-256 hex digest for ${entry.name}`);
  }
  return entries.map((entry) => `${entry.sha256}  ${entry.name}\n`).join('');
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    if (chunk instanceof Uint8Array) hash.update(chunk);
  }
  return hash.digest('hex');
}

if (import.meta.main) {
  const [command, argument] = process.argv.slice(2);
  if (command === 'tag' && argument !== undefined) {
    const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
    const version = typeof pkg === 'object' && pkg !== null ? Reflect.get(pkg, 'version') : undefined;
    const problem = tagProblem(argument, String(version));
    if (problem !== null) {
      console.error(`release tag check failed: ${problem}`);
      process.exit(1);
    }
    console.log(`The tag ${argument} matches package.json.`);
  } else if (command === 'checksums' && argument !== undefined) {
    const names = installerNames(readdirSync(argument));
    const entries = [];
    for (const name of names) entries.push({ name, sha256: await sha256File(path.join(argument, name)) });
    writeFileSync(path.join(argument, CHECKSUMS_FILE), formatChecksums(entries));
    console.log(`Wrote ${CHECKSUMS_FILE} for ${names.length} installers.`);
  } else {
    console.error('Usage: node tools/packaging/release.ts tag <tag> | checksums <dir>');
    process.exit(2);
  }
}
