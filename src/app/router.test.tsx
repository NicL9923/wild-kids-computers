// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { documentNames } from '../core/platform/names.ts';
import { appDocument, settingsDocument } from '../core/storage/schemas.ts';
import { strings as galleryStrings } from './gallery/strings.ts';
import { strings as homeStrings } from './home/strings.ts';
import { createAppRouter } from './router.ts';
import { SessionProvider } from './session/SessionProvider.tsx';
import { createSessionStore, type SessionStore } from './session/sessionStore.ts';
import { createFakeBridge, type FakeBridgeOptions } from './session/testing/fakeBridge.ts';

afterEach(cleanup);

const html = document.documentElement;

async function renderApp(path: string, options: FakeBridgeOptions = {}): Promise<SessionStore> {
  const store = createSessionStore({ bridge: createFakeBridge(options).bridge });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(
    <SessionProvider store={store}>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  await act(() => store.start());
  return store;
}

describe('app router', () => {
  it('shows the home screen in the youngest band before any profile exists', async () => {
    await renderApp('/');
    await screen.findByRole('heading', { level: 1, name: homeStrings.title.text });
    expect(html.getAttribute('data-band')).toBe('band-3-5');
  });

  it('applies the active profile band, text size, and motion setting to the whole page', async () => {
    const profile = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-9-12' } as const;
    await renderApp('/', {
      documents: {
        app: JSON.stringify({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: profile.id }),
        profiles: JSON.stringify({ version: 1, profiles: [profile] }),
        [documentNames.settings(profile.id)]: JSON.stringify({
          ...settingsDocument.defaults(),
          textSize: 'larger',
          reducedMotion: 'on',
        }),
      },
    });
    await screen.findByRole('heading', { level: 1, name: homeStrings.title.text });
    expect(html.getAttribute('data-band')).toBe('band-9-12');
    expect(html.getAttribute('data-text-size')).toBe('larger');
    expect(html.getAttribute('data-motion')).toBe('reduce');
  });

  it('opens the component gallery, a route found by file convention, with its search parameters', async () => {
    await renderApp('/dev/gallery?band=band-6-8&view=all');
    // The gallery is a lazy chunk, which can take a while to transform while the whole suite runs.
    await screen.findByRole('heading', { level: 1, name: galleryStrings.title.text }, { timeout: 10_000 });
    expect(html.getAttribute('data-band')).toBe('band-6-8');
  });
});
