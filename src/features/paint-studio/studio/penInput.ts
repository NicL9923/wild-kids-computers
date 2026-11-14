/**
 * The sticky pen: how pointer presses become strokes, as a pure state machine.
 *
 * - A click without movement puts the pen down. Moving paints. The next click lifts it.
 * - Press, drag, and release also works, as one stroke.
 * - Touch has no hover, so a tap is a dot and a drag is a stroke.
 * - Tools that act once, such as fill and stamps, never stay down: a click is one action, and a
 *   press-drag-release moves the action before it lands.
 * - Leaving the canvas for a moment, or choosing another tool, lifts the pen. The studio calls
 *   `lift` for both, so a child never gets stuck painting.
 */

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

type PenMode =
  /** Nothing is happening. */
  | 'up'
  /** A button is held and has not moved far yet. */
  | 'pressed'
  /** A button is held and has moved: press, drag, release. */
  | 'dragging'
  /** Clicked once without moving: the pen paints wherever the pointer goes. */
  | 'sticky'
  /** The lifting click is held down. The stroke ends when it is released. */
  | 'lifting';

export interface PenState {
  readonly mode: PenMode;
  /** Where the current press started, in screen pixels. */
  readonly downAt: ScreenPoint | null;
}

export type PenAction =
  | { readonly kind: 'begin'; readonly at: ScreenPoint }
  | { readonly kind: 'move'; readonly to: ScreenPoint }
  | { readonly kind: 'end' };

export interface PenResult {
  readonly state: PenState;
  readonly actions: readonly PenAction[];
}

export type PointerKind = 'mouse' | 'pen' | 'touch';

/** How a tool uses the pen. `once` tools act on release and never stay down. */
export type PenBehavior = 'stroke' | 'once';

/** How far a press may wander, in screen pixels, and still count as a click. */
export const CLICK_SLOP = 6;

export const PEN_UP: PenState = Object.freeze({ mode: 'up', downAt: null });

const none = (state: PenState): PenResult => ({ state, actions: [] });

function distance(a: ScreenPoint, b: ScreenPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isPenDown(state: PenState): boolean {
  return state.mode !== 'up';
}

/** A button went down on the canvas. */
export function penDown(state: PenState, at: ScreenPoint): PenResult {
  switch (state.mode) {
    case 'up':
      return { state: { mode: 'pressed', downAt: at }, actions: [{ kind: 'begin', at }] };
    case 'sticky':
      return { state: { mode: 'lifting', downAt: at }, actions: [{ kind: 'move', to: at }] };
    default:
      // A second button while one is held changes nothing.
      return none(state);
  }
}

/** The pointer moved over the canvas, held or not. */
export function penMove(state: PenState, to: ScreenPoint): PenResult {
  switch (state.mode) {
    case 'up':
      return none(state);
    case 'pressed': {
      const moved = state.downAt !== null && distance(state.downAt, to) > CLICK_SLOP;
      return { state: moved ? { mode: 'dragging', downAt: state.downAt } : state, actions: [{ kind: 'move', to }] };
    }
    default:
      return { state, actions: [{ kind: 'move', to }] };
  }
}

/** The button came up. */
export function penUp(state: PenState, at: ScreenPoint, pointer: PointerKind, behavior: PenBehavior): PenResult {
  switch (state.mode) {
    case 'pressed':
      // A click without movement. With a mouse, a stroke tool stays down until the next click.
      if (behavior === 'stroke' && pointer === 'mouse') return { state: { mode: 'sticky', downAt: null }, actions: [] };
      return { state: PEN_UP, actions: [{ kind: 'end' }] };
    case 'dragging':
      return { state: PEN_UP, actions: [{ kind: 'move', to: at }, { kind: 'end' }] };
    case 'lifting':
      return { state: PEN_UP, actions: [{ kind: 'end' }] };
    default:
      return none(state);
  }
}

/** Ends whatever is happening: the pointer left for a while, the tool changed, or the window lost focus. */
export function penLift(state: PenState): PenResult {
  if (state.mode === 'up') return none(state);
  return { state: PEN_UP, actions: [{ kind: 'end' }] };
}

/**
 * Enter or Space at the keyboard cursor. A tool that acts once acts there. A stroke tool puts the
 * pen down, so the arrow keys paint, and the next press lifts it.
 */
export function penKey(state: PenState, at: ScreenPoint, behavior: PenBehavior): PenResult {
  if (state.mode !== 'up') return penLift(state);
  if (behavior === 'once') return { state: PEN_UP, actions: [{ kind: 'begin', at }, { kind: 'end' }] };
  return { state: { mode: 'sticky', downAt: null }, actions: [{ kind: 'begin', at }] };
}
