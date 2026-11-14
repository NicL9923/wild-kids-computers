// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { strings as homeStrings } from '../home/strings.ts';
import { strings as choiceStrings } from '../profile-choice/strings.ts';
import { strings as profileStrings } from '../profiles/strings.ts';
import { strings as shellStrings } from '../shell/strings.ts';
import { renderShell, savedProfiles } from '../testing/shellHarness.tsx';

afterEach(cleanup);

const FOX = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-9-12' } as const;
const OWL = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-6-8', name: 'Ada' } as const;
const html = document.documentElement;

describe('start screen', () => {
  it('asks who is playing when several children share the computer, in the youngest band', async () => {
    const harness = await renderShell('/', { documents: savedProfiles([FOX, OWL], FOX.id) });
    await screen.findByRole('heading', { level: 1, name: choiceStrings.heading.text });
    // The last child's band is not assumed: the person at the computer may be three.
    expect(html.getAttribute('data-band')).toBe('band-3-5');
    expect(harness.spoken()).toContain(choiceStrings.heading.id);

    const owl = screen.getByRole('button', { name: new RegExp(`${profileStrings['avatar-owl'].text}.*Ada`) });
    fireEvent.focus(owl);
    expect(harness.spoken().at(-1)).toBe(profileStrings['avatar-owl'].id);
    fireEvent.click(owl);
    await screen.findByRole('navigation', { name: homeStrings.title.text });
    expect(harness.store.getSnapshot().activeProfile?.id).toBe(OWL.id);
    expect(html.getAttribute('data-band')).toBe('band-6-8');
  });

  it('goes straight to the home map with one profile, even when none was active', async () => {
    const harness = await renderShell('/', { documents: savedProfiles([FOX], null) });
    await screen.findByRole('navigation', { name: homeStrings.title.text });
    expect(harness.store.getSnapshot().activeProfile?.id).toBe(FOX.id);
    expect(screen.queryByRole('button', { name: homeStrings.changePlayer.text })).toBeNull();
  });

  it('gets a child from the home map back to the profile choice in one click', async () => {
    const harness = await renderShell('/home', { documents: savedProfiles([FOX, OWL], FOX.id) });
    fireEvent.click(await screen.findByRole('button', { name: homeStrings.changePlayer.text }));
    await screen.findByRole('heading', { level: 1, name: choiceStrings.heading.text });
    expect(harness.router.state.location.pathname).toBe('/');
  });
});

describe('home map', () => {
  it('names each place out loud once when the keyboard reaches it, and goes where the place leads', async () => {
    const harness = await renderShell('/home', { documents: savedProfiles([FOX], FOX.id) });
    await screen.findByRole('navigation', { name: homeStrings.title.text });
    const robot = screen.getByRole('button', { name: homeStrings['place-robot-painter'].text });
    fireEvent.focus(robot);
    fireEvent.pointerOver(robot);
    expect(harness.spoken().filter((id) => id === homeStrings['place-robot-painter'].id)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: homeStrings['place-paint-studio'].text }));
    await waitFor(() => expect(harness.router.state.location.pathname).toBe('/paint'));
  });

  it('saves the mute control on the child profile', async () => {
    const harness = await renderShell('/home', { documents: savedProfiles([FOX], FOX.id) });
    const mute = await screen.findByRole('button', { name: shellStrings.mute.text });
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(harness.store.getSnapshot().settings.muted).toBe(true);
  });
});
