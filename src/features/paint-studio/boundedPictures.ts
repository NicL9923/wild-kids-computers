import { useMemo } from 'react';
import { usePictures } from '../../app/session/sessionHooks.ts';
import type { BridgeResult, ProfilePictures } from '../../app/session/sessionStore.ts';
import { withDeadline } from '../../core/activityKit/deadline.ts';
import { systemScheduler, type Scheduler } from '../../core/activityKit/scheduler.ts';
import { BridgeError } from '../../core/platform/bridge.ts';

/**
 * How long one picture call to the main process may take, in milliseconds. A call reads or writes
 * one PNG of a 1600 by 1000 picture, at most a few megabytes, which a slow laptop's disk does in
 * well under a second. Saving waits for it, and so do opening, copying, and trashing a picture.
 */
export const PICTURE_CALL_DEADLINE_MS = 10_000;

/**
 * The profile's pictures, where every call ends: a call that does not answer in time resolves to
 * an `io` failure, the same result a failed disk gives, so the studio and the gallery handle it the
 * way they already handle that. The call itself may still finish later; its result is dropped.
 */
export function boundedPictures(
  pictures: ProfilePictures,
  timers: Pick<Scheduler, 'setTimeout'>,
  ms: number = PICTURE_CALL_DEADLINE_MS,
): ProfilePictures {
  function bound<A extends unknown[], T>(
    name: string,
    call: (...args: A) => Promise<BridgeResult<T>>,
  ): (...args: A) => Promise<BridgeResult<T>> {
    return (...args) =>
      withDeadline(call(...args), ms, timers, `The picture call ${name}`).catch((error: unknown): BridgeResult<T> => ({
        ok: false,
        error: new BridgeError('io', error instanceof Error ? error.message : String(error)),
      }));
  }
  return {
    profileId: pictures.profileId,
    list: bound('list', pictures.list),
    read: bound('read', pictures.read),
    save: bound('save', pictures.save),
    copy: bound('copy', pictures.copy),
    trash: bound('trash', pictures.trash),
    restore: bound('restore', pictures.restore),
    purge: bound('purge', pictures.purge),
  };
}

/** The active profile's pictures with a deadline on every call, on real time. */
export function useBoundedPictures(): ProfilePictures {
  const pictures = usePictures();
  return useMemo(() => boundedPictures(pictures, systemScheduler()), [pictures]);
}
