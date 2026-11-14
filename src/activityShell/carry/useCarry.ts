import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { ActivityKit } from '../kit.ts';

/**
 * The one way to move things in the app. A child can press, drag, and release, or click to pick
 * up and click to place. A keyboard user presses Enter or Space to pick up, the arrow keys to
 * move, Enter or Space to place, and Escape to put it back. Releasing early never loses the item:
 * it goes back to where it was.
 *
 * Three kinds of move:
 * - `targets`: the item goes onto a drop target, such as a picnic basket.
 * - `free`: the item lands anywhere in an area, such as a window on the toy desktop.
 * - `axis`: the item slides along one axis within a range, such as a slider or a resize handle.
 *
 * Spread `carry.item(id)` on each movable element (a `<button>`), and `carry.target(id)` on each
 * drop target. The hook adds a clear picked-up look and marks valid targets.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type CarryMode<I extends string, T extends string> =
  | {
      readonly kind: 'targets';
      /** Whether a target takes this item. A target that does not is never marked valid. */
      readonly accepts?: (item: I, target: T) => boolean;
      readonly onDrop: (item: I, target: T) => void;
      /**
       * For items whose click already means something, such as a toolbox block that a click adds.
       * Called for a press and release without a drag, and for Enter or Space. Return true when
       * the click acted; the item is then not picked up. Return false to pick it up as usual.
       * Dragging still carries the item. Give such items another click path to every target,
       * such as choosing the target first, because they cannot be clicked up and clicked down.
       */
      readonly onClick?: (item: I) => boolean;
    }
  | {
      readonly kind: 'free';
      readonly area: RefObject<HTMLElement | null>;
      /** The item's top left in the area now, in CSS pixels. */
      readonly position: (item: I) => Point;
      /** Called with the new top left, kept inside the area. */
      readonly onPlace: (item: I, point: Point) => void;
      /** Pixels per arrow key press. Defaults to 24. */
      readonly keyStep?: number;
    }
  | {
      readonly kind: 'axis';
      readonly axis: 'x' | 'y';
      /** The element the value runs along, from its left or top edge. */
      readonly track: RefObject<HTMLElement | null>;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly value: (item: I) => number;
      /** Called as the value changes while carried. */
      readonly onChange: (item: I, value: number) => void;
      /** Called when the item is put down at its final value. */
      readonly onDrop?: (item: I, value: number) => void;
    };

/**
 * How the item is being carried.
 * @public
 */
export type CarryHow = 'held' | 'clicked' | 'keyboard';

/** @public */
export interface CarryItemProps {
  readonly ref: (element: HTMLElement | null) => void;
  readonly 'data-carry-item': string;
  readonly 'data-carried': boolean;
  readonly 'aria-pressed': boolean;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly style: CSSProperties;
}

/** @public */
export interface CarryTargetProps {
  readonly ref: (element: HTMLElement | null) => void;
  readonly 'data-carry-target': string;
  /** True while an item is carried that this target accepts. */
  readonly 'data-carry-valid': boolean;
  /** True while the carried item is over this target, or the keyboard chose it. */
  readonly 'data-carry-over': boolean;
}

export interface Carry<I extends string, T extends string> {
  /** The item picked up now, or null. */
  readonly carried: I | null;
  readonly how: CarryHow | null;
  /** The target the item would land on now. */
  readonly over: T | null;
  item(id: I): CarryItemProps;
  target(id: T): CarryTargetProps;
}

/** Movement under this many pixels is a click, not a drag. Small hands wobble. */
const DRAG_THRESHOLD = 8;
const DEFAULT_KEY_STEP = 24;

interface Active<I> {
  readonly item: I;
  readonly how: CarryHow;
  /** Where the pointer went down, for the threshold and for the offset while carried. */
  readonly start: Point;
  /** Pressed but not moved past the threshold yet: it may still become a click. */
  readonly pending: boolean;
  /** The offset from where the item sits, in pixels, while it follows the pointer or keys. */
  readonly offset: Point;
  /** For an axis move, the value before pick up, to put back on cancel. */
  readonly startValue: number;
}

function center(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function inside(rect: DOMRect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** Whether a target takes an item. Every target takes every item unless the mode says otherwise. */
function modeAccepts<I extends string, T extends string>(mode: CarryMode<I, T>, item: I, target: T): boolean {
  return mode.kind === 'targets' && (mode.accepts?.(item, target) ?? true);
}

function snap(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

export function useCarry<I extends string, T extends string = never>(
  kit: Pick<ActivityKit<unknown>, 'scope' | 'play'>,
  mode: CarryMode<I, T>,
): Carry<I, T> {
  const { scope, play } = kit;
  const [active, setActive] = useState<Active<I> | null>(null);
  const [over, setOver] = useState<T | null>(null);
  const targets = useRef(new Map<T, HTMLElement>());
  const items = useRef(new Map<I, HTMLElement>());
  // The newest values for window listeners, which outlive a render.
  const live = useRef({ active, over, mode });
  useLayoutEffect(() => {
    live.current = { active, over, mode };
  });

  const targetAt = useCallback((item: I, point: Point): T | null => {
    for (const [id, element] of targets.current) {
      if (live.current.mode.kind !== 'targets') return null;
      const modeNow = live.current.mode;
      if (inside(element.getBoundingClientRect(), point) && (modeNow.accepts?.(item, id) ?? true)) return id;
    }
    return null;
  }, []);

  const axisValue = useCallback((point: Point): number | null => {
    const modeNow = live.current.mode;
    if (modeNow.kind !== 'axis') return null;
    const track = modeNow.track.current?.getBoundingClientRect();
    if (track === undefined) return null;
    const length = modeNow.axis === 'x' ? track.width : track.height;
    const along = modeNow.axis === 'x' ? point.x - track.left : point.y - track.top;
    const fraction = length <= 0 ? 0 : along / length;
    return snap(modeNow.min + fraction * (modeNow.max - modeNow.min), modeNow.min, modeNow.max, modeNow.step);
  }, []);

  /** The free-mode top left for an offset, kept inside the area. */
  const freePoint = useCallback((item: I, offset: Point): Point | null => {
    const modeNow = live.current.mode;
    if (modeNow.kind !== 'free') return null;
    const area = modeNow.area.current?.getBoundingClientRect();
    const element = items.current.get(item)?.getBoundingClientRect();
    const from = modeNow.position(item);
    const x = from.x + offset.x;
    const y = from.y + offset.y;
    if (area === undefined) return { x, y };
    const maxX = Math.max(0, area.width - (element?.width ?? 0));
    const maxY = Math.max(0, area.height - (element?.height ?? 0));
    return { x: Math.min(maxX, Math.max(0, x)), y: Math.min(maxY, Math.max(0, y)) };
  }, []);

  /**
   * Puts the carried item down. With `placed` false, or with no target under it, it goes back to
   * where it was. `at` is where the pointer let go; a keyboard drop uses the chosen target.
   */
  const finish = useCallback(
    (placed: boolean, at?: Point) => {
      const { active: now, over: chosen, mode: modeNow } = live.current;
      if (now === null) return;
      setActive(null);
      setOver(null);
      if (modeNow.kind === 'targets') {
        const target = at === undefined ? chosen : targetAt(now.item, at);
        if (placed && target !== null) {
          play('put-down');
          modeNow.onDrop(now.item, target);
        }
        return;
      }
      if (modeNow.kind === 'free') {
        const offset = at === undefined ? now.offset : { x: at.x - now.start.x, y: at.y - now.start.y };
        const point = freePoint(now.item, offset);
        if (placed && point !== null) {
          play('put-down');
          modeNow.onPlace(now.item, point);
        }
        return;
      }
      if (!placed) {
        modeNow.onChange(now.item, now.startValue);
        return;
      }
      const value = (at === undefined ? null : axisValue(at)) ?? modeNow.value(now.item);
      if (value !== modeNow.value(now.item)) modeNow.onChange(now.item, value);
      play('put-down');
      modeNow.onDrop?.(now.item, value);
    },
    [axisValue, freePoint, play, targetAt],
  );

  /** Follows the pointer: the offset for targets and free moves, the value for an axis move. */
  const follow = useCallback(
    (now: Active<I>, point: Point) => {
      const offset = { x: point.x - now.start.x, y: point.y - now.start.y };
      const modeNow = live.current.mode;
      if (modeNow.kind === 'axis') {
        const value = axisValue(point);
        if (value !== null && value !== modeNow.value(now.item)) modeNow.onChange(now.item, value);
      }
      if (modeNow.kind === 'targets') setOver(targetAt(now.item, point));
      setActive({ ...now, pending: false, offset });
    },
    [axisValue, targetAt],
  );

  // Window listeners while something is held or carried. They live in the activity's scope, so
  // leaving the activity removes them.
  const carrying = active !== null && active.how !== 'keyboard';
  useEffect(() => {
    if (!carrying) return undefined;
    const point = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
    const stops = [
      scope.listen(window, 'pointermove', (event: PointerEvent) => {
        const now = live.current.active;
        if (now === null) return;
        const at = point(event);
        if (now.pending) {
          const moved = Math.hypot(at.x - now.start.x, at.y - now.start.y);
          if (now.how === 'held' && moved < DRAG_THRESHOLD) return;
        }
        follow(now, at);
      }),
      scope.listen(window, 'pointerup', (event: PointerEvent) => {
        const now = live.current.active;
        if (now === null) return;
        if (now.how === 'held' && now.pending) {
          const modeNow = live.current.mode;
          if (modeNow.kind === 'targets' && modeNow.onClick?.(now.item) === true) {
            setActive(null);
            setOver(null);
            return;
          }
          // A press and release without a drag: the item stays picked up until the next click.
          setActive({ ...now, how: 'clicked' });
          return;
        }
        // A drag ends where it is released. A picked-up item lands where the placing click is.
        finish(true, point(event));
      }),
      scope.listen(window, 'keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        finish(false);
      }),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, [carrying, finish, follow, scope]);

  const item = useCallback(
    (id: I): CarryItemProps => {
      const carried = active?.item === id;
      // An axis move changes a value, not the item's place, so only the other moves follow.
      const offset = carried && mode.kind !== 'axis' ? active.offset : null;
      return {
        ref: (element) => {
          if (element === null) items.current.delete(id);
          else items.current.set(id, element);
        },
        'data-carry-item': id,
        'data-carried': carried,
        'aria-pressed': carried,
        style: {
          touchAction: 'none',
          translate: offset === null ? undefined : `${String(offset.x)}px ${String(offset.y)}px`,
          // The carried item lets the pointer reach the target under it.
          pointerEvents: carried && active.how !== 'keyboard' ? 'none' : undefined,
        },
        onPointerDown(event) {
          if (event.button !== 0) return;
          const now = live.current.active;
          // A click while another item is carried is the placing click, handled on release.
          if (now !== null) return;
          event.preventDefault();
          play('pick-up');
          setActive({
            item: id,
            how: 'held',
            start: { x: event.clientX, y: event.clientY },
            pending: true,
            offset: { x: 0, y: 0 },
            startValue: mode.kind === 'axis' ? mode.value(id) : 0,
          });
        },
        onKeyDown(event) {
          const now = live.current.active;
          const isPick = event.key === 'Enter' || event.key === ' ';
          if (now === null) {
            if (!isPick) return;
            event.preventDefault();
            if (mode.kind === 'targets' && mode.onClick?.(id) === true) return;
            play('pick-up');
            const start = center(event.currentTarget.getBoundingClientRect());
            setActive({
              item: id,
              how: 'keyboard',
              start,
              pending: false,
              offset: { x: 0, y: 0 },
              startValue: mode.kind === 'axis' ? mode.value(id) : 0,
            });
            if (mode.kind === 'targets') setOver(firstTarget(id));
            return;
          }
          if (now.item !== id) return;
          if (isPick) {
            event.preventDefault();
            finish(true);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
            return;
          }
          const direction = ARROWS[event.key];
          if (direction === undefined) return;
          event.preventDefault();
          moveByKey(now, direction);
        },
      };

      function firstTarget(itemId: I): T | null {
        for (const target of targets.current.keys()) if (modeAccepts(mode, itemId, target)) return target;
        return null;
      }

      function moveByKey(now: Active<I>, direction: Point): void {
        if (mode.kind === 'targets') {
          const valid = [...targets.current.keys()].filter((target) => modeAccepts(mode, now.item, target));
          if (valid.length === 0) return;
          const index = live.current.over === null ? -1 : valid.indexOf(live.current.over);
          const delta = direction.x + direction.y > 0 ? 1 : -1;
          setOver(valid[(index + delta + valid.length) % valid.length] ?? null);
          return;
        }
        if (mode.kind === 'free') {
          const step = mode.keyStep ?? DEFAULT_KEY_STEP;
          setActive({ ...now, offset: { x: now.offset.x + direction.x * step, y: now.offset.y + direction.y * step } });
          return;
        }
        // Up and right raise an axis value; down and left lower it.
        const sign = direction.x !== 0 ? direction.x : -direction.y;
        const value = snap(mode.value(now.item) + sign * mode.step, mode.min, mode.max, mode.step);
        mode.onChange(now.item, value);
      }
    },
    [active, finish, mode, play],
  );

  const target = useCallback(
    (id: T): CarryTargetProps => ({
      ref: (element) => {
        if (element === null) targets.current.delete(id);
        else targets.current.set(id, element);
      },
      'data-carry-target': id,
      'data-carry-valid': active !== null && modeAccepts(mode, active.item, id),
      'data-carry-over': over === id,
    }),
    [active, mode, over],
  );

  return useMemo(
    () => ({ carried: active?.item ?? null, how: active?.how ?? null, over, item, target }),
    [active, over, item, target],
  );
}

const ARROWS: Readonly<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
