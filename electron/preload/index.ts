// The bridge preload. It runs sandboxed, so esbuild bundles it as one CommonJS file for the
// browser platform and any Node built-in import fails the build. It exposes one object,
// window.wkBridge, with one function per bridge method that forwards the call unchanged. The
// main process validates every argument. Keep logic out of this file.
import { contextBridge, ipcRenderer } from 'electron';
import {
  BRIDGE_METHODS,
  channelFor,
  CLOSE_REQUEST_CHANNEL,
  MENU_COMMAND_CHANNEL,
} from '../../src/core/platform/ipc.ts';
import { installFileGuards, refuseFileShowPicker } from './fileGuards.ts';

// Before any page script: no file from the system reaches the page.
contextBridge.executeInMainWorld({ func: refuseFileShowPicker });
installFileGuards(window);

const api: Record<string, unknown> = Object.fromEntries(
  BRIDGE_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(channelFor(method), ...args)]),
);

api.onCloseRequest = (listener: (request: unknown) => void) => {
  const handler = (_event: unknown, request: unknown) => listener(request);
  ipcRenderer.on(CLOSE_REQUEST_CHANNEL, handler);
  return () => {
    ipcRenderer.removeListener(CLOSE_REQUEST_CHANNEL, handler);
  };
};

api.onMenuCommand = (listener: (command: unknown) => void) => {
  const handler = (_event: unknown, command: unknown) => listener(command);
  ipcRenderer.on(MENU_COMMAND_CHANNEL, handler);
  return () => {
    ipcRenderer.removeListener(MENU_COMMAND_CHANNEL, handler);
  };
};

contextBridge.exposeInMainWorld('wkBridge', api);
