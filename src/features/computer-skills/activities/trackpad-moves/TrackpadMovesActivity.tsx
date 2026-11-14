import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import { DECOR_SIZE, LAST_TAP_MS, SCREEN, THING_SIZE, type Direction, type Find, type TrackpadLevel } from './level.ts';
import { strings } from './strings.ts';
import './trackpadMoves.css';

const SAY_SCROLL: Readonly<Record<Direction, typeof strings.scrollDown>> = {
  down: strings.scrollDown,
  up: strings.scrollUp,
  right: strings.scrollRight,
  left: strings.scrollLeft,
};

/** How much of a hidden thing must be in the window before it can be tapped. */
const SEEN_SHARE = 0.6;

/** The share of a box `inner` that lies inside `outer`. */
function shareInside(inner: DOMRect, outer: DOMRect): number {
  const width = Math.max(0, Math.min(inner.right, outer.right) - Math.max(inner.left, outer.left));
  const height = Math.max(0, Math.min(inner.bottom, outer.bottom) - Math.max(inner.top, outer.top));
  const area = inner.width * inner.height;
  return area === 0 ? 0 : (width * height) / area;
}

/**
 * A window onto a scene several screens big. The window scrolls the usual ways: two fingers on a
 * trackpad, the mouse wheel (with Shift for sideways), its scroll bars, or the arrow keys when
 * it has focus. A hidden thing can be tapped once most of it is in view. An arrow on the
 * window's edge and a picture of the gesture show which way to go.
 */
export default function TrackpadMovesActivity({ level, kit }: ActivityProps<TrackpadLevel>) {
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState(false);
  const [tapped, setTapped] = useState<ReadonlySet<string>>(new Set());
  const viewport = useRef<HTMLElement>(null);
  const thing = useRef<HTMLButtonElement>(null);
  const find = level.finds[index];
  const finished = tapped.size === level.finds.length;

  // Starts the window on the starting screen.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    element.scrollLeft = level.start.column * element.clientWidth;
    element.scrollTop = level.start.row * element.clientHeight;
  }, [level.start]);

  // Each find is named as the child starts looking for it. A timeout lets the shell's own start
  // of the round speak first, and the first find's words only become the replay.
  useEffect(() => {
    if (find === undefined) return undefined;
    return kit.scope.setTimeout(
      () => kit.setInstruction([SAY_SCROLL[find.direction], emojiNames[find.kind]], { speak: index > 0 }),
      0,
    );
  }, [kit, find, index]);

  const check = useCallback(() => {
    const outer = viewport.current?.getBoundingClientRect();
    const inner = thing.current?.getBoundingClientRect();
    if (outer === undefined || inner === undefined || seen) return;
    if (shareInside(inner, outer) < SEEN_SHARE) return;
    setSeen(true);
    kit.play('sparkle');
    kit.setInstruction(strings.tapIt);
  }, [kit, seen]);

  // A find may already be in view when it is named, after a short scroll past the last one.
  useEffect(() => check(), [check]);

  function tap(target: Find, element: HTMLElement): void {
    if (!seen || tapped.has(target.id)) return;
    const next = new Set(tapped).add(target.id);
    setTapped(next);
    kit.feedback.correct({ at: element });
    if (next.size === level.finds.length) {
      kit.scope.setTimeout(() => kit.roundComplete(), LAST_TAP_MS);
      return;
    }
    setIndex(index + 1);
    setSeen(false);
  }

  const sceneWidth = level.columns * SCREEN.width;
  const sceneHeight = level.rows * SCREEN.height;
  const place = (x: number, y: number, size: number) => ({
    left: `${String((x / sceneWidth) * 100)}%`,
    top: `${String((y / sceneHeight) * 100)}%`,
    width: `${String((size / sceneWidth) * 100)}%`,
  });
  const gesture = find === undefined || seen || finished ? 'tap' : find.direction;

  return (
    <div className='trackpad-stage' data-find={index} data-seen={seen} data-finished={finished}>
      <div className='trackpad-window-area'>
        <div className='trackpad-frame'>
          <section
            ref={viewport}
            className='trackpad-window'
            // A scrolling region takes focus so the arrow keys can scroll it, as axe requires.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={t(strings.scene)}
            onScroll={check}
          >
            <div
              className='trackpad-scene'
              style={{
                width: `${String(level.columns * 100)}%`,
                aspectRatio: `${String(sceneWidth)} / ${String(sceneHeight)}`,
              }}
            >
              {level.decorations.map((decoration) => (
                <div
                  key={decoration.id}
                  className='trackpad-decor'
                  style={place(decoration.x, decoration.y, DECOR_SIZE)}
                >
                  <Emoji id={decoration.kind} decorative />
                </div>
              ))}
              {level.finds.slice(0, index + 1).map((item) => {
                const { x, y } = centerOf(item);
                const isTapped = tapped.has(item.id);
                const current = item.id === find?.id && !isTapped;
                return (
                  <button
                    key={item.id}
                    ref={current ? thing : undefined}
                    type='button'
                    className='trackpad-thing'
                    data-thing={item.id}
                    data-tapped={isTapped}
                    data-ready={current && seen}
                    disabled={!current || !seen}
                    aria-label={t(emojiNames[item.kind])}
                    style={place(x, y, THING_SIZE)}
                    onClick={(event) => tap(item, event.currentTarget)}
                  >
                    <Emoji id={item.kind} decorative />
                  </button>
                );
              })}
            </div>
          </section>
          {gesture !== 'tap' && <EdgeArrow direction={gesture} />}
        </div>
      </div>
      <div className='trackpad-panel'>
        <GesturePicture gesture={gesture} label={t(gesture === 'tap' ? strings.oneTap : strings.twoFingers)} />
      </div>
    </div>
  );
}

/** A find's center across the whole scene, in units. */
const centerOf = (item: Find) => ({
  x: item.screen.column * SCREEN.width + item.x,
  y: item.screen.row * SCREEN.height + item.y,
});

const TURN: Readonly<Record<Direction, number>> = { up: 0, right: 90, down: 180, left: 270 };

/** A big arrow on the window's edge, pointing the way to scroll. */
function EdgeArrow({ direction }: { direction: Direction }) {
  return (
    <span className='trackpad-edge-arrow' data-direction={direction} aria-hidden='true'>
      <svg viewBox='-30 -30 60 60' style={{ rotate: `${String(TURN[direction])}deg` }}>
        <path d='M0 -24 L22 2 H9 V24 H-9 V2 H-22 Z' />
      </svg>
    </span>
  );
}

/**
 * A trackpad with fingertips: two fingers and a two-way arrow for a scroll, one finger and
 * rings for a tap. The arrow shows the scroll's line, not its sign, because a "natural" scroll
 * setting flips which way the fingers move.
 */
function GesturePicture({ gesture, label }: { gesture: Direction | 'tap'; label: string }) {
  const sideways = gesture === 'left' || gesture === 'right';
  return (
    <figure className='trackpad-gesture' data-gesture={gesture}>
      <svg viewBox='0 0 160 120' aria-hidden='true'>
        <rect className='trackpad-pad' x={8} y={8} width={144} height={104} rx={16} />
        {gesture === 'tap' ? (
          <g>
            <circle className='trackpad-ring' cx={80} cy={60} r={30} />
            <circle className='trackpad-ring' cx={80} cy={60} r={21} />
            <ellipse className='trackpad-finger' cx={80} cy={60} rx={11} ry={14} />
          </g>
        ) : (
          <g>
            <ellipse className='trackpad-finger' cx={68} cy={sideways ? 48 : 60} rx={10} ry={13} />
            <ellipse className='trackpad-finger' cx={92} cy={sideways ? 48 : 60} rx={10} ry={13} />
            <path
              className='trackpad-motion'
              d={
                sideways
                  ? 'M45 88 H115 M55 80 L45 88 L55 96 M105 80 L115 88 L105 96'
                  : 'M118 30 V90 M110 40 L118 30 L126 40 M110 80 L118 90 L126 80'
              }
            />
          </g>
        )}
      </svg>
      <figcaption className='trackpad-gesture-caption wk-reading-text'>{label}</figcaption>
    </figure>
  );
}
