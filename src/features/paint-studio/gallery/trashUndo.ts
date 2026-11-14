import type { Cancel } from '../../../core/activityKit/scheduler.ts';
import type { Scope } from '../../../core/activityKit/scope.ts';

interface TrashUndoOptions {
  readonly scope: Scope;
  /** How long the "bring it back" control stays. */
  readonly undoMs: number;
  /** Deletes a trashed picture for good. Its result is not awaited: nothing on screen waits for it. */
  readonly purge: (id: string) => unknown;
  /** The picture the undo control offers, or null when the control goes away. */
  readonly onChange: (id: string | null) => void;
}

/**
 * The gallery's one "bring it back" control. A trashed picture waits in the trash while the
 * control offers it. When the control goes away without a click, because it timed out, another
 * picture took its place, or the gallery closed, the picture is purged, so the trash never grows.
 */
export class TrashUndo {
  private waiting: string | null = null;
  private cancelTimer: Cancel = () => undefined;

  private readonly options: TrashUndoOptions;

  constructor(options: TrashUndoOptions) {
    this.options = options;
  }

  /** A picture went in the trash. An earlier picture still on offer is purged. */
  trashed(id: string): void {
    this.purgeWaiting();
    this.waiting = id;
    this.cancelTimer = this.options.scope.setTimeout(() => {
      this.purgeWaiting();
      this.options.onChange(null);
    }, this.options.undoMs);
    this.options.onChange(id);
  }

  /** The child clicked "bring it back". Returns the picture to restore, or null. */
  bringBack(): string | null {
    const id = this.waiting;
    if (id === null) return null;
    this.cancelTimer();
    this.waiting = null;
    this.options.onChange(null);
    return id;
  }

  /** The gallery is closing. The picture on offer can no longer come back. */
  close(): void {
    this.purgeWaiting();
  }

  private purgeWaiting(): void {
    this.cancelTimer();
    const id = this.waiting;
    if (id === null) return;
    this.waiting = null;
    this.options.purge(id);
  }
}
