import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { CONTENT_SECURITY_POLICY_META } from './electron/main/contentSecurityPolicy.ts';
import { buildNotices, NOTICES_FILE_NAME } from './tools/notices.ts';
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

/** The notices text, or an error that names every missing notice. */
function generateNotices(): string {
  const { text, problems } = buildNotices(process.cwd());
  if (problems.length > 0) {
    throw new Error(
      `Third-party notices are incomplete:\n${problems.map((p) => `  ${p.where} ${p.detail}`).join('\n')}`,
    );
  }
  return text;
}

/**
 * Writes the third-party notices from tools/notices.ts into the build, and serves them in dev, so
 * the parent corner can show them. A build with a missing notice fails here as well as in
 * check:notices. A second copy goes to dist/notices/ for electron-builder to put beside the
 * program files; an extraResources source inside the app's own files would leave app.asar.
 */
function thirdPartyNotices(): Plugin {
  let text = '';
  return {
    name: 'wkc-third-party-notices',
    apply: 'build',
    generateBundle() {
      text = generateNotices();
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE_NAME, source: text });
    },
    writeBundle(options) {
      const dir = path.resolve(options.dir ?? 'dist/renderer', '..', 'notices');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, NOTICES_FILE_NAME), text);
    },
  };
}

/** Serves the notices on the dev server, where the parent corner fetches them the same way. */
function thirdPartyNoticesInDev(): Plugin {
  return {
    name: 'wkc-third-party-notices-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(`/${NOTICES_FILE_NAME}`, (_request, response) => {
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        response.end(generateNotices());
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Workers inherit TZ from this process, so set it before Vitest starts them.
  if (process.env.VITEST !== undefined) process.env.TZ = timezoneForMode(mode);

  return {
    // Relative asset URLs, so one build runs under app://bundle/ and as a static site.
    base: './',
    plugins: [react(), tailwindcss(), contentSecurityPolicyMeta(), thirdPartyNotices(), thirdPartyNoticesInDev()],
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
        exclude: ['**/*.test.{ts,tsx}', '**/testing/**', 'tools/test/**', 'src/main.tsx', '**/*.md', '**/*.py'],
        reporter: ['text-summary', 'html', 'json-summary'],
      },
    },
  };
});
