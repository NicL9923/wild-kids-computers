// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { strings as homeStrings } from '../home/strings.ts';
import { strings as gateStrings } from '../parent-gate/strings.ts';
import { strings as shellStrings } from '../shell/strings.ts';
import { renderShell, savedProfiles, wordGateAnswer } from '../testing/shellHarness.tsx';
import { strings } from './strings.ts';
import { MORE_TIME_MS } from './useSessionLimit.ts';

afterEach(cleanup);

const FOX = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;
const FIVE_MINUTES = 5 * 60_000;

async function atLimit() {
  const harness = await renderShell('/home', { documents: savedProfiles([FOX], FOX.id, { sessionLengthMinutes: 5 }) });
  await screen.findByRole('navigation', { name: homeStrings.title.text });
  harness.clock.mono += FIVE_MINUTES;
  return harness;
}

function passGate() {
  fireEvent.change(screen.getByLabelText(gateStrings.wordLabel.text), { target: { value: wordGateAnswer() } });
  fireEvent.click(screen.getByRole('button', { name: gateStrings.continue.text }));
}

describe('closing screen', () => {
  it('replaces the next screen once the limit is reached, speaks one calm sentence, and cannot be left', async () => {
    const harness = await atLimit();
    fireEvent.click(screen.getByRole('button', { name: homeStrings['place-paint-studio'].text }));
    await screen.findByRole('heading', { level: 1, name: strings.heading.text });
    expect(harness.router.state.location.pathname).toBe('/closing');
    expect(harness.spoken()).toContain(strings.heading.id);
    // Only the grown-ups' control: no way back for the child, and nothing that counts.
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      shellStrings.grownUps.text,
    ]);

    act(() => harness.router.history.back());
    await waitFor(() => expect(harness.router.state.location.pathname).toBe('/closing'));
  });

  it('gives a little more time behind the gate, then the limit comes back after it', async () => {
    const harness = await atLimit();
    await act(() => harness.router.navigate({ to: '/closing' }));
    fireEvent.click(await screen.findByRole('button', { name: shellStrings.grownUps.text }));
    await screen.findByRole('dialog', { name: gateStrings['title-closing'].text });
    passGate();
    fireEvent.click(await screen.findByRole('button', { name: strings.moreTime.text }));
    await screen.findByRole('navigation', { name: homeStrings.title.text });

    harness.clock.mono += MORE_TIME_MS - 1;
    fireEvent.click(screen.getByRole('button', { name: homeStrings['place-robot-painter'].text }));
    await waitFor(() => expect(harness.router.state.location.pathname).toBe('/area/robot-painter'));
    harness.clock.mono += 1;
    await act(() => harness.router.navigate({ to: '/home' }));
    await screen.findByRole('heading', { level: 1, name: strings.heading.text });
  });

  it('closes the app after saving when the grown-up chooses to', async () => {
    const harness = await atLimit();
    await act(() => harness.router.navigate({ to: '/closing' }));
    fireEvent.click(await screen.findByRole('button', { name: shellStrings.grownUps.text }));
    passGate();
    fireEvent.click(await screen.findByRole('button', { name: strings.closeApp.text }));
    await waitFor(() => expect(harness.windowCalls).toEqual(['quit']));
  });

  it('stays shut when the gate is cancelled', async () => {
    const harness = await atLimit();
    await act(() => harness.router.navigate({ to: '/closing' }));
    fireEvent.click(await screen.findByRole('button', { name: shellStrings.grownUps.text }));
    fireEvent.click(await screen.findByRole('button', { name: gateStrings.cancel.text }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: strings.moreTime.text })).toBeNull();
    expect(harness.router.state.location.pathname).toBe('/closing');
  });
});
