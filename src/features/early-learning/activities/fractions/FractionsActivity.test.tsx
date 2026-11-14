// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import FractionsActivity from './FractionsActivity.tsx';
import { generateLevel, type FractionLevel } from './level.ts';
import { fractionName } from './names.ts';
import { strings } from './strings.ts';

afterEach(cleanup);

const levels = Array.from({ length: 40 }, (_, seed) =>
  [4, 5, 8].map((difficulty) => generateLevel(seed, difficulty, 'band-9-12')),
).flat();
const withMode = (mode: FractionLevel['mode']) => levels.filter((level) => level.mode === mode);

function show(level: FractionLevel): void {
  render(<FractionsActivity level={level} band='band-9-12' kit={createFakeKit().kit} />);
}

describe('FractionsActivity for assistive technology', () => {
  it('describes each picture to choose from by its parts, not by the fraction asked for', () => {
    const pickPicture = withMode('pick-picture');
    expect(pickPicture.length).toBeGreaterThan(0);
    for (const level of pickPicture) {
      show(level);
      const asked = t(fractionName(level.target));
      const choices = within(screen.getByRole('group', { name: t(strings.pictures) })).getAllByRole('button');
      for (const choice of choices) {
        const name = choice.getAttribute('aria-label') ?? '';
        expect(name).not.toBe(asked);
        expect(name).toMatch(/cut into \d+ .*, \d+ shaded$/);
      }
      cleanup();
    }
  });

  it('describes the picture to read by its parts, never by a fraction the choices offer', () => {
    const pickFraction = withMode('pick-fraction');
    expect(pickFraction.length).toBeGreaterThan(0);
    for (const level of pickFraction) {
      show(level);
      const offered = level.fractions.map((fraction) => t(fractionName(fraction)));
      const name = document.querySelector('[data-picture-description]')?.textContent ?? '';
      expect(name).toMatch(/cut into \d+ .*, \d+ shaded$/);
      for (const fraction of offered) expect(name).not.toContain(fraction);
      cleanup();
    }
  });

  it('tells equal parts from parts that are not the same size', () => {
    const picture = {
      id: 'p',
      shape: 'bar',
      parts: [0.5, 0.5],
      shaded: [0],
      fraction: { numerator: 1, denominator: 2 },
    } as const;
    const unequal = { ...picture, id: 'q', parts: [0.7, 0.3], fraction: null };
    const [base] = withMode('pick-picture');
    if (base === undefined) throw new Error('Some seed gives a pick-picture round');
    const level: FractionLevel = { ...base, pictures: [picture, unequal] };
    show(level);
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining([
        'A bar cut into 2 equal parts, 1 shaded',
        'A bar cut into 2 parts that are not the same size, 1 shaded',
      ]),
    );
  });
});
