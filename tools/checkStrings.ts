import { readdirSync } from 'node:fs';

// PLACEHOLDER for check:strings. The real check is described in docs/architecture.md under
// "Strings and voice". Until it exists, this passes only while no src/**/strings.ts file exists,
// so the first string catalog cannot land without a real strings check.
const catalogs = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter(
  (file) => file === 'strings.ts' || file.endsWith('/strings.ts') || file.endsWith('\\strings.ts'),
);
if (catalogs.length > 0) {
  console.error('check:strings failed: string catalogs exist but the strings check is still the scaffold placeholder.');
  for (const file of catalogs) console.error(`  src/${file}`);
  console.error('Implement tools/checkStrings.ts as docs/architecture.md describes.');
  process.exit(1);
}
console.log('check:strings placeholder passed: no src/**/strings.ts catalogs yet.');
