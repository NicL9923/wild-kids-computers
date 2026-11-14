// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import BigAndSmallActivity from './BigAndSmallActivity.tsx';
import { generateLevel, MAX_DIFFICULTY } from './level.ts';
import { strings } from './strings.ts';

afterEach(cleanup);

/** The size number in a picture's name, such as 30 in "teddy bear, size 30". */
const sizeIn = (name: string) => Number(/size (\d+)$/.exec(name)?.[1] ?? Number.NaN);

describe('BigAndSmallActivity for assistive technology', () => {
  it('gives each picture a size a screen reader can compare, larger for the larger picture', () => {
    for (let difficulty = 1; difficulty <= MAX_DIFFICULTY; difficulty += 1) {
      for (let seed = 0; seed < 10; seed += 1) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        render(<BigAndSmallActivity level={level} band='band-6-8' kit={createFakeKit().kit} />);
        const row = screen.getByRole('list', { name: t(strings.pictures) });
        const sizes = within(row)
          .getAllByRole('button')
          .map((button) => sizeIn(button.getAttribute('aria-label') ?? ''));
        // Same order of sizes as the pictures on screen, and no two alike.
        const real = level.items.map((item) => item.size);
        expect(
          sizes.map(
            (size, index) =>
              sizes.filter((other) => other < size).length ===
              real.filter((other) => other < (real[index] ?? 0)).length,
          ),
        ).not.toContain(false);
        expect(new Set(sizes).size).toBe(sizes.length);
        cleanup();
      }
    }
  });
});
