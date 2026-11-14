import { defineConfig, type ViteUserConfig } from 'vitest/config';
import baseConfig from '../../vite.config.ts';

/**
 * Vitest tasks that need a registry, which only Vite can load, but are not unit tests: the voice
 * check and the spoken string export for the generator. `npm test` never runs them, because a
 * feature branch adds strings before the integration branch generates their clips.
 */
export default defineConfig((env) => {
  const base: ViteUserConfig = baseConfig(env);
  return {
    ...base,
    root: new URL('../..', import.meta.url).pathname,
    test: {
      ...base.test,
      include: ['tools/tasks/*.task.ts'],
      coverage: { enabled: false },
    },
  };
});
