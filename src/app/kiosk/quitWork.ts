/**
 * Work that must finish before the app quits, such as a picture the paint studio has not saved
 * yet. A screen holds its work here while it has any, and the close flow in closeRequest.ts
 * finishes all of it before the window closes, however the close started.
 *
 * ```ts
 * useEffect(() => quitWork.hold({ pending: () => saver.hasUnsavedChanges, finish: () => saver.keep() }), [saver]);
 * ```
 */
interface QuitWork {
  /** Whether anything is waiting. Called when a close starts, so keep it cheap. */
  readonly pending: () => boolean;
  /** Finishes the work. Resolves to whether it finished. Never rejects. */
  readonly finish: () => Promise<boolean>;
}

export interface QuitWorkRegistry {
  /** Adds work. Returns a function that removes it. */
  hold(work: QuitWork): () => void;
  pending(): boolean;
  /** Finishes every piece of work that is pending. Resolves to whether all of it finished. */
  finish(): Promise<boolean>;
}

export function createQuitWorkRegistry(): QuitWorkRegistry {
  const held = new Set<QuitWork>();
  return {
    hold(work) {
      held.add(work);
      return () => held.delete(work);
    },
    pending: () => [...held].some((work) => work.pending()),
    async finish() {
      const results = await Promise.all(
        [...held].map((work) => (work.pending() ? work.finish().catch(() => false) : Promise.resolve(true))),
      );
      return results.every(Boolean);
    },
  };
}

/** The app's one registry. Screens hold work here and the close flow finishes it. */
export const quitWork = createQuitWorkRegistry();
