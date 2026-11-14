import { rm } from 'node:fs/promises';
import { build, type BuildOptions } from 'esbuild';

export const ELECTRON_OUT_DIR = 'dist/electron';

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
}

if (import.meta.main) {
  await buildElectron({ mode: 'production' });
}
