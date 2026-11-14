// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import { generateLevel, type LineLevel } from './level.ts';
import NumberLineActivity from './NumberLineActivity.tsx';

afterEach(cleanup);

function placeNames(level: LineLevel): string[] {
  render(<NumberLineActivity level={level} band='band-9-12' kit={createFakeKit().kit} />);
  // Only the places to click are buttons in a place round; the number to place is a button too.
  return screen
    .getAllByRole('button')
    .filter((button) => button.dataset.mark !== undefined)
    .map((button) => button.getAttribute('aria-label') ?? '');
}

describe('NumberLineActivity for assistive technology', () => {
  it('names each place by counting marks from a written number, never by its own number', () => {
    for (const difficulty of [4, 5, 8, 9]) {
      for (let seed = 0; seed < 20; seed += 1) {
        const level = generateLevel(seed, difficulty, 'band-9-12');
        const names = placeNames(level);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
          expect(name).toMatch(/^\d+ marks? (after|before) \d+$/);
          expect(name).not.toBe(t(numberHandle(level.answer)));
        }
        cleanup();
      }
    }
  });

  it('counts from the written number on the left, or on the right when the place comes first', () => {
    const marks = [0, 1, 2, 3, 4].map((index) => ({ index, value: index * 5 + 50, labeled: index === 2 }));
    const level: LineLevel = { mode: 'place', step: 5, marks, target: 0, answer: 50, choices: [] };
    expect(placeNames(level)).toEqual(['2 marks before 60', '1 mark before 60', '1 mark after 60', '2 marks after 60']);
  });
});
