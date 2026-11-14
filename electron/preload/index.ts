// The bridge preload. It runs sandboxed, so esbuild bundles it as one CommonJS file for the
// browser platform and any Node built-in import fails the build. It exposes one object,
// window.wkBridge, with one function per bridge method that forwards the call unchanged. The
// main process validates every argument. Keep logic out of this file.
import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_METHODS, channelFor, CLOSE_REQUEST_CHANNEL } from '../../src/core/platform/ipc.ts';

const api: Record<string, unknown> = Object.fromEntries(
  BRIDGE_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(channelFor(method), ...args)]),
);

api.onCloseRequest = (listener: () => void) => {
  const handler = () => listener();
  ipcRenderer.on(CLOSE_REQUEST_CHANNEL, handler);
  return () => {
    ipcRenderer.removeListener(CLOSE_REQUEST_CHANNEL, handler);
  };
};

contextBridge.exposeInMainWorld('wkBridge', api);
