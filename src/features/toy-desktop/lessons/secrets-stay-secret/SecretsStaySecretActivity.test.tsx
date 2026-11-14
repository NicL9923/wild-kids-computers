// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKit, createTally } from '../../../../activityShell/kit.ts';
import { createToyClipboard, installInputGuards, type ToyClipboard } from '../../../../app/inputGuards.ts';
import { createManualScheduler } from '../../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../../core/activityKit/scope.ts';
import { generateLevel } from './level.ts';
import SecretsStaySecretActivity from './SecretsStaySecretActivity.tsx';

/** A real kit over silent audio. Audio and the shell are the kit's I/O edge. */
function silentKit() {
  return createKit<never>({
    scope: createScope(createManualScheduler({ wall: Date.UTC(2026, 10, 14) })),
    tally: createTally(),
    state: null,
    reducedMotion: false,
    pictures: {
      list: () => Promise.reject(new Error('This lesson lists no pictures')),
      read: () => Promise.reject(new Error('This lesson reads no pictures')),
    },
    onRoundComplete: () => undefined,
    onStepSolved: () => undefined,
    onCheckpoint: () => undefined,
    onHoldCheckpoint: () => () => undefined,
    host: {
      clock: { now: () => 0, monotonic: () => 0 },
      activityId: 'secrets-stay-secret',
      audio: {
        speak: () => Promise.resolve(),
        speakSequence: () => Promise.resolve(),
        cancelSpeech: () => undefined,
        play: () => undefined,
        startContinuous: () => ({ set: () => undefined, stop: () => undefined }),
      },
      onInstruction: () => undefined,
      onFeedback: () => undefined,
    },
  });
}

function built() {
  const level = generateLevel(31, 1, 'band-6-8');
  const view = render(<SecretsStaySecretActivity level={level} band='band-6-8' kit={silentKit()} />);
  for (const piece of view.container.querySelectorAll<HTMLElement>('[data-piece]')) fireEvent.click(piece);
  const output = view.container.querySelector<HTMLElement>('.sss-password');
  if (output === null) throw new Error('no password on screen');
  return { output };
}

function copy(target: Element, select: (range: Range) => void): void {
  const range = document.createRange();
  select(range);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  fireEvent(target, new Event('copy', { bubbles: true, cancelable: true }));
}

describe('the pretend password', () => {
  let clipboard: ToyClipboard;
  let uninstall: () => void;

  beforeEach(() => {
    clipboard = createToyClipboard();
    uninstall = installInputGuards(document, clipboard);
  });

  afterEach(() => {
    uninstall();
    cleanup();
  });

  it.each([
    ['the password alone', (output: HTMLElement) => (range: Range) => range.selectNodeContents(output)],
    ['everything, as Select all does', () => (range: Range) => range.selectNodeContents(document.body)],
  ])('never reaches the toy clipboard when the child copies %s', (_label, selection) => {
    const { output } = built();
    expect(output.textContent).not.toBe('');
    copy(output, selection(output));
    expect(clipboard.read()).toBeNull();
  });
});
