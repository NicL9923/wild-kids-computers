import { existsSync, readdirSync } from 'node:fs';

// PLACEHOLDER for check:licenses. The real check is described in docs/architecture.md under
// "Assets and licenses". Until it exists, this passes only while assets/ holds no files, so
// the first asset cannot land without a real license check.
const files = existsSync('assets') ? readdirSync('assets', { recursive: true, withFileTypes: true }) : [];
if (files.some((entry) => entry.isFile())) {
  console.error('check:licenses failed: assets/ has files but the license check is still the scaffold placeholder.');
  console.error('Implement tools/checkLicenses.ts as docs/architecture.md describes.');
  process.exit(1);
}
console.log('check:licenses placeholder passed: assets/ holds no files yet.');
