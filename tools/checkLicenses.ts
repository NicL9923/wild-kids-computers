import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * check:licenses, as docs/architecture.md describes under "Assets and licenses".
 *
 * Every file under assets/ is covered by the LICENSES.json in its nearest directory that has
 * one. An entry names `files` (an exact name or a glob, relative to that directory), with its
 * `source`, `author`, and `license`. The check fails when a file matches no entry, when an
 * entry matches no file, when a license is outside the allowed set, or when a LICENSES.json
 * is malformed.
 */

export const ALLOWED_LICENSES = ['MIT', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0', 'OFL-1.1'] as const;

const MANIFEST = 'LICENSES.json';

const entrySchema = z.object({
  files: z.string().min(1),
  source: z.string().min(1),
  author: z.string().min(1),
  license: z.string().min(1),
});
const manifestSchema = z.array(entrySchema);

/** A glob with *, **, and ? as a regular expression over forward-slash paths. */
export function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const character = glob[i] ?? '';
    if (character === '*' && glob[i + 1] === '*') {
      // "**/" matches any number of directories, including none.
      pattern += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (character === '*') {
      pattern += '[^/]*';
    } else if (character === '?') {
      pattern += '[^/]';
    } else {
      pattern += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** Problems with the asset licenses under root, as sentences. An empty list passes. */
export function findLicenseProblems(root: string): string[] {
  if (!existsSync(root)) return [];
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
  const manifests = files.filter((file) => path.posix.basename(file) === MANIFEST);
  const problems: string[] = [];
  const entriesByDir = new Map<string, { entry: z.infer<typeof entrySchema>; matcher: RegExp; used: boolean }[]>();

  for (const manifest of manifests) {
    const dir = path.posix.dirname(manifest);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path.join(root, manifest), 'utf8'));
    } catch {
      problems.push(`assets/${manifest} is not valid JSON.`);
      continue;
    }
    const result = manifestSchema.safeParse(parsed);
    if (!result.success) {
      problems.push(
        `assets/${manifest} must be a list of entries with files, source, author, and license: ${result.error.issues[0]?.message ?? ''}`,
      );
      continue;
    }
    const entries = result.data.map((entry) => {
      if (!(ALLOWED_LICENSES as readonly string[]).includes(entry.license)) {
        problems.push(
          `assets/${manifest} lists "${entry.files}" under ${entry.license}, which is not an allowed license.`,
        );
      }
      return { entry, matcher: globToRegExp(entry.files), used: false };
    });
    entriesByDir.set(dir, entries);
  }

  for (const file of files) {
    if (path.posix.basename(file) === MANIFEST) continue;
    let dir = path.posix.dirname(file);
    let entries = entriesByDir.get(dir);
    while (entries === undefined && dir !== '.') {
      dir = path.posix.dirname(dir);
      entries = entriesByDir.get(dir);
    }
    const relative = dir === '.' ? file : file.slice(dir.length + 1);
    const match = entries?.find((candidate) => candidate.matcher.test(relative));
    if (match === undefined) {
      problems.push(`assets/${file} has no license entry.`);
    } else {
      match.used = true;
    }
  }

  for (const [dir, entries] of entriesByDir) {
    for (const { entry, used } of entries) {
      if (!used)
        problems.push(
          `assets/${dir === '.' ? '' : `${dir}/`}${MANIFEST} lists "${entry.files}", which matches no file.`,
        );
    }
  }
  return problems;
}

if (import.meta.main) {
  const problems = findLicenseProblems(path.join(process.cwd(), 'assets'));
  if (problems.length > 0) {
    console.error('check:licenses failed.');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log('check:licenses passed.');
}
