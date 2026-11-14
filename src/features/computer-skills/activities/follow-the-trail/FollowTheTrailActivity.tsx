import { useRef, useState, type PointerEvent } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import {
  ARRIVE_PAUSE_MS,
  arrived,
  FIELD,
  follow,
  lengthOf,
  pointAt,
  type Point,
  type TrailLevel,
  type Walk,
} from './level.ts';
import { strings } from './strings.ts';
import './followTheTrail.css';

/** A soft step sound every this many field units the bug walks. */
const STEP_SOUND_EVERY = 90;
/** Every this many times the pointer leaves the bug, the voice says how to carry on, as a hint. */
const LEAVES_PER_HINT = 3;

/** Where a pointer event falls on the field, in field units. */
function toField(event: PointerEvent<HTMLDivElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
    y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
  };
}

/** A left and top in percent of the field, for an element centered on a field point. */
function placeAt(point: Point, size: number) {
  return {
    left: `${String((point.x / FIELD.width) * 100)}%`,
    top: `${String((point.y / FIELD.height) * 100)}%`,
    width: `${String((size / FIELD.width) * 100)}cqw`,
  };
}

/**
 * A winding sandy path across the grass, with a bug at one end and its flower at the other. The
 * bug walks along with the pointer while the pointer is on the path beside it, leaving a trail of
 * footprints. When the pointer leaves, the bug waits with a soft ring around it, and nothing goes
 * back. The round ends when the bug reaches its flower.
 */
export default function FollowTheTrailActivity({ level, kit }: ActivityProps<TrailLevel>) {
  const [walk, setWalk] = useState<Walk>({ progress: 0, with: false });
  const [done, setDone] = useState(false);
  const last = useRef<Point | null>(null);
  const leaves = useRef(0);
  const home = useRef<HTMLDivElement>(null);
  const line = level.points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ');
  const walked = [
    ...level.points.filter((_, index) => (level.along[index] ?? 0) <= walk.progress),
    pointAt(level, walk.progress),
  ]
    .map((point) => `${String(point.x)},${String(point.y)}`)
    .join(' ');
  const bugSize = Math.max(level.width * 1.1, 96);

  function moveTo(next: Walk): void {
    if (Math.floor(next.progress / STEP_SOUND_EVERY) > Math.floor(walk.progress / STEP_SOUND_EVERY)) kit.play('tap');
    if (walk.with && !next.with) {
      leaves.current += 1;
      if (leaves.current % LEAVES_PER_HINT === 0) kit.hint(strings.findTheBug);
    }
    setWalk(next);
    if (!arrived(level, next.progress)) return;
    setDone(true);
    setWalk({ progress: lengthOf(level), with: true });
    kit.feedback.correct({ at: home.current ?? undefined });
    kit.scope.setTimeout(() => kit.roundComplete({ mistakes: leaves.current }), ARRIVE_PAUSE_MS);
  }

  function moved(event: PointerEvent<HTMLDivElement>): void {
    if (done) return;
    const at = toField(event);
    const from = last.current ?? at;
    last.current = at;
    const next = follow(level, walk.progress, from, at);
    if (next.progress !== walk.progress || next.with !== walk.with) moveTo(next);
  }

  function left(): void {
    last.current = null;
    if (!done && walk.with) moveTo({ progress: walk.progress, with: false });
  }

  const bug = pointAt(level, walk.progress);
  const end = level.points.at(-1) ?? bug;
  return (
    <div className='trail-stage'>
      <div
        className='trail-field'
        data-traveler={level.traveler.bug}
        data-progress={Math.round(walk.progress)}
        data-with={walk.with}
        data-arrived={done}
        onPointerMove={moved}
        onPointerDown={moved}
        onPointerLeave={left}
      >
        <svg className='trail-path' viewBox={`0 0 ${String(FIELD.width)} ${String(FIELD.height)}`} aria-hidden='true'>
          <polyline points={line} className='trail-edge' style={{ strokeWidth: level.width + 10 }} />
          <polyline points={line} className='trail-ground' style={{ strokeWidth: level.width }} />
          <polyline points={walked} className='trail-steps' style={{ strokeWidth: level.width * 0.2 }} />
        </svg>
        <div ref={home} className='trail-home' style={placeAt(end, bugSize)}>
          <Emoji id={level.traveler.home} decorative className='trail-picture' />
        </div>
        <div className='trail-bug' data-waiting={!walk.with && !done} style={placeAt(bug, bugSize)}>
          <Emoji id={level.traveler.bug} decorative className='trail-picture' />
        </div>
      </div>
    </div>
  );
}
