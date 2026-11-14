import type { BridgeErrorCode, PlatformBridge } from './bridge.ts';

/**
 * The wire protocol between the preload and the main process. The preload exposes one function
 * per method on `window.wkBridge` and forwards each call unchanged. The main process answers
 * with an IpcResult, because Electron flattens a thrown error into a message string and the
 * renderer needs the error code.
 */
export const BRIDGE_METHODS = [
  'info',
  'documents.read',
  'documents.write',
  'documents.setAside',
  'documents.removeProfile',
  'pictures.save',
  'pictures.list',
  'pictures.read',
  'pictures.copy',
  'pictures.trash',
  'pictures.restore',
  'pictures.purge',
  'window.getState',
  'window.setFullscreen',
  'window.setKioskLock',
  'window.acknowledgeCloseRequest',
  'window.quit',
  'output.exportPicture',
  'output.printPicture',
] as const;

export type BridgeMethod = (typeof BRIDGE_METHODS)[number];

type Leaf<Path extends string> = Path extends `${infer Group}.${infer Method}`
  ? Group extends keyof PlatformBridge
    ? Method extends keyof PlatformBridge[Group]
      ? PlatformBridge[Group][Method]
      : never
    : never
  : Path extends keyof PlatformBridge
    ? PlatformBridge[Path]
    : never;

type AsyncFunction = (...args: never[]) => Promise<unknown>;

export type MethodSignature<M extends BridgeMethod> = Leaf<M> extends AsyncFunction ? Leaf<M> : never;

export type IpcResult<T> = { ok: true; value: T } | { ok: false; code: BridgeErrorCode; message: string };

/** What the preload exposes as `window.wkBridge`. */
export type WkBridgeIpc = {
  [M in BridgeMethod]: (
    ...args: Parameters<MethodSignature<M>>
  ) => Promise<IpcResult<Awaited<ReturnType<MethodSignature<M>>>>>;
} & {
  onCloseRequest(listener: () => void): () => void;
};

export function channelFor(method: BridgeMethod): `wkc:${BridgeMethod}` {
  return `wkc:${method}`;
}

/** Main to renderer: someone tried to close the app while kiosk lock is on. */
export const CLOSE_REQUEST_CHANNEL = 'wkc:close-request';
