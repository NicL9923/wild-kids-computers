import { describe, expect, it } from 'vitest';
import { generateLevel, STAND_GAP, START_X, type JumpLevel } from './level.ts';
import {
  advance,
  heightOf,
  isNear,
  JUMP_MS,
  landX,
  OPEN_MS,
  press,
  standX,
  startWalk,
  type WalkState,
} from './walk.ts';

/** A level with a log, a gate, and home. */
function level(walk: JumpLevel['walk']): JumpLevel {
  return {
    critter: 'rabbit',
    walk,
    speed: 100,
    stops: [
      { id: 'stop-0', kind: 'jump', thing: 'log', x: 300 },
      { id: 'stop-1', kind: 'gate', thing: null, x: 600 },
      { id: 'stop-2', kind: 'home', thing: null, x: 900 },
    ],
  };
}

function run(state: WalkState, path: JumpLevel, ms: number): WalkState {
  let current = state;
  for (let time = 0; time < ms; time += 16) current = advance(current, path, 16, false);
  return current;
}

describe('the walk', () => {
  it('walks at its speed and waits before a log for as long as it takes', () => {
    const path = level('waits');
    const after = advance(startWalk(START_X), path, 1000, false);
    expect(after).toMatchObject({ x: START_X + 100, phase: 'walking' });
    const waiting = run(after, path, 10_000);
    expect(waiting).toMatchObject({ x: 300 - STAND_GAP, phase: 'waiting', stop: 0 });
    expect(advance(waiting, path, 60_000, false)).toBe(waiting);
  });

  it('jumps the log on Space, in an arc, and lands past it', () => {
    const path = level('waits');
    const waiting = run(startWalk(START_X), path, 10_000);
    const { state, result } = press(waiting, path, 'space');
    expect(result).toBe('go');
    const middle = advance(state, path, JUMP_MS / 2, false);
    expect(heightOf(middle)).toBeGreaterThan(100);
    expect(middle.x).toBeCloseTo((standX({ id: '', kind: 'jump', thing: 'log', x: 300 }) + 300 + STAND_GAP) / 2);
    const landed = advance(middle, path, JUMP_MS / 2, false);
    expect(landed).toMatchObject({ x: 300 + STAND_GAP, stop: 1, phase: 'walking' });
    expect(heightOf(landed)).toBe(0);
  });

  it.each([
    ['Enter at a log', 'jump', 'enter', 'wrong'],
    ['Space at a gate', 'gate', 'space', 'wrong'],
  ] as const)('answers %s with which key to use, and stays put', (_label, at, key, result) => {
    const path = level('waits');
    let state = run(startWalk(START_X), path, 10_000);
    if (at === 'gate') state = run(press(state, path, 'space').state, path, 10_000);
    const answer = press(state, path, key);
    expect(answer.result).toBe(result);
    expect(answer.state).toBe(state);
  });

  it('hops harmlessly on Space while walking, and ignores Enter there', () => {
    const path = level('waits');
    const walking = startWalk(START_X);
    expect(press(walking, path, 'space')).toEqual({ state: walking, result: 'hop' });
    expect(press(walking, path, 'enter')).toEqual({ state: walking, result: 'none' });
  });

  it('opens the gate on Enter, walks through, and goes in at home', () => {
    const path = level('waits');
    let state = run(startWalk(START_X), path, 10_000);
    state = run(press(state, path, 'space').state, path, 10_000);
    expect(state).toMatchObject({ stop: 1, phase: 'waiting' });
    const opening = press(state, path, 'enter');
    expect(opening.state.phase).toBe('opening');
    expect(advance(opening.state, path, OPEN_MS - 1, false).phase).toBe('opening');
    state = run(advance(opening.state, path, OPEN_MS, false), path, 10_000);
    expect(state).toMatchObject({ stop: 2, phase: 'waiting', x: 900 - STAND_GAP });
    const done = advance(press(state, path, 'enter').state, path, OPEN_MS, false);
    expect(done.phase).toBe('home');
    expect(press(done, path, 'enter').result).toBe('none');
  });

  it('takes a press early while it keeps walking, only inside the window', () => {
    const path = level('keeps-walking');
    // From the very start of the path, the first stop is well past the window.
    const far = startWalk(0);
    expect(isNear(far, path)).toBe(false);
    expect(press(far, path, 'space').result).toBe('hop');
    // 150 units before the place to wait, the window opens.
    const close = { ...far, x: standX({ id: '', kind: 'jump', thing: 'log', x: 300 }) - 150 };
    expect(isNear(close, path)).toBe(true);
    expect(isNear({ ...close, x: close.x - 1 }, path)).toBe(false);
    expect(press(close, path, 'space').result).toBe('go');
    // Enter in the window is not wrong while it is still walking: it just does nothing.
    expect(press(close, path, 'enter').result).toBe('none');
  });

  it('never takes a press early when it waits', () => {
    const path = level('waits');
    const close = { ...startWalk(START_X), x: 300 - STAND_GAP - 1 };
    expect(isNear(close, path)).toBe(false);
    expect(press(close, path, 'space').result).toBe('hop');
  });

  it('finishes every move at once under reduced motion', () => {
    const path = level('waits');
    const waiting = advance(startWalk(START_X), path, 0, true);
    expect(waiting).toMatchObject({ phase: 'waiting', x: 300 - STAND_GAP });
    const landed = advance(press(waiting, path, 'space').state, path, 0, true);
    expect(landed).toMatchObject({ phase: 'walking', x: landX({ id: '', kind: 'jump', thing: 'log', x: 300 }) });
  });

  it('reaches home on a generated path by pressing the right key at each stop', () => {
    const path = generateLevel(77, 8, 'band-6-8');
    let state = startWalk(START_X);
    for (const stop of path.stops) {
      state = run(state, path, 20_000);
      state = press(state, path, stop.kind === 'jump' ? 'space' : 'enter').state;
    }
    expect(run(state, path, 2000).phase).toBe('home');
  });
});
