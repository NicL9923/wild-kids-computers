import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Hard rule 3 for the build: every non-code file in the renderer build came from assets/, where
 * check:licenses vouches for it. A file that a library or a stray import slipped into the bundle
 * fails here. `npm run build` runs this after the renderer build.
 *
 * Files are matched by content, because Vite renames them with a hash.
 */

/** Code the build writes itself. Everything else must be a copy of a file under assets/. */
const CODE_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.map']);

export interface BuildFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Paths of build files that are not code and match no asset by content. */
export function findForeignBuildFiles(buildFiles: readonly BuildFile[], assetFiles: readonly BuildFile[]): string[] {
  const known = new Set(assetFiles.map((file) => contentHash(file.bytes)));
  return buildFiles
    .filter((file) => !CODE_EXTENSIONS.has(path.extname(file.path).toLowerCase()))
    .filter((file) => !known.has(contentHash(file.bytes)))
    .map((file) => file.path)
    .toSorted();
}

function readTree(root: string): BuildFile[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = path.join(entry.parentPath, entry.name);
      return { path: path.relative(root, absolute).split(path.sep).join('/'), bytes: readFileSync(absolute) };
    });
}

if (import.meta.main) {
  const buildDir = 'dist/renderer';
  if (!existsSync(buildDir)) {
    console.error(`check:build-assets failed: ${buildDir} does not exist. Run the renderer build first.`);
    process.exit(1);
  }
  const foreign = findForeignBuildFiles(readTree(buildDir), readTree('assets'));
  if (foreign.length > 0) {
    console.error('check:build-assets failed: these build files did not come from assets/:');
    for (const file of foreign) console.error(`  ${buildDir}/${file}`);
    process.exit(1);
  }
  console.log('check:build-assets passed: every non-code file in the renderer build came from assets/.');
}
