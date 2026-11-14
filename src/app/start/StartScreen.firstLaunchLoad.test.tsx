// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strings as firstLaunchStrings } from '../first-launch/strings.ts';
import { strings as shellStrings } from '../shell/strings.ts';
import { renderShell } from '../testing/shellHarness.tsx';

/**
 * The first launch screen's code fails to load once, as a chunk the disk could not read would.
 * A module factory that throws runs again on the next import, so the second load is the real one.
 */
const firstLaunchLoads = vi.hoisted(() => ({ failuresLeft: 1, tries: 0 }));

vi.mock('../first-launch/FirstLaunch.tsx', async (importOriginal) => {
  firstLaunchLoads.tries += 1;
  if (firstLaunchLoads.failuresLeft > 0) {
    firstLaunchLoads.failuresLeft -= 1;
    throw new Error('The first launch chunk did not load.');
  }
  return importOriginal();
});

afterEach(cleanup);

describe('first launch whose code did not load', () => {
  it('loads it again on try again and shows first launch', async () => {
    await renderShell('/');
    fireEvent.click(await screen.findByRole('button', { name: shellStrings.tryAgain.text }));
    await waitFor(() => expect(firstLaunchLoads.tries).toBe(2));
    await screen.findByRole('heading', { level: 1, name: firstLaunchStrings.animalHeading.text });
  });
});
