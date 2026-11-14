import type { TestInfo } from './testInfo.ts';
import type { DocumentName, PicturePlace } from './names.ts';

/**
 * The one way the renderer reaches the system. The Electron build implements it over IPC and
 * the browser build over browser storage. e2e/bridge/ runs one contract suite against both.
 *
 * The bridge moves bytes and text. It validates names, sizes, and file signatures, and nothing
 * more. Document schemas live in src/core/storage/, so both implementations share them.
 */
export interface PlatformBridge {
  info(): Promise<PlatformInfo>;
  documents: DocumentStore;
  pictures: PictureStore;
  window: WindowControl;
  output: PictureOutput;
}

export type OsFamily = 'mac' | 'windows' | 'linux';

interface PlatformInfo {
  /** The operating system family, so shortcut lessons show the right modifier key. */
  os: OsFamily;
  appVersion: string;
  isElectron: boolean;
  /** Present only when the Electron app runs with WKC_TEST=1. */
  test?: TestInfo;
}

export interface DocumentStore {
  /** The document's text, or null when it was never written. */
  read(name: DocumentName): Promise<string | null>;
  /** Replaces the document atomically. Rejects with `too-large` past MAX_DOCUMENT_BYTES. */
  write(name: DocumentName, text: string): Promise<void>;
  /**
   * Moves the document out of the way under a `.corrupt-<timestamp>` name so the next read
   * returns null. Returns false when there was no document to move.
   */
  setAside(name: DocumentName): Promise<boolean>;
  /** Deletes every document and picture of a profile. Missing data is not an error. */
  removeProfile(profileId: string): Promise<void>;
}

export interface PictureSummary {
  id: string;
  /** Milliseconds since the epoch of the last save. */
  updatedAt: number;
}

export interface SavePictureInput {
  /** Overwrites this gallery picture. Omit it to create a new picture. */
  id?: string;
  png: Uint8Array;
  thumbnail: Uint8Array;
}

export type PictureFile = 'picture' | 'thumbnail';

export interface PictureStore {
  save(profileId: string, input: SavePictureInput): Promise<PictureSummary>;
  /** Pictures in the gallery or in the trash, newest first. An unknown profile has none. */
  list(profileId: string, place: PicturePlace): Promise<PictureSummary[]>;
  /** Reads a picture from the gallery or the trash. */
  read(profileId: string, id: string, file: PictureFile): Promise<Uint8Array>;
  /** Duplicates a gallery picture under a new id. */
  copy(profileId: string, id: string): Promise<PictureSummary>;
  /** Moves a gallery picture to the trash. Restore undoes it. */
  trash(profileId: string, id: string): Promise<void>;
  /** Moves a trashed picture back to the gallery. */
  restore(profileId: string, id: string): Promise<PictureSummary>;
  /** Deletes a trashed picture for good. A gallery picture must be trashed first. */
  purge(profileId: string, id: string): Promise<void>;
}

export interface WindowState {
  fullscreen: boolean;
  kioskLock: boolean;
}

interface WindowControl {
  getState(): Promise<WindowState>;
  setFullscreen(on: boolean): Promise<WindowState>;
  /** Fullscreen, plus a close request goes to the renderer instead of closing. Best effort. */
  setKioskLock(on: boolean): Promise<WindowState>;
  /**
   * Called when someone tries to close the app while kiosk lock is on. The renderer shows the
   * parent gate and calls acknowledgeCloseRequest() at once. Without that answer the app closes
   * after a few seconds, because a hung app must still close. Returns an unsubscribe function.
   */
  onCloseRequest(listener: () => void): () => void;
  acknowledgeCloseRequest(): Promise<void>;
  /** Quits the app. The renderer calls it after the parent gate passes. */
  quit(): Promise<void>;
}

export type ExportResult = 'saved' | 'cancelled';
export type PrintResult = 'printed' | 'cancelled';

interface PictureOutput {
  /** Saves a PNG where the adult chooses. `fileStem` must pass isExportFileStem. */
  exportPicture(png: Uint8Array, fileStem: string): Promise<ExportResult>;
  printPicture(png: Uint8Array): Promise<PrintResult>;
}

export type BridgeErrorCode =
  /** A name, id, size, or file signature failed validation. */
  | 'invalid-argument'
  /** The text or bytes are over the cap in limits.ts. */
  | 'too-large'
  /** The document or picture does not exist in the place the call needs. */
  | 'not-found'
  /** The call came from a frame that is not the app's own page. */
  | 'forbidden'
  /** The platform failed to read or write. */
  | 'io';

export class BridgeError extends Error {
  override readonly name = 'BridgeError';
  readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function isBridgeError(error: unknown, code?: BridgeErrorCode): error is BridgeError {
  return error instanceof BridgeError && (code === undefined || error.code === code);
}
