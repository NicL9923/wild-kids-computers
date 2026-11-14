import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { checkAssetLicenses } from './licenseManifest.ts';

// check:licenses. Walks every file under assets/ and checks it against the LICENSES.json files,
// as "Assets and licenses" in docs/architecture.md describes. The build runs this first.
const root = 'assets';
const files = existsSync(root)
  ? readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
      .toSorted()
  : [];

const problems = checkAssetLicenses({
  files,
  read: (relative) => readFileSync(path.join(root, relative), 'utf8'),
});

if (problems.length > 0) {
  console.error('check:licenses failed:');
  for (const problem of problems) console.error(`  assets/${problem.path} ${problem.detail}`);
  process.exit(1);
}
console.log(`check:licenses passed. ${files.length} files under assets/ each match a license entry.`);
