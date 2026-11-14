// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../../core/strings/defineStrings.ts';
import { ClockFace } from './ClockFace.tsx';
import { digital } from './level.ts';
import { strings } from './strings.ts';

afterEach(cleanup);

/** What a screen reader reads: the clock's text with the hidden picture left out. */
const heard = (container: HTMLElement) =>
  [...container.children]
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
    .map((element) => element.textContent)
    .join(' ');

/** The words a read round's answer is said with. A description that used them would give it away. */
const TIME_WORDS = [strings.oclock, strings.halfPast, strings.quarterPast, strings.quarterTo].map((handle) =>
  t(handle),
);

describe('ClockFace for assistive technology', () => {
  it.each([
    [{ hour: 3, minute: 0 }, 'Clock. The short hand is on 3. The long hand is on 12.'],
    [{ hour: 3, minute: 15 }, 'Clock. The short hand is between 3 and 4. The long hand is on 3.'],
    [{ hour: 12, minute: 40 }, 'Clock. The short hand is between 12 and 1. The long hand is on 8.'],
  ])('describes the clock at %j by where its hands are', (time, name) => {
    const { container } = render(<ClockFace time={time} />);
    expect(heard(container)).toBe(name);
  });

  it('never says the time the way the choices write or speak it', () => {
    for (let hour = 1; hour <= 12; hour += 1) {
      for (let minute = 0; minute < 60; minute += 5) {
        const { container, unmount } = render(<ClockFace time={{ hour, minute }} />);
        const name = heard(container);
        expect(name).not.toContain(digital({ hour, minute }));
        for (const word of TIME_WORDS) expect(name).not.toContain(word);
        unmount();
      }
    }
  });
});
