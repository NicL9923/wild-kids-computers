import { z } from 'zod';

/**
 * The asset license check from "Assets and licenses" in docs/architecture.md, as pure functions
 * over a file list. tools/checkLicenses.ts reads the disk and calls `checkAssetLicenses`.
 *
 * A LICENSES.json file is a JSON array of entries. Each entry's `files` is an exact path or a
 * glob relative to the folder that holds the LICENSES.json. A file is covered by the nearest
 * LICENSES.json in its own folder or a parent folder below `assets/`.
 */

export const ALLOWED_ASSET_LICENSES = ['MIT', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0', 'OFL-1.1'] as const;

export const MANIFEST_NAME = 'LICENSES.json';

const entrySchema = z
  .object({
    files: z.string().trim().min(1),
    source: z.string().trim().min(1),
    author: z.string().trim().min(1),
    license: z.enum(ALLOWED_ASSET_LICENSES),
  })
  .strict();

const manifestSchema = z.array(entrySchema).min(1);

export type LicenseEntry = z.infer<typeof entrySchema>;

/** The entries of one LICENSES.json, or null when it is not a valid manifest. check:licenses reports why. */
export function parseLicenseManifest(text: string): LicenseEntry[] | null {
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface AssetTree {
  /** Every file under assets/, as a path relative to assets/ with forward slashes. */
  files: readonly string[];
  /** Reads a file under assets/ by the same relative path. */
  read: (relativePath: string) => string;
}

export interface LicenseProblem {
  path: string;
  detail: string;
}

/**
 * Turns a glob into a regular expression. `*` and `?` stay within one folder, `**` crosses
 * folders. Every other character matches itself.
 */
export function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob.charAt(i);
    if (char === '*' && glob.charAt(i + 1) === '*') {
      // `**/` also matches no folder at all, so `**/*.svg` matches `a.svg`.
      if (glob.charAt(i + 2) === '/') {
        pattern += '(?:.*/)?';
        i += 2;
      } else {
        pattern += '.*';
        i += 1;
      }
    } else if (char === '*') {
      pattern += '[^/]*';
    } else if (char === '?') {
      pattern += '[^/]';
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, String.raw`\$&`);
    }
  }
  return new RegExp(`^${pattern}$`);
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function nearestManifest(file: string, manifestFolders: ReadonlySet<string>): string | undefined {
  let folder = folderOf(file);
  while (folder !== '') {
    if (manifestFolders.has(folder)) return folder;
    folder = folderOf(folder);
  }
  return undefined;
}

function parseManifest(path: string, text: string, problems: LicenseProblem[]): LicenseEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    problems.push({ path, detail: 'is not valid JSON' });
    return [];
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push({ path, detail: `entry field ${issue.path.join('.') || '(root)'}: ${issue.message}` });
    }
    return [];
  }
  return parsed.data;
}

/** Every problem with the license manifests under assets/. An empty list means the check passes. */
export function checkAssetLicenses(tree: AssetTree): LicenseProblem[] {
  const problems: LicenseProblem[] = [];
  if (tree.files.includes(MANIFEST_NAME)) {
    problems.push({ path: MANIFEST_NAME, detail: 'must live in a folder under assets/, not in assets/ itself' });
  }
  const manifestPaths = tree.files.filter((file) => file.endsWith(`/${MANIFEST_NAME}`));
  const manifestFolders = new Set(manifestPaths.map(folderOf));

  const entriesByFolder = new Map<string, Array<{ entry: LicenseEntry; matcher: RegExp; used: boolean }>>();
  for (const manifestPath of manifestPaths) {
    const entries = parseManifest(manifestPath, tree.read(manifestPath), problems);
    entriesByFolder.set(
      folderOf(manifestPath),
      entries.map((entry) => ({ entry, matcher: globToRegExp(entry.files), used: false })),
    );
  }

  for (const file of tree.files) {
    if (file === MANIFEST_NAME || manifestPaths.includes(file)) continue;
    const folder = nearestManifest(file, manifestFolders);
    if (folder === undefined) {
      problems.push({ path: file, detail: `has no ${MANIFEST_NAME} in its folder or a parent folder` });
      continue;
    }
    const relative = file.slice(folder.length + 1);
    const entries = entriesByFolder.get(folder) ?? [];
    const matching = entries.filter((candidate) => candidate.matcher.test(relative));
    for (const candidate of matching) candidate.used = true;
    if (matching.length === 0) {
      problems.push({ path: file, detail: `matches no entry in ${folder}/${MANIFEST_NAME}` });
    }
  }

  for (const [folder, entries] of entriesByFolder) {
    for (const { entry, used } of entries) {
      if (!used)
        problems.push({ path: `${folder}/${MANIFEST_NAME}`, detail: `entry "${entry.files}" matches no file` });
    }
  }

  return problems;
}
