import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, configure, render } from '@testing-library/react';
import { createAudioEngine, type AudioEngine } from '../../audio/audioEngine.ts';
import { AudioProvider } from '../../audio/AudioProvider.tsx';
import { CONTINUOUS } from '../../audio/sfx/continuous.ts';
import { ONE_SHOTS } from '../../audio/sfx/oneShots.ts';
import type { PlatformBridge } from '../../core/platform/bridge.ts';
import { documentNames, type DocumentName } from '../../core/platform/names.ts';
import { appDocument, settingsDocument, type Profile, type Settings } from '../../core/storage/schemas.ts';
import { createAppRouter } from '../router.ts';
import { SessionProvider } from '../session/SessionProvider.tsx';
import { createSessionStore, type SessionStore } from '../session/sessionStore.ts';
import { createFakeBridge, type FakeBridge, type FakeBridgeOptions } from '../session/testing/fakeBridge.ts';
import { ShellPlatformProvider } from '../shell/shellPlatform.tsx';

/**
 * Renders the whole app on a memory history over the fake bridge, the way main.tsx does over the
 * real one. Audio has no device, so nothing plays, and its test log records every string spoken
 * and every sound played. The clock is pinned and moves only when a test moves it.
 */
export interface ShellHarness {
  fake: FakeBridge;
  store: SessionStore;
  audio: AudioEngine;
  router: ReturnType<typeof createAppRouter>;
  clock: { wall: number; mono: number };
  /** The ids of the strings spoken so far. */
  spoken: () => string[];
  /** Calls the close request listener the shell registered, as the main process would. */
  requestClose: () => void;
  /** Window calls in order: acknowledge, quit, kiosk. */
  windowCalls: string[];
}

export const json = (value: unknown): string => JSON.stringify(value);

// Lazy screens such as the parent corner load a chunk that Vitest transforms on first use, which
// can pass the 1 second default while the whole suite runs with coverage.
configure({ asyncUtilTimeout: 5_000 });

/** Saved documents for profiles that exist, first launch done, and `active` chosen last time. */
export function savedProfiles(
  profiles: readonly Profile[],
  active: string | null,
  settings: Partial<Settings> = {},
  app: Partial<ReturnType<typeof appDocument.defaults>> = {},
): Partial<Record<DocumentName, string>> {
  const documents: Partial<Record<DocumentName, string>> = {
    app: json({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: active, ...app }),
    profiles: json({ version: 1, profiles }),
  };
  for (const profile of profiles) {
    documents[documentNames.settings(profile.id)] = json({ ...settingsDocument.defaults(), ...settings });
  }
  return documents;
}

export async function renderShell(path: string, options: FakeBridgeOptions = {}): Promise<ShellHarness> {
  const windowCalls: string[] = [];
  let closeListener: (() => void) | null = null;
  const window: Partial<PlatformBridge['window']> = {
    onCloseRequest: (listener) => {
      closeListener = listener;
      return () => {
        if (closeListener === listener) closeListener = null;
      };
    },
    acknowledgeCloseRequest: async () => {
      windowCalls.push('acknowledge');
    },
    quit: async () => {
      windowCalls.push('quit');
    },
    setKioskLock: async (on) => {
      windowCalls.push(`kiosk ${String(on)}`);
      return { fullscreen: on, kioskLock: on };
    },
    ...options.window,
  };
  const fake = createFakeBridge({ ...options, window });
  const audio = createAudioEngine({
    environment: {
      createContext: () => null,
      clipUrl: () => undefined,
      fetchClip: () => Promise.reject(new Error('No clips in unit tests.')),
      now: () => 0,
    },
    sfx: { oneShots: ONE_SHOTS, continuous: CONTINUOUS },
    testLog: true,
  });
  const clock = { wall: new Date(2026, 10, 14, 9, 0).getTime(), mono: 1_000 };
  const store = createSessionStore({
    bridge: fake.bridge,
    audio,
    clock: { now: () => clock.wall, monotonic: () => clock.mono },
  });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(
    <SessionProvider store={store}>
      <AudioProvider engine={audio}>
        <ShellPlatformProvider platform={fake.bridge}>
          <RouterProvider router={router} />
        </ShellPlatformProvider>
      </AudioProvider>
    </SessionProvider>,
  );
  await act(() => store.start());
  return {
    fake,
    store,
    audio,
    router,
    clock,
    windowCalls,
    spoken: () => (audio.testLog ?? []).filter((entry) => entry.kind === 'voice').map((entry) => entry.name),
    requestClose: () => {
      if (closeListener === null) throw new Error('The shell registered no close request listener.');
      closeListener();
    },
  };
}

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** The digits the word gate on screen asks for, read the way an adult reads them. */
export function wordGateAnswer(): string {
  const words = document.querySelector('[data-testid="gate-words"]')?.textContent?.trim().split(/\s+/) ?? [];
  return words.map((word) => String(DIGIT_WORDS.indexOf(word))).join('');
}
