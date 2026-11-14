import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import { reduceAll, type DesktopAction } from '../../model/desktop.ts';
import { MIN_WINDOW_SIZE, type Rect } from '../../model/geometry.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import activity from './activity.ts';
import { EDGE, fitsOutline, GAP, generateLevel, isInPlace, START_SIZE, type MoveResizeLevel } from './level.ts';
import { moveResizeSteps } from './steps.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const env = () => ({ clipboard: createToyClipboard() });

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('move-and-resize is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

function inDesktop(rect: Rect): boolean {
  return (
    rect.x >= EDGE &&
    rect.y >= EDGE &&
    rect.x + rect.width <= LESSON_DESKTOP_SIZE.width - EDGE &&
    rect.y + rect.height <= LESSON_DESKTOP_SIZE.height - EDGE
  );
}

/** The moves a child makes: title bar to the box's corner, then the corner to the outline's size. */
function solve(level: MoveResizeLevel): DesktopAction[] {
  return [
    { type: 'move-window', windowId: 'w1', x: level.place.x, y: level.place.y },
    { type: 'resize-window', windowId: 'w1', width: level.outline.width, height: level.outline.height },
  ];
}

/** True when two rectangles come closer than the gap the level keeps between them. */
function crowds(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width + GAP && b.x < a.x + a.width + GAP && a.y < b.y + b.height + GAP && b.y < a.y + a.height + GAP
  );
}

/** What makes a round fair: both boxes in view, a real move and a real resize, and room to fit. */
function problems(level: MoveResizeLevel): string[] {
  const found: string[] = [];
  const { start, place, outline, tolerance } = level;
  for (const [name, rect] of [
    ['start', start],
    ['place', place],
    ['outline', outline],
  ] as const) {
    if (!inDesktop(rect)) found.push(`${name} leaves the desktop`);
  }
  if (crowds(place, start) || crowds(outline, start)) found.push('a box touches the window at its start');
  if (place.width !== START_SIZE.width || place.height !== START_SIZE.height) found.push('the place is another size');
  if (outline.x !== place.x || outline.y !== place.y) found.push('the outline starts somewhere else');
  if (outline.width < MIN_WINDOW_SIZE.width || outline.height < MIN_WINDOW_SIZE.height) found.push('outline too small');
  // The window starting in place, or already the outline's size, would finish a step untouched.
  if (isInPlace(level.desktop, place, tolerance)) found.push('the window starts in the box');
  const widthOff = Math.abs(outline.width - START_SIZE.width);
  const heightOff = Math.abs(outline.height - START_SIZE.height);
  if (Math.max(widthOff, heightOff) <= tolerance) found.push('the outline is the size the window already is');
  const window = level.desktop.windows[0];
  if (level.desktop.windows.length !== 1 || window === undefined) return [...found, 'not exactly one window'];
  if (window.rect.x !== start.x || window.rect.y !== start.y) found.push('the window is not at its start');
  return found;
}

describe.each(['band-6-8', 'band-9-12'] as const)('move and resize for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const { state } = reduceAll(level.desktop, solve(level), env());
      expect(fitsOutline(state, level.outline, level.tolerance), `seed ${seed}`).toBe(true);
    }
  });
});

describe('move and resize difficulty', () => {
  it('asks for a closer fit one step at a time, never closer than half an arrow key step', () => {
    // 52 units is generous for a 6-year-old; 16 still lets the keyboard's 24 px steps land inside.
    const tolerances = Array.from({ length: 10 }, (_, index) => generateLevel(1, index + 1, 'band-9-12').tolerance);
    expect(tolerances).toEqual([52, 48, 44, 40, 36, 32, 28, 24, 20, 16]);
  });

  it('changes only the width up to difficulty 3, then both sides, by more as it rises', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
        const { outline } = generateLevel(seed, difficulty, 'band-9-12');
        const amount = 80 + difficulty * 8;
        const width = Math.max(MIN_WINDOW_SIZE.width, START_SIZE.width - amount);
        expect([width, START_SIZE.width + amount]).toContain(outline.width);
        const tall = Math.round(amount * 0.6);
        const heights = difficulty <= 3 ? [START_SIZE.height] : [START_SIZE.height - tall, START_SIZE.height + tall];
        expect(heights).toContain(outline.height);
      }
    }
  });

  it('starts the window on the left in some rounds and on the right in others', () => {
    const sides = new Set(SEEDS.map((seed) => Math.sign(generateLevel(seed, 1, 'band-6-8').place.x - 512)));
    expect([...sides].toSorted((a, b) => a - b)).toEqual([-1, 1]);
  });

  it('grows and shrinks across seeds', () => {
    const widths = new Set(SEEDS.map((seed) => Math.sign(generateLevel(seed, 6, 'band-6-8').outline.width - 360)));
    expect([...widths].toSorted((a, b) => a - b)).toEqual([-1, 1]);
  });
});

describe('move and resize steps', () => {
  const level = generateLevel(SEEDS[3] ?? 1, 4, 'band-6-8');
  const [move, resize] = moveResizeSteps(level);
  if (move === undefined || resize === undefined) throw new Error('two steps');

  it('counts the move only inside the tolerance, on both sides', () => {
    const at = (dx: number, dy: number) =>
      reduceAll(
        level.desktop,
        [{ type: 'move-window', windowId: 'w1', x: level.place.x + dx, y: level.place.y + dy }],
        env(),
      );
    const edge = level.tolerance;
    expect(move.done(at(edge, -edge).state, [])).toBe(true);
    expect(move.done(at(edge + 1, 0).state, [])).toBe(false);
    expect(move.done(at(0, -edge - 1).state, [])).toBe(false);
  });

  it('does not count a resize alone, or a maximized window over the box', () => {
    const resized = reduceAll(
      level.desktop,
      [{ type: 'resize-window', windowId: 'w1', width: level.outline.width, height: level.outline.height }],
      env(),
    );
    expect(move.done(resized.state, resized.events)).toBe(false);
    expect(resize.done(resized.state, resized.events)).toBe(false);
    const maximized = reduceAll(
      level.desktop,
      [
        { type: 'move-window', windowId: 'w1', x: level.place.x, y: level.place.y },
        { type: 'maximize-window', windowId: 'w1' },
      ],
      env(),
    );
    expect(move.done(maximized.state, [])).toBe(false);
  });

  it('needs the size within the tolerance on both sides, and the window still in place', () => {
    const fitAt = (dw: number, dh: number, dx = 0) =>
      reduceAll(
        level.desktop,
        [
          { type: 'move-window', windowId: 'w1', x: level.place.x + dx, y: level.place.y },
          { type: 'resize-window', windowId: 'w1', width: level.outline.width + dw, height: level.outline.height + dh },
        ],
        env(),
      ).state;
    const edge = level.tolerance;
    expect(resize.done(fitAt(edge, -edge), [])).toBe(true);
    expect(resize.done(fitAt(edge + 1, 0), [])).toBe(false);
    expect(resize.done(fitAt(0, edge + 1), [])).toBe(false);
    expect(resize.done(fitAt(0, 0, edge + 1), [])).toBe(false);
  });

  it('treats a move or resize that misses as a try, and anything else as nothing', () => {
    const missed = reduceAll(level.desktop, [{ type: 'move-window', windowId: 'w1', x: 40, y: 40 }], env());
    expect(move.wrong?.(missed, { type: 'move-window', windowId: 'w1', x: 40, y: 40 })).toBe(true);
    const focused = reduceAll(level.desktop, [{ type: 'focus-window', windowId: 'w1' }], env());
    expect(move.wrong?.(focused, { type: 'focus-window', windowId: 'w1' })).toBe(false);
    expect(resize.wrong?.(focused, { type: 'focus-window', windowId: 'w1' })).toBe(false);
    expect(move.hint?.(level.desktop)).toEqual({ kind: 'title-bar', windowId: 'w1' });
    expect(resize.hint?.(level.desktop)).toEqual({ kind: 'resize', windowId: 'w1' });
  });
});
