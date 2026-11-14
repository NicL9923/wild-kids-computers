// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from './Avatar.tsx';
import { AVATAR_IDS } from './avatars.ts';
import { CalmPanel } from './CalmPanel.tsx';
import { HomeMap, type HomeMapPlace } from './HomeMap.tsx';
import { HOME_PLACE_IDS, HOME_PLACES, type HomePlaceId } from './homePlaces.ts';
import { INTERFACE_ICON_NAMES } from './interfaceIcons.ts';
import { PROFILE_COLOR_IDS, PROFILE_COLORS } from './profileColors.ts';
import { ProfileColorMark } from './ProfileColorMark.tsx';
import { Screen } from './Screen.tsx';

afterEach(cleanup);

const placesWith = (onSelect: (id: HomePlaceId) => void): Record<HomePlaceId, HomeMapPlace> => {
  const place = (id: HomePlaceId): HomeMapPlace => ({ label: `Go to ${id}`, onSelect: () => onSelect(id) });
  return {
    'paint-studio': place('paint-studio'),
    'early-learning': place('early-learning'),
    'toy-desktop': place('toy-desktop'),
    'computer-skills': place('computer-skills'),
    'robot-painter': place('robot-painter'),
  };
};

const artFiles = (folder: string) =>
  readdirSync(path.resolve(import.meta.dirname, '../../../assets/art', folder))
    .filter((name) => name.endsWith('.svg'))
    .map((name) => name.replace(/\.svg$/, ''))
    .toSorted();

describe('Screen', () => {
  it('keeps the exit, instruction, and end slots in their places even when some are empty', () => {
    render(
      <Screen end={<button type='button'>Sound</button>}>
        <p>game</p>
      </Screen>,
    );
    const slots = [...document.querySelectorAll('header [data-slot]')].map((slot) => slot.getAttribute('data-slot'));
    expect(slots).toEqual(['exit', 'instruction', 'end']);
    const end = document.querySelector('[data-slot="end"]');
    expect(end?.contains(screen.getByRole('button', { name: 'Sound' }))).toBe(true);
    expect(screen.getByRole('main').textContent).toBe('game');
  });
});

describe('HomeMap', () => {
  it('gives every area a named button that opens that area', () => {
    const onSelect = vi.fn<(id: HomePlaceId) => void>();
    render(<HomeMap label='The meadow' places={placesWith(onSelect)} />);
    const map = screen.getByRole('navigation', { name: 'The meadow' });
    const buttons = within(map).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(HOME_PLACE_IDS.map((id) => `Go to ${id}`));
    fireEvent.click(within(map).getByRole('button', { name: 'Go to robot-painter' }));
    expect(onSelect).toHaveBeenCalledWith('robot-painter');
  });

  it('keeps every place inside the layout area, so no window shape cuts one off', () => {
    const width = 0.2125; // .wk-home-place width as a fraction of the layout area
    for (const { left, top } of Object.values(HOME_PLACES)) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + width).toBeLessThanOrEqual(1);
      expect(top).toBeGreaterThanOrEqual(0.15); // below the top bar's controls
      // A place is square plus its label; the layout area is 16:10, so its height is width * 1.6.
      expect(top + width * 1.6 + 0.04).toBeLessThanOrEqual(1);
    }
  });
});

describe('CalmPanel', () => {
  it('shows a heading and its actions, and no other text', () => {
    render(
      <CalmPanel
        picture='finish'
        heading='All done.'
        actions={
          <>
            <button type='button'>Play again</button>
            <button type='button'>Go back</button>
          </>
        }
      />,
    );
    screen.getByRole('heading', { level: 1, name: 'All done.' });
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Play again', 'Go back']);
    expect(screen.getByRole('main').textContent).toBe('All done.Play againGo back');
  });
});

describe('Avatar', () => {
  it('names the animal when given a label', () => {
    render(<Avatar avatarId='owl' label='Owl' />);
    expect(screen.getByRole('img', { name: 'Owl' }).closest('[data-avatar]')?.getAttribute('data-avatar')).toBe('owl');
  });

  it('shows the first avatar for an id this build does not know, instead of a broken picture', () => {
    const { container } = render(<Avatar avatarId='dragon' />);
    expect(container.querySelector('[data-avatar]')?.getAttribute('data-avatar')).toBe('fox');
  });
});

describe('ProfileColorMark', () => {
  it('is named when labelled and hidden from screen readers when not', () => {
    const { rerender, container } = render(<ProfileColorMark colorId='lake' label='Lake' />);
    expect(screen.getByRole('img', { name: 'Lake' }).getAttribute('data-shape')).toBe('square');
    rerender(<ProfileColorMark colorId='lake' />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the first color for an id this build does not know', () => {
    const { container } = render(<ProfileColorMark colorId='plaid' />);
    expect(container.querySelector('svg')?.getAttribute('data-color')).toBe('sun');
  });
});

describe('art sets', () => {
  it('gives each profile color its own shape, so no two colors depend on color alone', () => {
    const shapes = PROFILE_COLOR_IDS.map((id) => PROFILE_COLORS[id]);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it.each([
    { folder: 'avatars', ids: AVATAR_IDS },
    { folder: 'interface', ids: INTERFACE_ICON_NAMES },
    { folder: 'home', ids: [...HOME_PLACE_IDS, 'meadow'] },
  ])('uses every file in assets/art/$folder, so no art sits unused or missing', ({ folder, ids }) => {
    expect(artFiles(folder)).toEqual([...ids].toSorted());
  });
});
