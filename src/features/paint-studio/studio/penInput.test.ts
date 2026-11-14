import { describe, expect, it } from 'vitest';
import {
  CLICK_SLOP,
  PEN_UP,
  isPenDown,
  penDown,
  penKey,
  penLift,
  penMove,
  penUp,
  type PenAction,
  type PenBehavior,
  type PenState,
  type PointerKind,
  type ScreenPoint,
} from './penInput.ts';

type Step =
  | { down: ScreenPoint }
  | { move: ScreenPoint }
  | { up: ScreenPoint; pointer?: PointerKind; behavior?: PenBehavior }
  | { lift: true }
  | { key: ScreenPoint; behavior?: PenBehavior };

/** A readable name for each action. An action of no known kind shows up as such, so the test fails. */
function name(action: PenAction): string {
  switch (action.kind) {
    case 'begin':
      return `begin ${action.at.x},${action.at.y}`;
    case 'move':
      return `move ${action.to.x},${action.to.y}`;
    case 'end':
      return 'end';
    default:
      return `unknown ${JSON.stringify(action)}`;
  }
}

/** Runs a script of pointer events and returns every action in order and the last state. */
function run(steps: readonly Step[]): { actions: string[]; state: PenState } {
  let state = PEN_UP;
  const actions: string[] = [];
  for (const step of steps) {
    const result =
      'down' in step
        ? penDown(state, step.down)
        : 'move' in step
          ? penMove(state, step.move)
          : 'up' in step
            ? penUp(state, step.up, step.pointer ?? 'mouse', step.behavior ?? 'stroke')
            : 'key' in step
              ? penKey(state, step.key, step.behavior ?? 'stroke')
              : penLift(state);
    state = result.state;
    actions.push(...result.actions.map(name));
  }
  return { actions, state };
}

describe('sticky pen', () => {
  it('puts the pen down on a click, paints while moving, and lifts on the next click', () => {
    const { actions, state } = run([
      { down: { x: 10, y: 10 } },
      { up: { x: 10, y: 10 } },
      { move: { x: 50, y: 10 } },
      { move: { x: 90, y: 30 } },
      { down: { x: 90, y: 30 } },
      { up: { x: 90, y: 30 } },
    ]);
    expect(actions).toEqual(['begin 10,10', 'move 50,10', 'move 90,30', 'move 90,30', 'end']);
    expect(state.mode).toBe('up');
  });

  it('draws one stroke with press, drag, and release', () => {
    const { actions, state } = run([
      { down: { x: 0, y: 0 } },
      { move: { x: 20, y: 0 } },
      { up: { x: 30, y: 0 } },
      // Moving afterwards paints nothing, because the pen is up.
      { move: { x: 60, y: 0 } },
    ]);
    expect(actions).toEqual(['begin 0,0', 'move 20,0', 'move 30,0', 'end']);
    expect(state.mode).toBe('up');
  });

  it('counts a press that wanders no farther than the slop as a click, and one past it as a drag', () => {
    const within = run([{ down: { x: 0, y: 0 } }, { move: { x: CLICK_SLOP, y: 0 } }, { up: { x: CLICK_SLOP, y: 0 } }]);
    expect(within.state.mode).toBe('sticky');
    const past = run([
      { down: { x: 0, y: 0 } },
      { move: { x: CLICK_SLOP + 1, y: 0 } },
      { up: { x: CLICK_SLOP + 1, y: 0 } },
    ]);
    expect(past.state.mode).toBe('up');
    expect(past.actions.at(-1)).toBe('end');
  });

  it.each([
    ['touch', 'stroke'],
    ['pen', 'stroke'],
    ['mouse', 'once'],
  ] as const)('never stays down after a %s click with a %s tool', (pointer, behavior) => {
    const { actions, state } = run([{ down: { x: 5, y: 5 } }, { up: { x: 5, y: 5 }, pointer, behavior }]);
    expect(actions).toEqual(['begin 5,5', 'end']);
    expect(state.mode).toBe('up');
  });

  it('lifts a sticky pen and a held drag, and does nothing when the pen is up', () => {
    expect(run([{ down: { x: 1, y: 1 } }, { up: { x: 1, y: 1 } }, { lift: true }]).actions).toEqual([
      'begin 1,1',
      'end',
    ]);
    expect(run([{ down: { x: 1, y: 1 } }, { move: { x: 40, y: 1 } }, { lift: true }]).actions).toEqual([
      'begin 1,1',
      'move 40,1',
      'end',
    ]);
    expect(run([{ lift: true }]).actions).toEqual([]);
  });

  it('ignores a second press while one is held, and a release with nothing held', () => {
    const { actions } = run([
      { down: { x: 1, y: 1 } },
      { down: { x: 3, y: 3 } },
      { up: { x: 1, y: 1 } },
      { up: { x: 1, y: 1 } },
    ]);
    expect(actions).toEqual(['begin 1,1']);
  });
});

describe('keyboard pen', () => {
  it('acts once at the cursor with a tool that acts once', () => {
    const { actions, state } = run([{ key: { x: 7, y: 8 }, behavior: 'once' }]);
    expect(actions).toEqual(['begin 7,8', 'end']);
    expect(state.mode).toBe('up');
  });

  it('puts a stroke tool down as a sticky pen at the cursor', () => {
    expect(run([{ key: { x: 3, y: 4 } }]).state).toEqual({ mode: 'sticky', downAt: null });
  });

  it('puts a stroke tool down, follows the cursor, and lifts on the next press', () => {
    const { actions, state } = run([{ key: { x: 0, y: 0 } }, { move: { x: 10, y: 0 } }, { key: { x: 10, y: 0 } }]);
    expect(actions).toEqual(['begin 0,0', 'move 10,0', 'end']);
    expect(state.mode).toBe('up');
  });

  it('says whether the pen is down', () => {
    expect(isPenDown(PEN_UP)).toBe(false);
    expect(isPenDown(run([{ key: { x: 0, y: 0 } }]).state)).toBe(true);
  });
});

describe('click slop', () => {
  it.each([
    ['a short diagonal wobble is still a click', { x: 14, y: 14 }, 'sticky'],
    ['a straight move past the slop is a drag', { x: 10, y: 17 }, 'up'],
    ['a diagonal move past the slop is a drag', { x: 15, y: 15 }, 'up'],
  ] as const)('%s', (_label, to, mode) => {
    const { state } = run([{ down: { x: 10, y: 10 } }, { move: to }, { up: to }]);
    expect(state.mode).toBe(mode);
  });
});
