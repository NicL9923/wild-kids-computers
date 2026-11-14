// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { strings as galleryStrings } from './gallery/strings.ts';
import { strings as homeStrings } from './home/strings.ts';
import { strings as shellStrings } from './shell/strings.ts';
import { renderShell, savedProfiles } from './testing/shellHarness.tsx';

afterEach(cleanup);

const html = document.documentElement;

describe('app router', () => {
  it('applies the active profile band, text size, and motion setting to the whole page', async () => {
    const profile = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-9-12' } as const;
    await renderShell('/home', {
      documents: savedProfiles([profile], profile.id, { textSize: 'larger', reducedMotion: 'on' }),
    });
    await screen.findByRole('navigation', { name: homeStrings.title.text });
    expect(html.getAttribute('data-band')).toBe('band-9-12');
    expect(html.getAttribute('data-text-size')).toBe('larger');
    expect(html.getAttribute('data-motion')).toBe('reduce');
  });

  it('opens the component gallery, a route found by file convention, with its search parameters', async () => {
    await renderShell('/dev/gallery?band=band-6-8&view=all');
    // The gallery is a lazy chunk, which can take a while to transform while the whole suite runs.
    await screen.findByRole('heading', { level: 1, name: galleryStrings.title.text }, { timeout: 10_000 });
    expect(html.getAttribute('data-band')).toBe('band-6-8');
  });

  it('shows a calm screen with one way back for a place that does not exist', async () => {
    const profile = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;
    const { router, spoken } = await renderShell('/no-such-place', { documents: savedProfiles([profile], profile.id) });
    await screen.findByRole('heading', { level: 1, name: shellStrings.notFound.text });
    expect(spoken()).toContain(shellStrings.notFound.id);
    screen.getByRole('button', { name: shellStrings.backToMeadow.text }).click();
    await screen.findByRole('navigation', { name: homeStrings.title.text });
    expect(router.state.location.pathname).toBe('/home');
  });
});
