// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityKit, FeedbackOptions } from '../../../activityShell/kit.ts';
import { createManualScheduler } from '../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../core/activityKit/scope.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../core/strings/shared/index.ts';
import { useSortRound, type SortRound } from './useSortRound.ts';

afterEach(cleanup);

/** What the round asked the kit to do, in order. */
type KitCall =
  | { call: 'correct' | 'wrong'; say: string | null }
  | { call: 'hint'; say: string | null }
  | { call: 'say'; ids: string[] }
  | { call: 'round-complete' };

const said = (options?: FeedbackOptions) => options?.say?.id ?? null;

const unexpected = (name: string) => () => {
  throw new Error(`The sort round should not call kit.${name}`);
};

function fakeKit(): { kit: ActivityKit; calls: KitCall[] } {
  const calls: KitCall[] = [];
  const scheduler = createManualScheduler({ wall: 0 });
  const kit: ActivityKit = {
    scope: createScope(scheduler),
    clock: scheduler,
    reducedMotion: false,
    speak: unexpected('speak'),
    speakSequence: (handles: readonly SpokenHandle[]) => {
      calls.push({ call: 'say', ids: handles.map((handle) => handle.id) });
      return Promise.resolve();
    },
    setInstruction: unexpected('setInstruction'),
    play: () => undefined,
    startSound: unexpected('startSound'),
    feedback: {
      correct: (options) => calls.push({ call: 'correct', say: said(options) }),
      wrong: (options) => calls.push({ call: 'wrong', say: said(options) }),
    },
    hint: (say) => calls.push({ call: 'hint', say: say?.id ?? null }),
    roundComplete: () => calls.push({ call: 'round-complete' }),
    stepSolved: unexpected('stepSolved'),
    get state(): never {
      throw new Error('The sort round has no state');
    },
    pictures: { list: unexpected('pictures.list'), read: unexpected('pictures.read') },
  };
  return { kit, calls };
}

type Piece = 'one' | 'two' | 'spare';
type Hole = 'hole-one' | 'hole-two';
const PIECES: readonly Piece[] = ['one', 'two', 'spare'];
const HOLES: readonly Hole[] = ['hole-one', 'hole-two'];
const named: Record<Piece, SpokenHandle> = { one: numberHandle(1), two: numberHandle(2), spare: numberHandle(3) };

/** Two pieces with a hole each, and a spare that fits nowhere, like shape builder's extra shape. */
function Board({ kit, onRound }: { kit: ActivityKit; onRound: (round: SortRound<Piece, Hole>) => void }) {
  const round = useSortRound<Piece, Hole>(kit, {
    required: ['one', 'two'],
    targets: HOLES,
    fits: (piece, hole) => hole === `hole-${piece}`,
    holds: 'one',
    onPlaced: (piece) => [named[piece]],
    onDone: () => [feedback.youDidIt],
    onMiss: (piece) => [named[piece]],
  });
  onRound(round);
  return (
    <div>
      {PIECES.filter((piece) => !round.placed.has(piece)).map((piece) => (
        <button key={piece} type='button' {...round.carry.item(piece)}>
          {piece}
        </button>
      ))}
      {HOLES.map((hole) => (
        <div key={hole} {...round.carry.target(hole)}>
          {hole}
        </div>
      ))}
    </div>
  );
}

/** jsdom lays nothing out, so each element gets a box: pieces down the left, holes on the right. */
function layOut(): void {
  const boxes: Record<string, DOMRect> = {
    one: new DOMRect(0, 0, 100, 100),
    two: new DOMRect(0, 150, 100, 100),
    spare: new DOMRect(0, 300, 100, 100),
    'hole-one': new DOMRect(400, 0, 100, 100),
    'hole-two': new DOMRect(400, 150, 100, 100),
  };
  for (const [name, box] of Object.entries(boxes)) {
    const element = screen.queryByText(name);
    if (element !== null)
      Object.defineProperty(element, 'getBoundingClientRect', { configurable: true, value: () => box });
  }
}

const at = (box: DOMRect) => ({ clientX: box.x + 10, clientY: box.y + 10, button: 0 });

/** Clicks the piece up and clicks it down on the hole, the click alternative to a drag. */
function put(piece: Piece, hole: Hole): void {
  layOut();
  const from = screen.getByText(piece).getBoundingClientRect();
  const to = screen.getByText(hole).getBoundingClientRect();
  // One event per act, so the window listener the press adds is there for the release.
  act(() => void fireEvent.pointerDown(screen.getByText(piece), at(from)));
  act(() => void fireEvent.pointerUp(window, at(from)));
  act(() => void fireEvent.pointerDown(screen.getByText(hole), at(to)));
  act(() => void fireEvent.pointerUp(window, at(to)));
}

function setup() {
  const { kit, calls } = fakeKit();
  const seen: { round: SortRound<Piece, Hole> | null } = { round: null };
  render(
    <Board
      kit={kit}
      onRound={(round) => {
        seen.round = round;
      }}
    />,
  );
  return { calls, hint: () => seen.round?.hint ?? null };
}

describe('useSortRound hints', () => {
  it('after two misses with a piece, shows that piece and its hole and counts one hint', () => {
    const { calls, hint } = setup();
    put('one', 'hole-two');
    put('one', 'hole-two');
    expect(calls).toEqual([
      { call: 'wrong', say: null },
      { call: 'say', ids: [named.one.id, feedback.tryAnother.id] },
      { call: 'wrong', say: null },
      { call: 'hint', say: feedback.hereItIs.id },
    ]);
    expect(hint()).toEqual({ item: 'one', target: 'hole-one' });
  });

  it('after two misses with a spare that fits nowhere, shows a piece that does fit and its hole', () => {
    const { calls, hint } = setup();
    put('one', 'hole-one');
    put('spare', 'hole-two');
    put('spare', 'hole-two');
    // "Here it is" and the counted hint come only with something to look at.
    expect(calls.filter((entry) => entry.call === 'hint')).toEqual([{ call: 'hint', say: feedback.hereItIs.id }]);
    expect(hint()).toEqual({ item: 'two', target: 'hole-two' });
  });

  it('drops the hint once a piece lands where it belongs', () => {
    const { hint } = setup();
    put('spare', 'hole-one');
    put('spare', 'hole-one');
    expect(hint()).toEqual({ item: 'one', target: 'hole-one' });
    put('one', 'hole-one');
    expect(hint()).toBeNull();
  });
});
