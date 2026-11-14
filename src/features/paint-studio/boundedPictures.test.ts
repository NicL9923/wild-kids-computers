import { describe, expect, it } from 'vitest';
import type { BridgeResult, ProfilePictures } from '../../app/session/sessionStore.ts';
import { createManualScheduler } from '../../core/activityKit/scheduler.ts';
import { BridgeError } from '../../core/platform/bridge.ts';
import { PICTURE_CALL_DEADLINE_MS, boundedPictures } from './boundedPictures.ts';

const summary = { id: 'p1', updatedAt: 5 };

const never = (): Promise<never> => new Promise<never>(() => undefined);

/** Pictures whose every call never answers, except the ones a test gives an answer. */
function pictures(answers: Partial<Omit<ProfilePictures, 'profileId'>> = {}): ProfilePictures {
  return {
    profileId: 'fox-kid',
    list: never,
    read: never,
    save: never,
    copy: never,
    trash: never,
    restore: never,
    purge: never,
    ...answers,
  };
}

describe('boundedPictures', () => {
  it.each([
    ['list', (p: ProfilePictures) => p.list('gallery')],
    ['read', (p: ProfilePictures) => p.read('p1', 'picture')],
    ['save', (p: ProfilePictures) => p.save({ png: new Uint8Array(), thumbnail: new Uint8Array() })],
    ['copy', (p: ProfilePictures) => p.copy('p1')],
    ['trash', (p: ProfilePictures) => p.trash('p1')],
    ['restore', (p: ProfilePictures) => p.restore('p1')],
    ['purge', (p: ProfilePictures) => p.purge('p1')],
  ] as const)('ends a %s call that never answers as an io failure naming the call', async (name, call) => {
    const timers = createManualScheduler({ wall: 0 });
    const result = call(boundedPictures(pictures(), timers));
    let ended: BridgeResult<unknown> | null = null;
    void result.then((value) => (ended = value));
    timers.advance(PICTURE_CALL_DEADLINE_MS - 1);
    await Promise.resolve();
    expect(ended).toBeNull();
    timers.advance(1);
    const failed = await result;
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error).toBeInstanceOf(BridgeError);
    expect(failed.error.code).toBe('io');
    expect(failed.error.message).toBe(`The picture call ${name} did not finish within ${PICTURE_CALL_DEADLINE_MS} ms.`);
  });

  it('passes on an answer in time, a failure included, and keeps the profile', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const notFound = { ok: false, error: new BridgeError('not-found', 'gone') } as const;
    const bounded = boundedPictures(
      pictures({
        copy: () => Promise.resolve({ ok: true, value: summary }),
        trash: () => Promise.resolve(notFound),
      }),
      timers,
    );
    expect(bounded.profileId).toBe('fox-kid');
    await expect(bounded.copy('p1')).resolves.toEqual({ ok: true, value: summary });
    await expect(bounded.trash('p1')).resolves.toBe(notFound);
    expect(timers.pending()).toBe(0);
  });
});
