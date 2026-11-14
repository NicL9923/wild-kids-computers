import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { buildElectron } from './buildElectron.ts';

// Runs the Vite dev server and Electron together. Electron loads the dev server only because
// the app is unpackaged and WKC_DEV_SERVER_URL is set. Renderer changes hot-reload. Main or
// preload changes need a restart of this command.
const require = createRequire(import.meta.url);
// In Node, the electron package exports the path to the Electron binary.
const electronBinary: unknown = require('electron');
if (typeof electronBinary !== 'string') {
  throw new TypeError('Expected the electron package to export the path to the Electron binary.');
}

const server = await createServer();
await server.listen();
const devServerUrl = server.resolvedUrls?.local[0];
if (devServerUrl === undefined) {
  await server.close();
  throw new Error('The Vite dev server did not report a local URL.');
}
server.printUrls();

await buildElectron({ mode: 'development' });

// Extra arguments go to Electron, for example `npm run dev -- --remote-debugging-port=9222`.
const electron = spawn(electronBinary, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, WKC_DEV_SERVER_URL: devServerUrl },
});

const stop = () => electron.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

electron.on('exit', (code) => {
  void server.close().then(() => process.exit(code ?? 0));
});
