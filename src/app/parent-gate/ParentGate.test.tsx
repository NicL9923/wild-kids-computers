// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { hashParentPin } from '../../core/storage/parentPin.ts';
import { strings as parentCornerStrings } from '../parent-corner/strings.ts';
import { renderShell, savedProfiles, wordGateAnswer } from '../testing/shellHarness.tsx';
import { strings } from './strings.ts';

afterEach(cleanup);

const FOX = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;

const gate = () => screen.findByRole('dialog', { name: strings['title-parent-corner'].text });
const answerField = (label: string) => screen.getByLabelText(label);
const submit = () => fireEvent.click(screen.getByRole('button', { name: strings.continue.text }));

function type(label: string, text: string) {
  fireEvent.change(answerField(label), { target: { value: text } });
}

describe('word gate', () => {
  it('refuses a wrong answer with a neutral message and a short wait, then opens on the right one', async () => {
    const { spoken } = await renderShell('/parent', { documents: savedProfiles([FOX], FOX.id) });
    await gate();
    const answer = wordGateAnswer();
    expect(answer).toMatch(/^\d{3}$/);

    type(strings.wordLabel.text, answer === '000' ? '111' : '000');
    submit();
    await screen.findByText(strings.waiting.text, { selector: 'p' });
    // The message is announced, the field is marked, and the answer is cleared for a new try.
    expect(screen.getByRole('status').textContent).toBe(strings.waiting.text);
    expect(answerField(strings.wordLabel.text).getAttribute('aria-invalid')).toBe('true');
    expect(answerField(strings.wordLabel.text)).toHaveProperty('value', '');
    expect(screen.getByRole('button', { name: strings.continue.text })).toHaveProperty('disabled', true);

    // The same digits stay through a wrong answer, so a typo does not cost a new puzzle.
    expect(wordGateAnswer()).toBe(answer);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(strings.noMatch.text), { timeout: 2_000 });
    type(strings.wordLabel.text, answer.split('').join(' '));
    submit();
    await screen.findByRole('heading', { level: 1, name: parentCornerStrings.title.text });
    // The app never speaks anything while the gate is open, so a child never hears the answer.
    expect(spoken().filter((id) => id.startsWith('parent-gate.'))).toEqual([]);
  });

  it('asks new digits each time it opens', async () => {
    const { router } = await renderShell('/parent', { documents: savedProfiles([FOX], FOX.id) });
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      await gate();
      seen.add(wordGateAnswer());
      fireEvent.click(screen.getByRole('button', { name: strings.cancel.text }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
      await act(() => router.navigate({ to: '/parent' }));
    }
    expect(seen.size).toBe(4);
  });

  it('goes back to the meadow when the adult cancels', async () => {
    const { router } = await renderShell('/parent', { documents: savedProfiles([FOX], FOX.id) });
    await gate();
    fireEvent.keyDown(answerField(strings.wordLabel.text), { key: 'Escape' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(screen.queryByRole('heading', { name: parentCornerStrings.title.text })).toBeNull();
  });
});

describe('PIN gate', () => {
  it('asks for the PIN instead of words, refuses a wrong one, and opens on the right one', async () => {
    // The lowest iteration count the schema accepts keeps the test quick.
    const parentPin = await hashParentPin('2468', 100_000);
    await renderShell('/parent', { documents: savedProfiles([FOX], FOX.id, {}, { parentPin }) });
    await gate();
    expect(screen.queryByTestId('gate-words')).toBeNull();
    expect(answerField(strings.pinLabel.text).getAttribute('type')).toBe('password');

    type(strings.pinLabel.text, '1357');
    submit();
    await screen.findByText(strings.waiting.text, { selector: 'p' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(strings.noMatch.text), { timeout: 2_000 });
    type(strings.pinLabel.text, '2468');
    submit();
    await screen.findByRole('heading', { level: 1, name: parentCornerStrings.title.text }, { timeout: 5_000 });
  });

  it('tells an adult who forgot the PIN how to remove it', async () => {
    const parentPin = await hashParentPin('2468', 100_000);
    await renderShell('/parent', { documents: savedProfiles([FOX], FOX.id, {}, { parentPin }) });
    await gate();
    fireEvent.click(screen.getByText(strings.forgotPin.text));
    expect(screen.getByText(strings.forgotPinSteps.text)).toBeTruthy();
  });
});

describe('kiosk close request', () => {
  it('shows the gate, stays open on cancel, and quits after saving when the gate passes', async () => {
    const { requestClose, windowCalls } = await renderShell('/home', { documents: savedProfiles([FOX], FOX.id) });
    await screen.findByRole('navigation');

    act(() => requestClose());
    await screen.findByRole('dialog', { name: strings['title-quit'].text });
    expect(windowCalls).toEqual(['acknowledge']);
    fireEvent.click(screen.getByRole('button', { name: strings.cancel.text }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(windowCalls).toEqual(['acknowledge']);

    act(() => requestClose());
    await screen.findByRole('dialog', { name: strings['title-quit'].text });
    type(strings.wordLabel.text, wordGateAnswer());
    submit();
    await waitFor(() => expect(windowCalls).toEqual(['acknowledge', 'acknowledge', 'quit']));
  });
});
