import { existsSync, readdirSync } from 'node:fs';

// PLACEHOLDER for check:voice. The real check is described in docs/architecture.md under
// "Voice clips". Until it exists, this passes only while assets/voice holds no files, so the
// first clip cannot land without a real voice check.
const dir = 'assets/voice';
const files = existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }) : [];
if (files.some((entry) => entry.isFile())) {
  console.error('check:voice failed: assets/voice has files but the voice check is still the scaffold placeholder.');
  console.error('Implement tools/checkVoice.ts as docs/architecture.md describes.');
  process.exit(1);
}
console.log('check:voice placeholder passed: assets/voice holds no clips yet.');
