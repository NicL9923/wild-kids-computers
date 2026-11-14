import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NOTICES_FILE_NAME } from './notices.ts';

/**
 * Checks that a packaged app ships the third-party notices: a copy beside its program files in
 * the resources folder, and the one the parent corner shows inside app.asar. Pass the folder that
 * holds packaged apps (release/, or a folder an AppImage was extracted into). Every resources
 * folder with an app.asar under it is checked, and at least one must exist.
 */

/** The file names under `dist/renderer/` in an asar archive, read from its JSON header. */
function asarRendererFiles(archive: Uint8Array): string[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  // Pickle layout: header size, then the header pickle's payload size and the JSON string length.
  const jsonLength = view.getUint32(12, true);
  const header: unknown = JSON.parse(new TextDecoder().decode(archive.subarray(16, 16 + jsonLength)));
  let node: unknown = header;
  for (const part of ['dist', 'renderer']) {
    const files: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'files') : undefined;
    node = typeof files === 'object' && files !== null ? Reflect.get(files, part) : undefined;
  }
  const files: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'files') : undefined;
  return typeof files === 'object' && files !== null ? Object.keys(files) : [];
}

function resourceFolders(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'app.asar')
    .map((entry) => entry.parentPath);
}

if (import.meta.main) {
  const root = process.argv[2] ?? 'release';
  const expected = readFileSync(path.join('dist', 'renderer', NOTICES_FILE_NAME), 'utf8');
  const folders = existsSync(root) ? resourceFolders(root) : [];
  const problems: string[] = folders.length === 0 ? [`no packaged app.asar under ${root}`] : [];
  for (const folder of folders) {
    const beside = path.join(folder, NOTICES_FILE_NAME);
    if (!existsSync(beside)) problems.push(`${beside} is missing`);
    else if (readFileSync(beside, 'utf8') !== expected) problems.push(`${beside} differs from the build's notices`);
    if (!asarRendererFiles(readFileSync(path.join(folder, 'app.asar'))).includes(NOTICES_FILE_NAME)) {
      problems.push(`${folder}/app.asar has no dist/renderer/${NOTICES_FILE_NAME}`);
    }
  }
  if (problems.length > 0) {
    console.error('check:packaged-notices failed:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`check:packaged-notices passed for ${folders.join(', ')}.`);
}
