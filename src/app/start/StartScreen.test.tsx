// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { strings as homeStrings } from '../home/strings.ts';
import { strings as choiceStrings } from '../profile-choice/strings.ts';
import { strings as profileStrings } from '../profiles/strings.ts';
import { strings as activityShellStrings } from '../../activityShell/strings.ts';
import { BridgeError } from '../../core/platform/bridge.ts';
import { strings as shellStrings } from '../shell/strings.ts';
import { strings as startStrings } from './strings.ts';
import { renderShell, savedProfiles, wordGateAnswer } from '../testing/shellHarness.tsx';
import { documentNames, type DocumentName } from '../../core/platform/names.ts';
import type { FakeBridge } from '../session/testing/fakeBridge.ts';
import { strings as gateStrings } from '../parent-gate/strings.ts';
import { strings as cornerStrings } from '../parent-corner/strings.ts';

afterEach(cleanup);

const FOX = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-9-12' } as const;
const OWL = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-6-8', name: 'Ada' } as const;
const html = document.documentElement;

/**
 * Makes every read of one document fail, as a file the app has no permission to read does.
 * Returns the number of reads refused so far.
 */
function refuseReads(fake: FakeBridge, name: DocumentName): () => number {
  const read = fake.bridge.documents.read.bind(fake.bridge.documents);
  let refused = 0;
  fake.bridge.documents.read = (asked) => {
    if (asked !== name) return read(asked);
    refused += 1;
    return Promise.reject(new BridgeError('io', 'permission denied'));
  };
  return () => refused;
}

function profileButtons(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button[data-profile]')];
}

/** The elements Tab visits, in order. jsdom does not move focus on Tab, so this is the browser's rule. */
function tabOrder(): HTMLElement[] {
  const focusable = document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]');
  return [...focusable].filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.closest('[inert]') === null,
  );
}

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

  it('says calmly, in the youngest band, that the saved things did not open, and opens them on try again', async () => {
    const harness = await renderShell('/', {
      documents: savedProfiles([FOX, OWL], FOX.id),
      beforeStart: (fake) => fake.failNext('read', 'profiles', new BridgeError('io', 'disk asleep')),
    });
    await screen.findByRole('heading', { level: 1, name: startStrings.unavailable.text });
    expect(harness.spoken()).toContain(startStrings.unavailable.id);
    expect(html.getAttribute('data-band')).toBe('band-3-5');
    expect(screen.getByRole('button', { name: activityShellStrings.soundOff.text })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: shellStrings.tryAgain.text }));
    await screen.findByRole('heading', { level: 1, name: choiceStrings.heading.text });
    expect(harness.store.getSnapshot().profiles).toEqual([FOX, OWL]);
  });

  it.each([
    ['beside a healthy one', [FOX, OWL]],
    ['as the only one', [FOX]],
  ] as const)(
    'lets the family on and leads a grown-up to the parent corner when a profile cannot be opened, %s',
    async (_case, profiles) => {
      const harness = await renderShell('/', {
        documents: savedProfiles(profiles, FOX.id),
        beforeStart: (fake) => {
          refuseReads(fake, documentNames.settings(FOX.id));
        },
      });
      await screen.findByRole('heading', { level: 1, name: choiceStrings.heading.text });
      expect(screen.getByText(startStrings.unavailable.text)).toBeDefined();
      expect(harness.spoken()).toContain(startStrings.unavailable.id);
      expect(harness.store.getSnapshot()).toMatchObject({ status: 'needs-profile', profileNotOpened: FOX.id });
      expect(profileButtons()).toHaveLength(profiles.length);

      // The keyboard reaches the grown-ups control after the children, and it opens the parent gate.
      const order = tabOrder();
      const grownUps = screen.getByRole('button', { name: shellStrings.grownUps.text });
      expect(order.indexOf(grownUps)).toBeGreaterThan(Math.max(...profileButtons().map((b) => order.indexOf(b))));
      grownUps.focus();
      fireEvent.click(grownUps);
      await screen.findByRole('dialog', { name: gateStrings['title-parent-corner'].text });
      fireEvent.change(screen.getByLabelText(gateStrings.wordLabel.text), { target: { value: wordGateAnswer() } });
      fireEvent.click(screen.getByRole('button', { name: gateStrings.continue.text }));
      await screen.findByRole('heading', { level: 1, name: cornerStrings.title.text });
    },
  );

  it('opens the healthy child and tries the other one again when chosen', async () => {
    const refused = { count: (): number => 0 };
    const harness = await renderShell('/', {
      documents: savedProfiles([FOX, OWL], FOX.id),
      beforeStart: (fake) => {
        refused.count = refuseReads(fake, documentNames.settings(FOX.id));
      },
    });
    await screen.findByText(startStrings.unavailable.text);
    expect(refused.count()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(profileStrings['avatar-fox'].text) }));
    await waitFor(() => expect(refused.count()).toBe(2));
    await screen.findByText(startStrings.unavailable.text);
    expect(harness.store.getSnapshot()).toMatchObject({ status: 'needs-profile', activeProfile: null });

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${profileStrings['avatar-owl'].text}.*Ada`) }));
    await screen.findByRole('navigation', { name: homeStrings.title.text });
    expect(harness.store.getSnapshot()).toMatchObject({ activeProfile: OWL, profileNotOpened: null });
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
