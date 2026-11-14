import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Rewrites paint goldens whose pixels changed: npm run paint:goldens
 * It runs the paint tests with WKC_UPDATE_GOLDENS=1. Look at every changed PNG in
 * src/core/paint/__goldens__/ before committing it.
 */
const vitest = path.join(process.cwd(), 'node_modules/vitest/vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitest, 'run', 'src/core/paint', 'src/registry', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, WKC_UPDATE_GOLDENS: '1' },
  },
);
process.exit(result.status ?? 1);
