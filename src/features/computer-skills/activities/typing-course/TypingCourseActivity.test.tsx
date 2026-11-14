// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender, type KeyPress } from '../../../../activityShell/testing/keys.ts';
import { codeFor, fingerFor, LESSONS, LINE_DONE_PAUSE_MS } from './lessons.ts';
import { generateLevel } from './level.ts';
import { FINGER_NAMES } from './speech.ts';
import { strings } from './strings.ts';
import TypingCourseActivity from './TypingCourseActivity.tsx';

afterEach(cleanup);

/** The lesson that teaches Shift, so its line has capitals, spaces, and full stops. */
const SHIFT_LESSON = LESSONS.findIndex((lesson) => lesson.id === 'shift');

function show() {
  const level = generateLevel(1, SHIFT_LESSON, 'band-9-12');
  const fake = createFakeKit();
  const view = render(<TypingCourseActivity level={level} band='band-9-12' kit={fake.kit} />);
  const stage = view.container.querySelector<HTMLElement>('.tc-stage');
  if (stage === null) throw new Error('No typing course stage');
  const calls = (kind: 'correct' | 'hint' | 'round-complete') => fake.calls.filter((call) => call.call === kind);
  return { level, fake, stage, calls };
}

/** The press a typist makes for one character, with Shift held for a capital. */
const pressFor = (char: string): KeyPress => ({
  key: char,
  code: codeFor(char),
  shiftKey: char !== char.toLowerCase(),
});

describe('the typing course when keys come faster than the screen draws', () => {
  it('types every character of a fast, correct line once, with no hint, and finishes once', () => {
    const { level, fake, stage, calls } = show();
    const chars = Array.from(level.line);
    // A trailing extra key lands after the line is whole.
    pressBeforeRender([...chars, 'x'].map(pressFor));
    expect(stage.dataset.typed).toBe(String(chars.length));
    expect(stage.dataset.done).toBe('true');
    expect(calls('hint')).toEqual([]);
    expect(calls('correct')).toEqual([{ call: 'correct', say: strings.lineDone.id }]);
    act(() => fake.scheduler.advance(LINE_DONE_PAUSE_MS));
    expect(calls('round-complete')).toHaveLength(1);
  });

  it('says to hold Shift on the first small letter and names the finger on the second', () => {
    const { level, stage, calls } = show();
    const capital = level.line[0];
    if (capital === undefined || capital === capital.toLowerCase()) throw new Error('The line starts with a capital');
    pressBeforeRender([pressFor(capital.toLowerCase()), pressFor(capital.toLowerCase())]);
    expect(stage.dataset.typed).toBe('0');
    expect(calls('hint')).toEqual([
      { call: 'hint', say: strings.holdShift.id },
      { call: 'hint', say: FINGER_NAMES[fingerFor(capital)].id },
    ]);
  });
});
