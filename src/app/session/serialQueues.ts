/**
 * One promise chain per key. A task starts after every earlier task on the same key settles,
 * whether it resolved or rejected, so a failed write never blocks the next one. Tasks on
 * different keys run independently.
 */
export interface SerialQueues {
  /** Runs `task` after the earlier tasks on `key`. The returned promise settles like `task`. */
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
  /** Resolves once every task queued so far on keys that start with `prefix` has settled. */
  settled(prefix?: string): Promise<void>;
  /** Whether a task on a key that starts with `prefix` is queued or running. */
  busy(prefix?: string): boolean;
}

export function createSerialQueues(): SerialQueues {
  const tails = new Map<string, Promise<unknown>>();

  return {
    run(key, task) {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(task, task);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      // Forget a key once its chain is empty, so the map does not grow with every document.
      const forget = async () => {
        await tail;
        if (tails.get(key) === tail) tails.delete(key);
      };
      void forget();
      return result;
    },
    busy(prefix = '') {
      return [...tails.keys()].some((key) => key.startsWith(prefix));
    },
    async settled(prefix = '') {
      const pending = [...tails].filter(([key]) => key.startsWith(prefix)).map(([, tail]) => tail);
      await Promise.all(pending);
    },
  };
}
