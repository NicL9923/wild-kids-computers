// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { appDocument, profilesDocument } from '../../core/storage/schemas.ts';
import { strings as homeStrings } from '../home/strings.ts';
import { strings as profileStrings } from '../profiles/strings.ts';
import { json, renderShell } from '../testing/shellHarness.tsx';
import { strings } from './strings.ts';

afterEach(cleanup);

const next = () => fireEvent.click(screen.getByRole('button', { name: strings.next.text }));
const heading = (text: string) => screen.findByRole('heading', { level: 1, name: text });

function savedJson(harness: Awaited<ReturnType<typeof renderShell>>, name: 'app' | 'profiles'): unknown {
  return JSON.parse(harness.fake.documents.get(name) ?? 'null');
}

describe('first launch', () => {
  it('walks a new install from an animal to the home map, speaking each step, and saves the choices', async () => {
    const harness = await renderShell('/');
    await heading(strings.animalHeading.text);

    // Next before a choice explains what is missing, out loud, instead of a silent disabled button.
    next();
    expect(screen.getByText(strings.pickAnimalFirst.text)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: profileStrings['avatar-owl'].text }));
    next();

    await heading(strings.colorHeading.text);
    fireEvent.click(screen.getByRole('radio', { name: profileStrings['color-fern'].text }));
    fireEvent.change(screen.getByLabelText(strings.nameLabel.text), { target: { value: '  Ada ' } });
    next();

    await heading(strings.bandHeading.text);
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(profileStrings['band-band-6-8'].text) }));
    next();

    await heading(strings.soundHeading.text);
    fireEvent.click(screen.getByRole('button', { name: strings.playSound.text }));
    fireEvent.click(screen.getByRole('button', { name: strings.heardNo.text }));
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain(strings.volumeHint.text);
    // One way forward, which works whether or not the computer made a sound. The replay control
    // has a picture and no text.
    const labelled = screen.getAllByRole('button').flatMap((button) => button.textContent || []);
    expect(labelled).toEqual([strings.playSound.text, strings.heardNo.text, strings.back.text, strings.next.text]);
    next();

    await heading(strings.kioskHeading.text);
    fireEvent.click(screen.getByRole('switch', { name: strings.kioskLabel.text }));
    fireEvent.click(screen.getByRole('button', { name: strings.finish.text }));

    await screen.findByRole('navigation', { name: homeStrings.title.text });
    expect(harness.router.state.location.pathname).toBe('/home');
    const saved = profilesDocument.schema.parse(savedJson(harness, 'profiles'));
    expect(saved.profiles).toEqual([
      { id: expect.any(String), avatarId: 'owl', colorId: 'fern', band: 'band-6-8', name: 'Ada' },
    ]);
    const app = appDocument.schema.parse(savedJson(harness, 'app'));
    expect(app).toMatchObject({ firstLaunchDone: true, kioskLock: true, lastActiveProfileId: saved.profiles[0]?.id });
    expect(harness.windowCalls).toContain('kiosk true');

    const spoken = harness.spoken();
    for (const step of [
      strings.animalHeading,
      strings.colorHeading,
      strings.bandHeading,
      strings.soundHeading,
      strings.kioskHeading,
    ]) {
      expect(spoken).toContain(step.id);
    }
    expect(spoken).toEqual(
      expect.arrayContaining([profileStrings['avatar-owl'].id, strings.testSentence.id, strings.pickAnimalFirst.id]),
    );
  });

  it('changes the saved profile instead of adding another when the adult goes back after the band', async () => {
    const harness = await renderShell('/');
    await heading(strings.animalHeading.text);
    fireEvent.click(screen.getByRole('radio', { name: profileStrings['avatar-fox'].text }));
    next();
    fireEvent.click(await screen.findByRole('radio', { name: profileStrings['color-sky'].text }));
    next();
    fireEvent.click(await screen.findByRole('radio', { name: new RegExp(profileStrings['band-band-3-5'].text) }));
    next();
    await heading(strings.soundHeading.text);
    fireEvent.click(screen.getByRole('button', { name: strings.back.text }));
    fireEvent.click(await screen.findByRole('radio', { name: new RegExp(profileStrings['band-band-9-12'].text) }));
    next();
    await heading(strings.soundHeading.text);
    await waitFor(() => {
      const saved = profilesDocument.schema.parse(savedJson(harness, 'profiles'));
      expect(saved.profiles.map((profile) => profile.band)).toEqual(['band-9-12']);
    });
  });

  it('resumes at the sound check with the saved profile when the app closed midway', async () => {
    const fox = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;
    const harness = await renderShell('/', {
      documents: { app: json(appDocument.defaults()), profiles: json({ version: 1, profiles: [fox] }) },
    });
    await heading(strings.soundHeading.text);
    expect(screen.queryByRole('button', { name: strings.back.text })).toBeNull();
    next();
    await heading(strings.kioskHeading.text);
    fireEvent.click(screen.getByRole('button', { name: strings.finish.text }));
    await screen.findByRole('navigation', { name: homeStrings.title.text });
    expect(profilesDocument.schema.parse(savedJson(harness, 'profiles')).profiles).toEqual([fox]);
    expect(harness.windowCalls).not.toContain('kiosk true');
  });
});
