import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Hard rule 3: every file under assets/ has a license entry. `npm run check:licenses`, which the
 * production build runs first.
 *
 * Each directory that holds files has a LICENSES.json: an array of entries, each naming `files`
 * (an exact name or a glob with `*` and `?` inside that directory), `source`, `author`, and
 * `license`. The check fails when a file matches no entry, an entry matches no file, a license is
 * outside the allowed set, or a manifest is missing or malformed.
 */

export const MANIFEST_NAME = 'LICENSES.json';
export const ALLOWED_LICENSES = ['MIT', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0', 'OFL-1.1'] as const;

const entrySchema = z.strictObject({
  files: z
    .string()
    .min(1)
    .regex(/^[^/\\]+$/, 'names files in this directory only, without a slash'),
  source: z.string().trim().min(1),
  author: z.string().trim().min(1),
  license: z.string(),
});
const manifestSchema = z.array(entrySchema).min(1);

/** One directory as the walk found it: the files in it and the text of its manifest, if any. */
export interface AssetDirectory {
  /** Relative to the repository root, with forward slashes, such as `assets/emoji`. */
  readonly dir: string;
  /** File names directly in this directory, without the manifest. */
  readonly files: readonly string[];
  readonly manifest: string | undefined;
}

export interface LicenseProblem {
  readonly where: string;
  readonly detail: string;
}

/** True when `name` matches `pattern`, where `*` is any run of characters and `?` one character. */
export function matchesPattern(pattern: string, name: string): boolean {
  const source = pattern
    .replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return new RegExp(`^${source}$`, 'u').test(name);
}

export function checkAssetDirectories(directories: readonly AssetDirectory[]): LicenseProblem[] {
  const problems: LicenseProblem[] = [];
  for (const { dir, files, manifest } of directories) {
    const manifestPath = `${dir}/${MANIFEST_NAME}`;
    if (manifest === undefined) {
      if (files.length > 0) problems.push({ where: dir, detail: `has files but no ${MANIFEST_NAME}` });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(manifest);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push({ where: manifestPath, detail: `is not valid JSON: ${reason}` });
      continue;
    }
    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({ where: manifestPath, detail: `${issue.path.join('.') || 'root'}: ${issue.message}` });
      }
      continue;
    }
    for (const [index, entry] of parsed.data.entries()) {
      if (!(ALLOWED_LICENSES as readonly string[]).includes(entry.license)) {
        problems.push({
          where: `${manifestPath} entry ${String(index)}`,
          detail: `license "${entry.license}" is not one of ${ALLOWED_LICENSES.join(', ')}`,
        });
      }
      if (!files.some((file) => matchesPattern(entry.files, file))) {
        problems.push({ where: `${manifestPath} entry ${String(index)}`, detail: `"${entry.files}" matches no file` });
      }
    }
    for (const file of files) {
      if (!parsed.data.some((entry) => matchesPattern(entry.files, file))) {
        problems.push({ where: `${dir}/${file}`, detail: `matches no entry in ${MANIFEST_NAME}` });
      }
    }
  }
  return problems;
}

/** Reads every directory under `root`, including ones that hold only subdirectories. */
export function readAssetDirectories(repoRoot: string, root = 'assets'): AssetDirectory[] {
  const result: AssetDirectory[] = [];
  const visit = (relative: string): void => {
    const absolute = path.join(repoRoot, relative);
    const entries = readdirSync(absolute, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name !== MANIFEST_NAME).map((entry) => entry.name);
    const manifestPath = path.join(absolute, MANIFEST_NAME);
    const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : undefined;
    result.push({ dir: relative.split(path.sep).join('/'), files: files.toSorted(), manifest });
    for (const entry of entries) if (entry.isDirectory()) visit(path.join(relative, entry.name));
  };
  if (existsSync(path.join(repoRoot, root))) visit(root);
  return result;
}

if (import.meta.main) {
  const directories = readAssetDirectories(process.cwd());
  const problems = checkAssetDirectories(directories);
  if (problems.length > 0) {
    console.error('check:licenses failed:');
    for (const problem of problems) console.error(`  ${problem.where}: ${problem.detail}`);
    process.exit(1);
  }
  const fileCount = directories.reduce((sum, directory) => sum + directory.files.length, 0);
  console.log(`check:licenses passed: ${String(fileCount)} asset files, each with a license entry.`);
}
