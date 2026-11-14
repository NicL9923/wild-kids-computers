import { useRef, useState, type PointerEvent } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { AWAKE_PAUSE_MS, budsWokenBy, MEADOW, type MeadowLevel, type Point } from './level.ts';
import './wakeTheMeadow.css';

/** The shortest gap between two bloom sounds, so a fast sweep sounds like a ripple, not a buzz. */
const BLOOM_SOUND_GAP_MS = 140;

/** A closed bud on a short stem. Original art. */
function BudArt() {
  return (
    <svg viewBox='0 0 100 100' className='meadow-bud-art' aria-hidden='true'>
      <path d='M50 97V56' stroke='#2f5a22' strokeWidth='7' strokeLinecap='round' fill='none' />
      <path d='M50 80c-14-2-24-10-28-22 14 0 24 8 28 22z' fill='#3f7a2c' />
      <path d='M50 74c12-2 21-9 25-19-12 0-21 7-25 19z' fill='#3f7a2c' />
      <path d='M50 14c14 10 20 24 20 34 0 10-8 16-20 16s-20-6-20-16c0-10 6-24 20-34z' fill='#5d9a3c' />
      <path d='M50 16c6 6 9 14 9 22-4-4-6-6-9-6s-5 2-9 6c0-8 3-16 9-22z' fill='#e48bb0' />
      <path
        d='M50 14c14 10 20 24 20 34 0 10-8 16-20 16s-20-6-20-16c0-10 6-24 20-34z'
        fill='none'
        stroke='#2f5a22'
        strokeWidth='4'
      />
    </svg>
  );
}

/** Where a pointer event falls on the meadow, in meadow units. */
function toMeadow(event: PointerEvent<HTMLDivElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * MEADOW.width,
    y: ((event.clientY - rect.top) / rect.height) * MEADOW.height,
  };
}

/**
 * A grassy meadow of sleeping buds. Wherever the pointer moves, a soft light follows it and every
 * bud within reach opens at once. There is nothing to click and nothing to get wrong. When three
 * quarters of the meadow is awake, the rest opens too and the round ends.
 *
 * Pointer moves can come faster than the screen draws, so the move handler reads and writes the
 * awake buds in a live record, never the set of the last render.
 */
export default function WakeTheMeadowActivity({ level, kit }: ActivityProps<MeadowLevel>) {
  const [awake, setAwake] = useState<ReadonlySet<string>>(new Set());
  const halo = useRef<HTMLDivElement>(null);
  const last = useRef<Point | null>(null);
  const lastSound = useRef(Number.NEGATIVE_INFINITY);
  const live = useRef({ awake });
  const done = awake.size === level.buds.length;

  function moved(event: PointerEvent<HTMLDivElement>): void {
    const at = toMeadow(event);
    const light = halo.current;
    if (light !== null) {
      light.style.left = `${String((at.x / MEADOW.width) * 100)}%`;
      light.style.top = `${String((at.y / MEADOW.height) * 100)}%`;
      light.dataset['shown'] = 'true';
    }
    const from = last.current ?? at;
    last.current = at;
    const before = live.current.awake;
    if (before.size === level.buds.length) return;
    const woken = budsWokenBy(level, from, at).filter((id) => !before.has(id));
    if (woken.length === 0) return;
    const next = new Set([...before, ...woken]);
    const now = kit.clock.monotonic();
    if (now - lastSound.current >= BLOOM_SOUND_GAP_MS) {
      lastSound.current = now;
      kit.play('bloom');
    }
    if (next.size < level.needed) {
      live.current = { awake: next };
      setAwake(next);
      return;
    }
    // Enough of the meadow is awake: the rest opens too, and the round ends after a look.
    const all = new Set(level.buds.map((bud) => bud.id));
    live.current = { awake: all };
    setAwake(all);
    kit.feedback.correct();
    kit.scope.setTimeout(() => kit.roundComplete(), AWAKE_PAUSE_MS);
  }

  function left(): void {
    last.current = null;
    if (halo.current !== null) halo.current.dataset['shown'] = 'false';
  }

  return (
    <div className='meadow-stage'>
      <div
        className='meadow-board'
        data-awake={awake.size}
        data-done={done}
        onPointerMove={moved}
        onPointerDown={moved}
        onPointerLeave={left}
      >
        <div
          ref={halo}
          className='meadow-halo'
          data-shown='false'
          style={{ width: `${String(((2 * level.reach) / MEADOW.width) * 100)}cqw` }}
        />
        {level.buds.map((bud) => {
          const isAwake = awake.has(bud.id);
          return (
            <div
              key={bud.id}
              className='meadow-bud'
              data-bud={bud.id}
              data-awake={isAwake}
              style={{
                left: `${String((bud.x / MEADOW.width) * 100)}%`,
                top: `${String((bud.y / MEADOW.height) * 100)}%`,
                width: `${String((level.size / MEADOW.width) * 100)}cqw`,
              }}
            >
              {isAwake ? <Emoji id={bud.flower} decorative className='meadow-flower' /> : <BudArt />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
