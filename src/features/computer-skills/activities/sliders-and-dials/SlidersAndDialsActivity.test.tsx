// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender } from '../../../../activityShell/testing/keys.ts';
import { generateLevel, MAX_DIAL_DIFFICULTY, type DialsLevel } from './level.ts';
import SlidersAndDialsActivity from './SlidersAndDialsActivity.tsx';

afterEach(cleanup);

/** One control at least three stops from its flag, so two keys do not reach it yet. */
function farLevel(): DialsLevel {
  for (let difficulty = 1; difficulty <= MAX_DIAL_DIFFICULTY; difficulty++) {
    for (let seed = 1; seed < 500; seed++) {
      const far = generateLevel(seed, difficulty, 'band-6-8').controls.find(
        (control) => Math.abs(control.target - control.start) >= 3,
      );
      if (far !== undefined) return { controls: [far] };
    }
  }
  throw new Error('No seed gives a control three stops from its flag');
}

const LEVEL = farLevel();

describe('sliders and dials when keys come faster than the screen draws', () => {
  it('moves the knob one stop for every arrow key', () => {
    const control = LEVEL.controls[0];
    if (control === undefined) throw new Error('The level has a control');
    const fake = createFakeKit();
    const view = render(<SlidersAndDialsActivity level={LEVEL} band='band-6-8' kit={fake.kit} />);
    const knob = view.container.querySelector<HTMLElement>(`[data-control="${control.id}"] button`);
    knob?.focus();
    const toward = control.target > control.start ? 'ArrowRight' : 'ArrowLeft';
    pressBeforeRender([toward, toward]);
    const step = control.target > control.start ? 2 : -2;
    expect(view.container.querySelector<HTMLElement>(`[data-control="${control.id}"]`)?.dataset.value).toBe(
      String(control.start + step),
    );
  });
});
