// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentNames } from '../../core/platform/names.ts';
import { verifyParentPin } from '../../core/storage/parentPin.ts';
import { strings as seedPodStrings } from '../../features/computer-skills/activities/pop-the-seed-pods/strings.ts';
import { appDocument, settingsDocument } from '../../core/storage/schemas.ts';
import { strings as gateStrings } from '../parent-gate/strings.ts';
import { strings as profileStrings } from '../profiles/strings.ts';
import { json, renderShell, savedProfiles, wordGateAnswer, type ShellHarness } from '../testing/shellHarness.tsx';
import { strings } from './strings.ts';

afterEach(cleanup);

const FOX = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;
const OWL = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-6-8', name: 'Ada' } as const;

async function openCorner(documents = savedProfiles([FOX, OWL], FOX.id)): Promise<ShellHarness> {
  const harness = await renderShell('/parent', { documents });
  await screen.findByRole('dialog', { name: gateStrings['title-parent-corner'].text });
  fireEvent.change(screen.getByLabelText(gateStrings.wordLabel.text), { target: { value: wordGateAnswer() } });
  fireEvent.click(screen.getByRole('button', { name: gateStrings.continue.text }));
  await screen.findByRole('heading', { level: 1, name: strings.title.text });
  return harness;
}

/** The row of one child in the list of children. */
function rowOf(profileId: string): HTMLElement {
  const row = within(screen.getByRole('region', { name: strings.children.text }))
    .getAllByRole('listitem')
    .find((item) => item.dataset.profile === profileId);
  if (row === undefined) throw new Error(`No row for ${profileId}.`);
  return row;
}

const saved = (harness: ShellHarness, name: Parameters<ShellHarness['fake']['documents']['get']>[0]): unknown =>
  JSON.parse(harness.fake.documents.get(name) ?? 'null');

describe('parent corner', () => {
  it('stays behind the gate and uses the adult look whatever the child band', async () => {
    await openCorner();
    expect(document.documentElement.getAttribute('data-band')).toBe('band-9-12');
  });

  it('saves a setting to the chosen child, and switching child shows that child', async () => {
    const harness = await openCorner();
    const session = screen.getByRole('group', { name: strings.sessionLength.text });
    fireEvent.click(within(session).getByRole('radio', { name: strings['session-30'].text }));
    await waitFor(() =>
      expect(settingsDocument.schema.parse(saved(harness, documentNames.settings(FOX.id))).sessionLengthMinutes).toBe(
        30,
      ),
    );

    fireEvent.click(screen.getByRole('radio', { name: OWL.name }));
    await waitFor(() => expect(harness.store.getSnapshot().activeProfile?.id).toBe(OWL.id));
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: strings.sessionLength.text })).getByRole('radio', {
          name: strings['session-off'].text,
        }),
      ).toHaveProperty('checked', true),
    );
  });

  it('previews the child text size and spacing on the preview alone', async () => {
    await openCorner();
    fireEvent.click(
      within(screen.getByRole('group', { name: strings.textSize.text })).getByRole('radio', {
        name: strings['text-size-larger'].text,
      }),
    );
    const preview = screen.getByText(strings.previewText.text);
    expect(preview.dataset).toMatchObject({ band: 'band-3-5', textSize: 'larger', letterSpacing: 'standard' });
    expect(document.documentElement.getAttribute('data-text-size')).toBeNull();
  });

  it('adds a child and edits a name away', async () => {
    const harness = await openCorner();
    fireEvent.click(screen.getByRole('button', { name: strings.addChild.text }));
    const dialog = await screen.findByRole('dialog', { name: strings.addTitle.text });
    // A new child starts with an animal and a color no other child has.
    expect(within(dialog).getByRole('radio', { name: profileStrings['avatar-rabbit'].text })).toHaveProperty(
      'checked',
      true,
    );
    fireEvent.change(within(dialog).getByLabelText(strings.nameLabel.text), { target: { value: 'Bo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: strings.save.text }));
    await waitFor(() =>
      expect(harness.store.getSnapshot().profiles.map((p) => p.name)).toEqual([undefined, 'Ada', 'Bo']),
    );

    const owlRow = rowOf(OWL.id);
    fireEvent.click(within(owlRow).getByRole('button', { name: strings.edit.text }));
    const edit = await screen.findByRole('dialog', { name: strings.editTitle.text });
    fireEvent.change(within(edit).getByLabelText(strings.nameLabel.text), { target: { value: '  ' } });
    fireEvent.click(within(edit).getByRole('button', { name: strings.save.text }));
    await waitFor(() => expect(harness.store.getSnapshot().profiles[1]).toEqual({ ...OWL, name: undefined }));
    expect('name' in (harness.store.getSnapshot().profiles[1] ?? {})).toBe(false);
  });

  it('keeps the new child dialog open and says so when the child could not be added, and adds them on try again', async () => {
    const harness = await openCorner();
    harness.fake.failNext('write', 'profiles', new Error('disk full'));
    fireEvent.click(screen.getByRole('button', { name: strings.addChild.text }));
    const dialog = await screen.findByRole('dialog', { name: strings.addTitle.text });
    fireEvent.change(within(dialog).getByLabelText(strings.nameLabel.text), { target: { value: 'Bo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: strings.save.text }));
    await within(dialog).findByText(strings.addProblem.text);
    expect(harness.store.getSnapshot().profiles.map((p) => p.id)).toEqual([FOX.id, OWL.id]);

    fireEvent.click(within(dialog).getByRole('button', { name: strings.save.text }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings.addTitle.text })).toBeNull());
    expect(harness.store.getSnapshot().profiles.map((p) => p.name)).toEqual([undefined, 'Ada', 'Bo']);
  });

  it('deletes a profile only after a confirmation that names what is lost, and keeps it on cancel', async () => {
    const harness = await openCorner();
    const row = rowOf(OWL.id);
    fireEvent.click(within(row).getByRole('button', { name: strings.delete.text }));
    const confirm = await screen.findByRole('alertdialog', { name: strings.deleteTitle.text });
    expect(within(confirm).getByText(strings.deleteWhat.text)).toBeTruthy();
    expect(within(confirm).getByText('Ada')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: strings.deleteKeep.text }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(harness.store.getSnapshot().profiles).toHaveLength(2);

    fireEvent.click(within(row).getByRole('button', { name: strings.delete.text }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings.deleteConfirm.text }),
    );
    await waitFor(() => expect(harness.store.getSnapshot().profiles.map((p) => p.id)).toEqual([FOX.id]));
    expect(harness.fake.calls).toContain(`documents.removeProfile ${OWL.id}`);
  });

  it('moves the settings to the next child after deleting the active one, and to first launch after the last', async () => {
    const harness = await openCorner();
    fireEvent.click(within(rowOf(FOX.id)).getByRole('button', { name: strings.delete.text }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings.deleteConfirm.text }),
    );
    await waitFor(() => expect(harness.store.getSnapshot().activeProfile?.id).toBe(OWL.id));
    expect(screen.getByRole('region', { name: strings.settings.text })).toBeTruthy();

    fireEvent.click(within(rowOf(OWL.id)).getByRole('button', { name: strings.delete.text }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings.deleteConfirm.text }),
    );
    await waitFor(() => expect(harness.router.state.location.pathname).toBe('/'));
  }, 15_000);

  it('says so and keeps the profile when the deletion fails', async () => {
    const harness = await openCorner();
    harness.fake.failNext('write', 'profiles', new Error('disk full'));
    const row = rowOf(OWL.id);
    fireEvent.click(within(row).getByRole('button', { name: strings.delete.text }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings.deleteConfirm.text }),
    );
    await screen.findByText(strings.deleteProblem.text);
    expect(harness.store.getSnapshot().profiles).toHaveLength(2);
  });

  it('sets a PIN that is saved only as a hash, after rejecting a short one and a mismatch', async () => {
    const harness = await openCorner();
    fireEvent.click(screen.getByRole('button', { name: strings.setPin.text }));
    const dialog = await screen.findByRole('dialog', { name: strings.setPin.text });
    const pin = within(dialog).getByLabelText(strings.newPin.text);
    const repeat = within(dialog).getByLabelText(strings.repeatPin.text);
    const save = within(dialog).getByRole('button', { name: strings.savePin.text });

    fireEvent.change(pin, { target: { value: '12' } });
    fireEvent.click(save);
    expect(await within(dialog).findByText(strings.pinInvalid.text)).toBeTruthy();
    fireEvent.change(pin, { target: { value: '1234' } });
    fireEvent.change(repeat, { target: { value: '1243' } });
    fireEvent.click(save);
    expect(await within(dialog).findByText(strings.pinMismatch.text)).toBeTruthy();
    fireEvent.change(repeat, { target: { value: '1234' } });
    fireEvent.click(save);

    await screen.findByText(strings.pinOn.text, {}, { timeout: 10_000 });
    const text = harness.fake.documents.get('app') ?? '';
    expect(text).not.toContain('1234');
    const record = appDocument.schema.parse(JSON.parse(text)).parentPin;
    if (record === null) throw new Error('No PIN saved.');
    expect(await verifyParentPin('1234', record)).toBe(true);
  }, 20_000);

  it('turns kiosk lock on through the window', async () => {
    const harness = await openCorner();
    fireEvent.click(screen.getByRole('switch', { name: strings.kiosk.text }));
    await waitFor(() => expect(harness.windowCalls).toContain('kiosk true'));
    expect(appDocument.schema.parse(saved(harness, 'app')).kioskLock).toBe(true);
  });

  it(
    'lists what a child practiced by area with first and last days, and nothing for a child who has not',
    {
      timeout: 20_000,
    },
    async () => {
      const progress = {
        version: 1,
        activities: { 'pop-the-seed-pods': { recentRounds: [], daysPracticed: ['2026-11-02', '2026-11-13'] } },
      };
      await openCorner({ ...savedProfiles([FOX, OWL], FOX.id), [documentNames.progress(FOX.id)]: json(progress) });
      const skills = screen.getByRole('region', { name: strings.skills.text });
      // The skill is named by the activity's goal sentence, never by its id.
      // The goals of all activities load lazily, which can take more than a second on a busy machine.
      expect(await within(skills).findByText(seedPodStrings.goal.text, {}, { timeout: 10_000 })).toBeTruthy();
      expect(within(skills).queryByText('pop-the-seed-pods')).toBeNull();
      expect(within(skills).getByText(strings.firstPracticed.text)).toBeTruthy();
      expect(within(skills).queryByText(/%|\bscore\b|\blevel\b/i)).toBeNull();

      fireEvent.click(screen.getByRole('radio', { name: OWL.name }));
      await within(skills).findByText(strings.skillsEmpty.text);
    },
  );

  it('toggles mute and automatically unmutes when testing voice or effects', async () => {
    const harness = await openCorner();
    const mute = screen.getByRole('switch', { name: strings.muteSound.text });
    fireEvent.click(mute);
    await waitFor(() => expect(harness.store.getSnapshot().settings.muted).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: strings.playVoice.text }));
    await waitFor(() => expect(harness.store.getSnapshot().settings.muted).toBe(false));
    expect(harness.spoken()).toContain(strings.voiceSample.id);
  });

  it('recovers when hashing a new PIN fails instead of staying stuck on saving', async () => {
    await openCorner();
    const spy = vi
      .spyOn(globalThis.crypto.subtle, 'deriveBits')
      .mockRejectedValueOnce(new DOMException('failed', 'OperationError'));
    try {
      fireEvent.click(screen.getByRole('button', { name: strings.setPin.text }));
      const dialog = await screen.findByRole('dialog', { name: strings.setPin.text });
      fireEvent.change(within(dialog).getByLabelText(strings.newPin.text), { target: { value: '1234' } });
      fireEvent.change(within(dialog).getByLabelText(strings.repeatPin.text), { target: { value: '1234' } });
      fireEvent.click(within(dialog).getByRole('button', { name: strings.savePin.text }));
      await within(dialog).findByText(strings.pinSaveProblem.text);
      expect(within(dialog).getByRole('button', { name: strings.savePin.text })).toHaveProperty('disabled', false);
      expect(within(dialog).getByRole('button', { name: strings.cancel.text })).toHaveProperty('disabled', false);
    } finally {
      spy.mockRestore();
    }
  });

  it('shows saved pictures and lets the grown-up export or print directly', async () => {
    const exported: string[] = [];
    const printed: string[] = [];
    const harness = await openCorner();
    await harness.fake.bridge.pictures.save(FOX.id, {
      png: new Uint8Array([1, 2, 3]),
      thumbnail: new Uint8Array([4, 5, 6]),
    });
    harness.fake.bridge.output.exportPicture = async (_png, stem) => {
      exported.push(stem);
      return 'saved';
    };
    harness.fake.bridge.output.printPicture = async () => {
      printed.push('printed');
      return 'printed';
    };

    // Switch to OWL and back to FOX so PicturesSection reloads after saving.
    fireEvent.click(screen.getByRole('radio', { name: OWL.name }));
    await waitFor(() => expect(harness.store.getSnapshot().activeProfile?.id).toBe(OWL.id));
    fireEvent.click(screen.getByRole('radio', { name: profileStrings['avatar-fox'].text }));
    await waitFor(() => expect(harness.store.getSnapshot().activeProfile?.id).toBe(FOX.id));

    const picturesSection = screen.getByRole('region', { name: strings.childPictures.text });
    const saveBtn = await within(picturesSection).findByRole('button', {
      name: new RegExp(`^${strings.savePicture.text}:`),
    });
    fireEvent.click(saveBtn);
    await within(picturesSection).findByText(strings.pictureSaved.text);
    expect(exported).toHaveLength(1);

    const printBtn = within(picturesSection).getByRole('button', {
      name: new RegExp(`^${strings.printPicture.text}:`),
    });
    fireEvent.click(printBtn);
    await within(picturesSection).findByText(strings.picturePrinted.text);
    expect(printed).toHaveLength(1);
  });
});

const notices = () => within(screen.getByRole('region', { name: strings.notices.text }));

describe('licenses and credits', () => {
  it('loads the notices the build ships only when the adult asks, and shows them', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: URL) => {
      requested.push(url.pathname);
      return new Response('react 19.3.1 (MIT)\nPermission is hereby granted');
    });
    await openCorner();
    expect(requested).toEqual([]);
    fireEvent.click(notices().getByRole('button', { name: strings.showNotices.text }));
    await notices().findByText(/Permission is hereby granted/);
    expect(requested).toEqual(['/third-party-notices.txt']);
  });

  it.each([
    ['a missing file', async () => new Response('', { status: 404 })],
    ['a failed read', async () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('says so when the notices cannot be loaded: %s', async (_label, answer) => {
    vi.stubGlobal('fetch', answer);
    await openCorner();
    fireEvent.click(notices().getByRole('button', { name: strings.showNotices.text }));
    await waitFor(() => expect(notices().getByRole('alert').textContent).toBe(strings.noticesProblem.text));
    expect(notices().getByRole('button', { name: strings.showNotices.text })).toHaveProperty('disabled', false);
  });
});
