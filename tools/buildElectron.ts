import { readFile, rm } from 'node:fs/promises';
import { build, type BuildOptions } from 'esbuild';

export const ELECTRON_OUT_DIR = 'dist/electron';

const FORBIDDEN_MAIN_REQUIRES = /\brequire\(\s*['"](?:node:)?(http|https|http2|net|tls|dgram|dns)['"]\s*\)/g;

/** Hard rule 1: verifies no transitive dependency bundled a Node networking module into main. */
export function findForbiddenMainRequires(bundleSource: string): string[] {
  const matches = new Set<string>();
  for (const match of bundleSource.matchAll(FORBIDDEN_MAIN_REQUIRES)) {
    if (match[1] !== undefined) matches.add(match[1]);
  }
  return [...matches].toSorted();
}

/**
 * Bundles the main process and the preload into dist/electron. Both are single CommonJS files.
 * The preload targets the browser platform because it runs sandboxed: a Node built-in import
 * fails the build instead of failing at runtime.
 */
export async function buildElectron(options: { mode: 'production' | 'development' }): Promise<void> {
  await rm(ELECTRON_OUT_DIR, { recursive: true, force: true });

  const common: BuildOptions = {
    bundle: true,
    format: 'cjs',
    external: ['electron'],
    sourcemap: options.mode === 'development' ? 'inline' : false,
    logLevel: 'warning',
    legalComments: 'none',
  };

  await Promise.all([
    build({
      ...common,
      entryPoints: ['electron/main/index.ts'],
      outfile: `${ELECTRON_OUT_DIR}/main.cjs`,
      platform: 'node',
      // Electron 45 ships Node 24.
      target: 'node24',
    }),
    build({
      ...common,
      entryPoints: ['electron/preload/index.ts'],
      outfile: `${ELECTRON_OUT_DIR}/preload.cjs`,
      platform: 'browser',
      // Electron 45 ships Chromium 156.
      target: 'chrome156',
    }),
  ]);

  const mainBundle = await readFile(`${ELECTRON_OUT_DIR}/main.cjs`, 'utf8');
  const forbidden = findForbiddenMainRequires(mainBundle);
  if (forbidden.length > 0) {
    throw new Error(`Hard rule 1: dist/electron/main.cjs requires networking built-ins: ${forbidden.join(', ')}`);
  }
}

if (import.meta.main) {
  await buildElectron({ mode: 'production' });
}
