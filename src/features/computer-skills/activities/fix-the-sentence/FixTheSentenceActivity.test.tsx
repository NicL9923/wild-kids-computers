// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { pressBeforeRender } from '../../../../activityShell/testing/keys.ts';
import FixTheSentenceActivity from './FixTheSentenceActivity.tsx';
import { generateLevel } from './level.ts';

afterEach(cleanup);

describe('fix the sentence when keys come faster than the screen draws', () => {
  it('counts both changes that take the text further away, and helps after the second', () => {
    const level = generateLevel(3, 1, 'band-6-8');
    const fake = createFakeKit();
    render(<FixTheSentenceActivity level={level} band='band-6-8' kit={fake.kit} />);
    // The field has focus from the start. Two stray letters each move the text further away.
    pressBeforeRender(['q', 'q']);
    expect(fake.calls.filter((call) => call.call === 'wrong')).toHaveLength(2);
    expect(fake.calls.filter((call) => call.call === 'hint')).toHaveLength(1);
  });
});
