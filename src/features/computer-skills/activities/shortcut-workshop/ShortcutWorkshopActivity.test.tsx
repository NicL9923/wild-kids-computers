// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import ShortcutWorkshopActivity from './ShortcutWorkshopActivity.tsx';
import { STEP_DONE_PAUSE_MS, STEPS } from './steps.ts';
import { strings } from './strings.ts';

afterEach(cleanup);

/** Select all, which finishes the first step in one key press. */
const finishStep = () => fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a', ctrlKey: true });
const startAgain = () => fireEvent.click(screen.getByRole('button', { name: t(strings.startOver) }));

/** The first step asks for select all. */
function setup() {
  const fake = createFakeKit();
  const [step] = STEPS;
  if (step === undefined) throw new Error('The workshop has steps');
  render(<ShortcutWorkshopActivity level={step} band='band-9-12' kit={fake.kit} />);
  const completions = () => fake.calls.filter((call) => call.call === 'round-complete').length;
  return { fake, completions };
}

describe('ShortcutWorkshopActivity', () => {
  it('finishes the step a short pause after the shortcut works', () => {
    const { fake, completions } = setup();
    finishStep();
    act(() => fake.scheduler.advance(STEP_DONE_PAUSE_MS));
    expect(completions()).toBe(1);
  });

  it('lets a step started again finish only by its own shortcut, not the last attempt pause', () => {
    const { fake, completions } = setup();
    finishStep();
    startAgain();
    act(() => fake.scheduler.advance(STEP_DONE_PAUSE_MS * 2));
    expect(completions()).toBe(0);
    expect(document.querySelector('.sw-stage')?.getAttribute('data-done')).toBe('false');
    finishStep();
    act(() => fake.scheduler.advance(STEP_DONE_PAUSE_MS));
    expect(completions()).toBe(1);
  });
});
