// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { generateLevel, inChildHalf, isFilled } from './level.ts';
import MirrorSymmetryActivity from './MirrorSymmetryActivity.tsx';
import { strings } from './strings.ts';

afterEach(cleanup);

describe('MirrorSymmetryActivity for assistive technology', () => {
  it('names every painted square of the given half, so the picture to mirror can be heard', () => {
    for (const difficulty of [1, 4, 8]) {
      const level = generateLevel(7, difficulty, 'band-9-12');
      render(<MirrorSymmetryActivity level={level} band='band-9-12' kit={createFakeKit().kit} />);
      const grid = screen.getByRole('group', { name: t(strings.picture) });
      const heard = [...grid.querySelectorAll('.ms-cell[data-shown="true"]')].map((square) => square.textContent);
      const painted: string[] = [];
      for (let row = 0; row < level.size; row += 1) {
        for (let column = 0; column < level.size; column += 1) {
          const cell = { row, column };
          if (!inChildHalf(level, cell) && isFilled(level, cell)) {
            painted.push(`Row ${String(row + 1)} column ${String(column + 1)}, painted`);
          }
        }
      }
      expect(painted.length).toBeGreaterThan(0);
      expect(heard).toEqual(painted);
      cleanup();
    }
  });
});
