import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { CONTENT_SECURITY_POLICY_META } from './electron/main/contentSecurityPolicy.ts';
import { timezoneForMode } from './tools/test/timezones.ts';

/** Puts the content security policy into the production index.html, for the browser build. */
function contentSecurityPolicyMeta(): Plugin {
  return {
    name: 'wkc-content-security-policy-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY_META },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  // Workers inherit TZ from this process, so set it before Vitest starts them.
  if (process.env.VITEST !== undefined) process.env.TZ = timezoneForMode(mode);

  return {
    // Relative asset URLs, so one build runs under app://bundle/ and as a static site.
    base: './',
    plugins: [react(), tailwindcss(), contentSecurityPolicyMeta()],
    // The paint studio's effect worker imports the paint registry, whose font tables load lazily,
    // so the worker is a module that can split chunks.
    worker: { format: 'es' },
    build: {
      outDir: 'dist/renderer',
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts', 'tools/**/*.test.ts'],
      setupFiles: ['tools/test/pinTimezone.ts'],
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**', 'electron/**', 'tools/**'],
        exclude: ['**/*.test.{ts,tsx}', '**/testing/**', 'tools/test/**', 'src/main.tsx'],
        reporter: ['text-summary', 'html', 'json-summary'],
      },
    },
  };
});
