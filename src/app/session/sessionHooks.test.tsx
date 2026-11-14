// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { documentNames } from '../../core/platform/names.ts';
import { activityStateDocument, appDocument } from '../../core/storage/schemas.ts';
import { useActivityState, usePictures, useSessionStatus } from './sessionHooks.ts';
import { SessionProvider } from './SessionProvider.tsx';
import { createSessionStore } from './sessionStore.ts';
import { createFakeBridge } from './testing/fakeBridge.ts';

afterEach(cleanup);

const PROFILE = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-6-8' } as const;
const lessons = activityStateDocument({
  schema: z.object({ furthestLesson: z.int().min(0) }),
  defaults: () => ({ furthestLesson: 0 }),
});

function readyBridge() {
  return createFakeBridge({
    documents: {
      app: JSON.stringify({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: PROFILE.id }),
      profiles: JSON.stringify({ version: 1, profiles: [PROFILE] }),
      [documentNames.activity(PROFILE.id, 'typing-course')]: JSON.stringify({
        version: 1,
        state: { furthestLesson: 2 },
      }),
    },
  });
}

function Lessons() {
  const status = useSessionStatus();
  const { state, loaded, update } = useActivityState('typing-course', lessons);
  return (
    <button type='button' onClick={() => update((current) => ({ furthestLesson: current.furthestLesson + 1 }))}>
      {`${status} ${String(loaded)} ${String(state.furthestLesson)}`}
    </button>
  );
}

function Status() {
  return useSessionStatus();
}

function Pictures() {
  usePictures();
  return null;
}

describe('useActivityState', () => {
  it('shows the defaults, then the saved state, and saves an update', async () => {
    const fake = readyBridge();
    const store = createSessionStore({ bridge: fake.bridge });
    await store.start();
    render(
      <SessionProvider store={store}>
        <Lessons />
      </SessionProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('ready false 0');
    const button = await screen.findByRole('button', { name: 'ready true 2' });
    act(() => button.click());
    expect(button.textContent).toBe('ready true 3');
    await store.flush();
    expect(JSON.parse(fake.documents.get(documentNames.activity(PROFILE.id, 'typing-course')) ?? '')).toEqual({
      version: 1,
      state: { furthestLesson: 3 },
    });
  });
});

describe('session hooks', () => {
  it('say which provider is missing', () => {
    expect(() => render(<Status />)).toThrow('Session hooks need a SessionProvider above them.');
  });

  it('refuse pictures with no active profile', async () => {
    const store = createSessionStore({ bridge: createFakeBridge().bridge });
    await store.start();
    expect(() =>
      render(
        <SessionProvider store={store}>
          <Pictures />
        </SessionProvider>,
      ),
    ).toThrow('usePictures needs an active profile.');
  });
});
