import type { PictureSummary, SavePictureInput } from '../../../core/platform/bridge.ts';
import type { BridgeResult } from '../../../app/session/sessionStore.ts';
import type { StudioScope } from '../studioScope.ts';

export interface EncodedPicture {
  readonly png: Uint8Array;
  readonly thumbnail: Uint8Array;
}

export interface AutosaveOptions {
  readonly scope: StudioScope;
  /** How long painting must pause before a save, in milliseconds. */
  readonly delayMs: number;
  /** Reads the picture as it is now. Take the pixels before the first await. */
  readonly encode: () => Promise<EncodedPicture>;
  readonly save: (input: SavePictureInput) => Promise<BridgeResult<PictureSummary>>;
}

/**
 * Saves the picture on its own, with no button and no file dialog: after painting pauses, and when
 * the child leaves. The first save creates a gallery picture and later saves overwrite it. Saves
 * never overlap, and a change made during a save is saved right after it. A failed save keeps the
 * picture marked unsaved, so the next change or leaving tries again; the session layer already
 * shows the adult what failed.
 */
export class Autosaver {
  private id: string | null;
  private saved: number;
  private latest: number;
  private cancelTimer: () => void = () => undefined;
  private running: Promise<void> | null = null;
  private readonly options: AutosaveOptions;

  constructor(options: AutosaveOptions, pictureId: string | null = null, version = 0) {
    this.options = options;
    this.id = pictureId;
    this.saved = version;
    this.latest = version;
  }

  /** The gallery picture this one saves to, or null before its first save. */
  get pictureId(): string | null {
    return this.id;
  }

  get hasUnsavedChanges(): boolean {
    return this.latest !== this.saved;
  }

  /** Tells the saver the picture changed. It saves once painting pauses for the delay. */
  changed(version: number): void {
    this.latest = version;
    this.cancelTimer();
    if (!this.hasUnsavedChanges) return;
    this.cancelTimer = this.options.scope.setTimeout(() => void this.flush(), this.options.delayMs);
  }

  /** Saves now if anything is unsaved, and resolves when every save so far has landed or failed. */
  async flush(): Promise<void> {
    this.cancelTimer();
    while (this.running !== null) await this.running;
    if (!this.hasUnsavedChanges) return;
    const run = this.saveLatest();
    this.running = run;
    try {
      await run;
    } finally {
      this.running = null;
    }
    // A change made while that save ran gets its own save. A failed save stops here.
    if (this.hasUnsavedChanges && this.lastSaveOk) await this.flush();
  }

  private lastSaveOk = true;

  private async saveLatest(): Promise<void> {
    const version = this.latest;
    const picture = await this.options.encode();
    const result = await this.options.save({ ...(this.id === null ? {} : { id: this.id }), ...picture });
    this.lastSaveOk = result.ok;
    if (!result.ok) return;
    this.id = result.value.id;
    this.saved = version;
  }
}
