import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import fireflyArt from '../../../../../assets/art/activities/catch-the-fireflies/firefly.svg';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import {
  angleAfter,
  LAST_CATCH_PAUSE_MS,
  MISSES_BEFORE_SLOWING,
  positionAt,
  SKY,
  SLOW_FACTOR,
  type FirefliesLevel,
  type Firefly,
} from './level.ts';
import { strings } from './strings.ts';
import './catchTheFireflies.css';

/** The longest frame step, so a stalled window does not make the fireflies jump. */
const MAX_FRAME_MS = 100;

/** A firefly's left and top in percent of the sky. */
function placeOf(firefly: Firefly, angle: number): { left: string; top: string } {
  const at = positionAt(firefly, angle);
  return { left: `${String((at.x / SKY.width) * 100)}%`, top: `${String((at.y / SKY.height) * 100)}%` };
}

/** The evening meadow behind the fireflies. Original art. */
function Evening() {
  return (
    <svg className='fireflies-scene' viewBox='0 0 1000 600' preserveAspectRatio='none' aria-hidden='true'>
      <defs>
        <linearGradient id='fireflies-dusk' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#1f2b4f' />
          <stop offset='1' stopColor='#40598a' />
        </linearGradient>
      </defs>
      <rect width='1000' height='600' fill='url(#fireflies-dusk)' />
      <path d='M0 520c120-50 260-60 400-30s300 30 380-10 160-40 220-20v140H0z' fill='#2a4a3a' />
      <path d='M0 560c160-30 320-20 500 0s340 10 500-20v60H0z' fill='#1f3a2b' />
    </svg>
  );
}

/**
 * Fireflies drift slowly round their own loops in an evening sky. Pressing on one catches it: it
 * stops and glows. A press on the empty sky shows a soft ring and catches nothing. After a few
 * misses in a row the fireflies slow down to half speed, as a hint. Under reduced motion they
 * always fly at half speed; moving is the lesson, so they never stop.
 */
export default function CatchTheFirefliesActivity({ level, kit }: ActivityProps<FirefliesLevel>) {
  const [caught, setCaught] = useState<ReadonlySet<string>>(new Set());
  const [slow, setSlow] = useState(false);
  const elements = useRef(new Map<string, HTMLButtonElement>());
  // The angles move every frame without a render; a render reads them so nothing jumps back.
  const angles = useRef(new Map(level.fireflies.map((firefly) => [firefly.id, firefly.phase])));
  const live = useRef({ caught, slow });
  const misses = useRef(0);
  useLayoutEffect(() => {
    live.current = { caught, slow };
  });

  useEffect(() => {
    let last: number | null = null;
    let cancel = kit.scope.requestFrame(function frame(time) {
      const step = last === null ? 0 : Math.min(time - last, MAX_FRAME_MS);
      last = time;
      const pace = (live.current.slow ? SLOW_FACTOR : 1) * (kit.reducedMotion ? SLOW_FACTOR : 1);
      for (const firefly of level.fireflies) {
        if (live.current.caught.has(firefly.id)) continue;
        const angle = angleAfter(
          { phase: angles.current.get(firefly.id) ?? firefly.phase, turn: firefly.turn },
          step,
          pace,
        );
        angles.current.set(firefly.id, angle);
        const element = elements.current.get(firefly.id);
        if (element !== undefined) Object.assign(element.style, placeOf(firefly, angle));
      }
      cancel = kit.scope.requestFrame(frame);
    });
    return () => cancel();
  }, [kit, level]);

  function catchIt(id: string, element: HTMLElement): void {
    if (live.current.caught.has(id)) return;
    const next = new Set(live.current.caught).add(id);
    live.current = { ...live.current, caught: next };
    setCaught(next);
    misses.current = 0;
    kit.play('sparkle');
    kit.feedback.correct({ at: element, silent: true });
    if (next.size === level.fireflies.length) kit.scope.setTimeout(() => kit.roundComplete(), LAST_CATCH_PAUSE_MS);
  }

  function pressed(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('[data-firefly]') !== null) return;
    kit.feedback.wrong({ at: { x: event.clientX, y: event.clientY }, silent: true });
    misses.current += 1;
    if (misses.current >= MISSES_BEFORE_SLOWING && !live.current.slow) {
      setSlow(true);
      kit.hint();
    }
  }

  return (
    <div className='fireflies-stage'>
      <div
        className='fireflies-sky'
        data-left={level.fireflies.length - caught.size}
        data-slow={slow}
        onPointerDown={pressed}
      >
        <Evening />
        {level.fireflies.map((firefly) => {
          const isCaught = caught.has(firefly.id);
          return (
            <button
              key={firefly.id}
              ref={(element) => {
                if (element === null) {
                  elements.current.delete(firefly.id);
                  return;
                }
                elements.current.set(firefly.id, element);
                // Placed here, not in style, so a render never puts it back where it started.
                Object.assign(element.style, placeOf(firefly, angles.current.get(firefly.id) ?? firefly.phase));
              }}
              type='button'
              className='fireflies-firefly'
              data-firefly={firefly.id}
              data-caught={isCaught}
              disabled={isCaught}
              aria-label={t(strings.firefly)}
              style={{ width: `${String((level.size / SKY.width) * 100)}cqw` }}
              onPointerDown={(event) => {
                if (event.button === 0) catchIt(firefly.id, event.currentTarget);
              }}
              onClick={(event) => catchIt(firefly.id, event.currentTarget)}
            >
              <img src={fireflyArt} alt='' draggable={false} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
