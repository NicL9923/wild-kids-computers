// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import { createFakeKit } from '../../../activityShell/testing/fakeKit.ts';
import AnyKeyPartyActivity from '../activities/any-key-party/AnyKeyPartyActivity.tsx';
import { generateLevel as anyKeyLevel } from '../activities/any-key-party/level.ts';
import SpaceAndEnterActivity from '../activities/space-and-enter/SpaceAndEnterActivity.tsx';
import { generateLevel as jumpLevel } from '../activities/space-and-enter/level.ts';

afterEach(cleanup);

/**
 * Keyboard activities that need Space or Enter. A shell button with focus keeps those keys, so
 * each activity needs a place in the tab order that gives them back.
 */
const ACTIVITIES: readonly [string, (kit: ActivityKit) => ReactElement][] = [
  ['space and enter', (kit) => <SpaceAndEnterActivity level={jumpLevel(1, 1, 'band-3-5')} band='band-3-5' kit={kit} />],
  ['any key party', (kit) => <AnyKeyPartyActivity level={anyKeyLevel(1, 1, 'band-3-5')} band='band-3-5' kit={kit} />],
];

describe.each(ACTIVITIES)('%s', (_name, activity) => {
  function setup() {
    const fake = createFakeKit();
    const view = render(
      <>
        <button type='button' data-control='replay'>
          replay
        </button>
        {activity(fake.kit)}
      </>,
    );
    const replay = view.getByText('replay');
    const area = view.container.querySelector<HTMLElement>('[data-key-area]');
    return { fake, replay, area };
  }

  it('starts with focus on a labelled play area in the tab order', () => {
    const { area } = setup();
    expect(area).not.toBeNull();
    expect(area?.tabIndex).toBe(0);
    expect(area?.getAttribute('aria-label')).toBeTruthy();
    expect(document.activeElement).toBe(area);
  });

  it('gets Space back once focus returns to the play area from a shell button', () => {
    const { fake, replay, area } = setup();
    const played = () => fake.calls.filter((call) => call.call === 'play').length;
    act(() => replay.focus());
    // The focused button keeps Space for itself, so the activity hears nothing.
    fireEvent.keyDown(replay, { key: ' ', code: 'Space' });
    expect(played()).toBe(0);
    // Tab reaches the play area, since it is in the tab order, and Space is the activity's again.
    if (area === null) throw new Error('No play area to come back to');
    act(() => area.focus());
    fireEvent.keyDown(area, { key: ' ', code: 'Space' });
    expect(played()).toBe(1);
  });
});
