import { z } from 'zod';
import { BridgeError, type PlatformBridge } from '../../src/core/platform/bridge.ts';
import { BRIDGE_METHODS, type BridgeMethod, type IpcResult } from '../../src/core/platform/ipc.ts';
import { isDocumentName, isExportFileStem, isSafeId } from '../../src/core/platform/names.ts';
import { errorCode } from './atomicWrite.ts';

const STORAGE_FULL_CODES = new Set(['ENOSPC', 'EDQUOT']);

/** The bridge as the main process implements it. Close requests travel the other way. */
export type BridgeImplementation = Omit<PlatformBridge, 'window'> & {
  window: Omit<PlatformBridge['window'], 'onCloseRequest' | 'onMenuCommand'>;
};

const documentName = z.string().refine(isDocumentName, 'not a known document name');
const safeId = z.string().refine(isSafeId, 'not a safe id');
const bytes = z.instanceof(Uint8Array, { message: 'expected bytes' });
const place = z.enum(['gallery', 'trash']);

type Handler = (bridge: BridgeImplementation, args: unknown[]) => Promise<IpcResult<unknown>>;

/**
 * Pairs a method's argument schema with its call, so the call only ever sees arguments that
 * passed the schema. Tuples are exact: a missing or extra argument fails.
 */
function handler<A extends z.ZodTuple>(
  name: BridgeMethod,
  schema: A,
  call: (bridge: BridgeImplementation, args: z.infer<A>) => Promise<unknown>,
): Handler {
  return async (bridge, args) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, code: 'invalid-argument', message: `${name}: ${describeIssues(parsed.error)}` };
    }
    try {
      return { ok: true, value: await call(bridge, parsed.data) };
    } catch (error) {
      if (error instanceof BridgeError) return { ok: false, code: error.code, message: error.message };
      if (STORAGE_FULL_CODES.has(errorCode(error))) {
        return { ok: false, code: 'storage-full', message: `${name} ran out of storage space.` };
      }
      console.error(`Bridge call ${name} failed`, error);
      return { ok: false, code: 'io', message: `${name} failed.` };
    }
  };
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `argument ${issue.path.join('.') || '(all)'}: ${issue.message}`).join('; ');
}

const HANDLERS: Record<BridgeMethod, Handler> = {
  info: handler('info', z.tuple([]), (bridge) => bridge.info()),
  'documents.read': handler('documents.read', z.tuple([documentName]), (bridge, [name]) => bridge.documents.read(name)),
  'documents.write': handler('documents.write', z.tuple([documentName, z.string()]), (bridge, [name, text]) =>
    bridge.documents.write(name, text),
  ),
  'documents.setAside': handler('documents.setAside', z.tuple([documentName]), (bridge, [name]) =>
    bridge.documents.setAside(name),
  ),
  'documents.removeProfile': handler('documents.removeProfile', z.tuple([safeId]), (bridge, [profileId]) =>
    bridge.documents.removeProfile(profileId),
  ),
  'pictures.save': handler(
    'pictures.save',
    z.tuple([safeId, z.object({ id: safeId.optional(), png: bytes, thumbnail: bytes }).strict()]),
    (bridge, [profileId, input]) => bridge.pictures.save(profileId, input),
  ),
  'pictures.list': handler('pictures.list', z.tuple([safeId, place]), (bridge, [profileId, where]) =>
    bridge.pictures.list(profileId, where),
  ),
  'pictures.read': handler(
    'pictures.read',
    z.tuple([safeId, safeId, z.enum(['picture', 'thumbnail'])]),
    (bridge, [profileId, id, file]) => bridge.pictures.read(profileId, id, file),
  ),
  'pictures.copy': handler('pictures.copy', z.tuple([safeId, safeId]), (bridge, [profileId, id]) =>
    bridge.pictures.copy(profileId, id),
  ),
  'pictures.trash': handler('pictures.trash', z.tuple([safeId, safeId]), (bridge, [profileId, id]) =>
    bridge.pictures.trash(profileId, id),
  ),
  'pictures.restore': handler('pictures.restore', z.tuple([safeId, safeId]), (bridge, [profileId, id]) =>
    bridge.pictures.restore(profileId, id),
  ),
  'pictures.purge': handler('pictures.purge', z.tuple([safeId, safeId]), (bridge, [profileId, id]) =>
    bridge.pictures.purge(profileId, id),
  ),
  'window.getState': handler('window.getState', z.tuple([]), (bridge) => bridge.window.getState()),
  'window.setFullscreen': handler('window.setFullscreen', z.tuple([z.boolean()]), (bridge, [on]) =>
    bridge.window.setFullscreen(on),
  ),
  'window.setKioskLock': handler('window.setKioskLock', z.tuple([z.boolean()]), (bridge, [on]) =>
    bridge.window.setKioskLock(on),
  ),
  'window.acknowledgeCloseRequest': handler('window.acknowledgeCloseRequest', z.tuple([]), (bridge) =>
    bridge.window.acknowledgeCloseRequest(),
  ),
  'window.quit': handler('window.quit', z.tuple([]), (bridge) => bridge.window.quit()),
  'output.exportPicture': handler(
    'output.exportPicture',
    z.tuple([bytes, z.string().refine(isExportFileStem, 'not an allowed file name')]),
    (bridge, [png, fileStem]) => bridge.output.exportPicture(png, fileStem),
  ),
  'output.printPicture': handler('output.printPicture', z.tuple([bytes]), (bridge, [png]) =>
    bridge.output.printPicture(png),
  ),
};

function isBridgeMethod(method: string): method is BridgeMethod {
  return (BRIDGE_METHODS as readonly string[]).includes(method);
}

/**
 * Validates the arguments of one bridge call and runs it. Never throws: every failure becomes
 * an IpcResult with a code the renderer can act on.
 */
export function handleBridgeCall(
  bridge: BridgeImplementation,
  method: string,
  args: unknown[],
): Promise<IpcResult<unknown>> {
  if (!isBridgeMethod(method)) {
    return Promise.resolve({ ok: false, code: 'invalid-argument', message: `Unknown method ${method}.` });
  }
  return HANDLERS[method](bridge, args);
}

export interface SenderFacts {
  /** The id of the web contents that sent the call. */
  webContentsId: number;
  /** The sending frame's URL, or null when the frame is gone. */
  frameUrl: string | null;
  /** True when the sending frame is the top frame of its page. */
  isMainFrame: boolean;
}

export interface TrustedSender {
  webContentsId: number;
  /** `scheme://host` of every page allowed to call the bridge. */
  origins: readonly string[];
}

/** `scheme://host`. URL.origin is "null" for a scheme Node does not know, such as app:. */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.host === '' ? null : `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/** Only the top frame of the app's own window, showing the app's own page, may call. */
export function isTrustedSender(sender: SenderFacts, trusted: TrustedSender): boolean {
  if (sender.webContentsId !== trusted.webContentsId || !sender.isMainFrame || sender.frameUrl === null) return false;
  const origin = originOf(sender.frameUrl);
  return origin !== null && trusted.origins.includes(origin);
}
