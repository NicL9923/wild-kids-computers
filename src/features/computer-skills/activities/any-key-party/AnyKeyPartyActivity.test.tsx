// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender } from '../../../../activityShell/testing/keys.ts';
import AnyKeyPartyActivity from './AnyKeyPartyActivity.tsx';
import { FULL_MEADOW_MS, generateLevel } from './level.ts';

afterEach(cleanup);

function show() {
  const level = generateLevel(7, 1, 'band-3-5');
  const fake = createFakeKit();
  const view = render(<AnyKeyPartyActivity level={level} band='band-3-5' kit={fake.kit} />);
  const stage = view.container.querySelector<HTMLElement>('.party-stage');
  if (stage === null) throw new Error('No party stage');
  return { level, fake, stage };
}

describe('any key party when keys come faster than the screen draws', () => {
  it('brings one friend for every key and fills the meadow once', () => {
    const { level, fake, stage } = show();
    const keys = Array.from('qwertyuiop').slice(0, level.friends.length + 2);
    pressBeforeRender(keys);
    expect(stage.dataset.arrived).toBe(String(level.friends.length));
    expect(stage.dataset.full).toBe('true');
    expect(fake.calls.filter((call) => call.call === 'play' && call.name === 'sparkle')).toHaveLength(1);
    fake.scheduler.advance(FULL_MEADOW_MS);
    expect(fake.calls.filter((call) => call.call === 'round-complete')).toHaveLength(1);
  });
});
