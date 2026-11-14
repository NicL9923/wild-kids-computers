import { BridgeError, type PlatformBridge } from '../core/platform/bridge.ts';
import type { IpcResult, WkBridgeIpc } from '../core/platform/ipc.ts';

async function unwrap<T>(pending: Promise<IpcResult<T>>): Promise<T> {
  const result = await pending;
  if (result.ok) return result.value;
  throw new BridgeError(result.code, result.message);
}

/** The PlatformBridge over the IPC functions the preload exposes as window.wkBridge. */
export function createElectronBridge(ipc: WkBridgeIpc): PlatformBridge {
  return {
    info: () => unwrap(ipc.info()),
    documents: {
      read: (name) => unwrap(ipc['documents.read'](name)),
      write: (name, text) => unwrap(ipc['documents.write'](name, text)),
      setAside: (name) => unwrap(ipc['documents.setAside'](name)),
      removeProfile: (profileId) => unwrap(ipc['documents.removeProfile'](profileId)),
    },
    pictures: {
      save: (profileId, input) => unwrap(ipc['pictures.save'](profileId, input)),
      list: (profileId, place) => unwrap(ipc['pictures.list'](profileId, place)),
      read: (profileId, id, file) => unwrap(ipc['pictures.read'](profileId, id, file)),
      copy: (profileId, id) => unwrap(ipc['pictures.copy'](profileId, id)),
      trash: (profileId, id) => unwrap(ipc['pictures.trash'](profileId, id)),
      restore: (profileId, id) => unwrap(ipc['pictures.restore'](profileId, id)),
      purge: (profileId, id) => unwrap(ipc['pictures.purge'](profileId, id)),
    },
    window: {
      getState: () => unwrap(ipc['window.getState']()),
      setFullscreen: (on) => unwrap(ipc['window.setFullscreen'](on)),
      setKioskLock: (on) => unwrap(ipc['window.setKioskLock'](on)),
      onCloseRequest: (listener) => ipc.onCloseRequest(listener),
      acknowledgeCloseRequest: () => unwrap(ipc['window.acknowledgeCloseRequest']()),
      quit: () => unwrap(ipc['window.quit']()),
    },
    output: {
      exportPicture: (png, fileStem) => unwrap(ipc['output.exportPicture'](png, fileStem)),
      printPicture: (png) => unwrap(ipc['output.printPicture'](png)),
    },
  };
}
