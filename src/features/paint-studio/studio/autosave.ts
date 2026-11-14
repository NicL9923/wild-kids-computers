import type { PictureSummary, SavePictureInput } from '../../../core/platform/bridge.ts';
import type { BridgeResult } from '../../../app/session/sessionStore.ts';
import type { Scope } from '../../../core/activityKit/scope.ts';
import type { StudioDocument } from './studioDocument.ts';

export interface EncodedPicture {
  readonly png: Uint8Array;
  readonly thumbnail: Uint8Array;
}

/** A picture in the studio and where it stands with the gallery. */
export interface KeptPicture {
  readonly studio: StudioDocument;
  /** The gallery picture it saves to, or null before its first save. */
  readonly id: string | null;
  /** The studio version the gallery already has. A picture opened from the gallery has its current version. */
  readonly savedVersion: number;
}

export interface AutosaveOptions {
  readonly scope: Scope;
  /** How long painting must pause before a save, in milliseconds. */
  readonly delayMs: number;
  /** The picture as gallery files. Take the pixels before the first await. */
  readonly encode: (studio: StudioDocument) => Promise<EncodedPicture>;
  readonly save: (input: SavePictureInput) => Promise<BridgeResult<PictureSummary>>;
  /** Hears when saving starts failing, and when a save lands again after that. */
  readonly onFailingChange?: (failing: boolean) => void;
}

/**
 * Keeps the studio's picture safe. It saves on its own, with no button and no file dialog: after
 * painting pauses, and before the studio lets go of the picture. The first save creates a gallery
 * picture and later saves overwrite it. Saves never overlap, and a change made during a save is
 * saved right after it.
 *
 * The saver holds exactly one picture, and the only way to put another in its place is
 * `switchTo`, which first saves the one it holds. So a picture is never dropped unsaved: when a
 * save fails, the old picture stays, and the caller tells the child and the adult.
 *
 * Whether anything is unsaved comes from counting: the studio's version counts every committed
 * change, and a stroke still open counts as unsaved until `keep` commits it.
 */
export class Autosaver {
  private picture: StudioDocument;
  private id: string | null;
  private saved: number;
  private failingNow = false;
  private cancelTimer: () => void = () => undefined;
  private unsubscribe: () => void = () => undefined;
  private running: Promise<void> | null = null;
  private readonly options: AutosaveOptions;

  constructor(options: AutosaveOptions, picture: KeptPicture) {
    this.options = options;
    this.picture = picture.studio;
    this.id = picture.id;
    this.saved = picture.savedVersion;
    this.watch();
  }

  /** The picture the saver holds. */
  get studio(): StudioDocument {
    return this.picture;
  }

  /** The gallery picture this one saves to, or null before its first save. */
  get pictureId(): string | null {
    return this.id;
  }

  /** A committed change the gallery does not have, or a stroke still open. */
  get hasUnsavedChanges(): boolean {
    return this.picture.stroking || this.hasUnsavedCommits;
  }

  /** Whether the newest save failed. A save that lands clears it. */
  get failing(): boolean {
    return this.failingNow;
  }

  private get hasUnsavedCommits(): boolean {
    return this.picture.version !== this.saved;
  }

  /**
   * Commits any stroke still open and saves every change. Resolves to true once the picture the
   * saver holds is fully saved, and to false when a save failed, so the caller keeps the picture.
   */
  async keep(): Promise<boolean> {
    for (;;) {
      const current = this.picture;
      current.end();
      if (!(await this.flush())) return false;
      if (this.picture === current && !this.hasUnsavedChanges) return true;
    }
  }

  /**
   * Saves the picture it holds, and only when that landed takes the next one. Resolves to whether
   * it switched. On false the old picture is still the one held, with its changes.
   */
  async switchTo(next: KeptPicture): Promise<boolean> {
    for (;;) {
      if (!(await this.keep())) return false;
      // Another switch may have finished during that await. Its picture must be saved too.
      if (!this.hasUnsavedChanges) break;
    }
    this.unsubscribe();
    this.cancelTimer();
    this.picture = next.studio;
    this.id = next.id;
    this.saved = next.savedVersion;
    this.watch();
    return true;
  }

  /** Stops watching the picture. It does not save; call `keep` first. */
  dispose(): void {
    this.unsubscribe();
    this.cancelTimer();
  }

  /** Saves now if any committed change is unsaved. Resolves to whether every save landed. */
  async flush(): Promise<boolean> {
    this.cancelTimer();
    while (this.running !== null) await this.running;
    if (!this.hasUnsavedCommits) return true;
    const run = this.saveLatest();
    this.running = run.then(() => undefined);
    let landed: boolean;
    try {
      landed = await run;
    } finally {
      this.running = null;
    }
    this.setFailing(!landed);
    // A change made while that save ran gets its own save. A failed save stops here.
    if (landed && this.hasUnsavedCommits) return this.flush();
    return landed;
  }

  private watch(): void {
    this.unsubscribe = this.picture.subscribe(() => this.schedule());
    this.schedule();
  }

  /** Saves once painting pauses for the delay. */
  private schedule(): void {
    this.cancelTimer();
    if (!this.hasUnsavedCommits) return;
    this.cancelTimer = this.options.scope.setTimeout(() => void this.flush(), this.options.delayMs);
  }

  private setFailing(failing: boolean): void {
    if (this.failingNow === failing) return;
    this.failingNow = failing;
    this.options.onFailingChange?.(failing);
  }

  /** Saves the newest version. Resolves to whether the save landed. */
  private async saveLatest(): Promise<boolean> {
    const picture = this.picture;
    const version = picture.version;
    let files: EncodedPicture;
    try {
      files = await this.options.encode(picture);
    } catch {
      // The picture could not be turned into files. It stays unsaved, and leaving tries again.
      return false;
    }
    const result = await this.options.save({ ...(this.id === null ? {} : { id: this.id }), ...files });
    if (!result.ok) return false;
    // Only `switchTo` changes the picture, and it waits for this save, so it is still the one held.
    this.id = result.value.id;
    this.saved = version;
    return true;
  }
}
