import type { ClockTime } from './level.ts';

const NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);
const TICKS = Array.from({ length: 60 }, (_, index) => index);

/** A point at `radius` from the center, `turn` degrees clockwise from twelve. */
function at(radius: number, turn: number): { x: number; y: number } {
  const angle = ((turn - 90) * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(angle), y: 100 + radius * Math.sin(angle) };
}

/** The hands' angles, clockwise from twelve. The hour hand moves on between the hours. */
function handAngles(time: ClockTime): { hour: number; minute: number } {
  return { hour: (time.hour % 12) * 30 + time.minute / 2, minute: time.minute * 6 };
}

/**
 * A clock face with twelve numbers, minute marks, a short thick hour hand, and a long thin
 * minute hand. The hands differ in length, width, and color, so color is never the only way to
 * tell them apart. `ghost` draws faint dashed hands, as a hint of where the hands go. Hidden
 * from screen readers: a label with the time would give the answer away.
 */
export function ClockFace({ time, ghost }: { time: ClockTime; ghost?: ClockTime | null }) {
  const angles = handAngles(time);
  const ghostAngles = ghost === null || ghost === undefined ? null : handAngles(ghost);
  return (
    <svg className='tt-clock' viewBox='0 0 200 200' aria-hidden='true' focusable='false'>
      <circle cx='100' cy='100' r='96' fill='#fffdf7' stroke='#2b2420' strokeWidth='5' />
      {TICKS.map((tick) => {
        const outer = at(90, tick * 6);
        const inner = at(tick % 5 === 0 ? 81 : 86, tick * 6);
        return (
          <line
            key={tick}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke='#2b2420'
            strokeWidth={tick % 5 === 0 ? 3 : 1.2}
            strokeLinecap='round'
          />
        );
      })}
      {NUMBERS.map((number) => {
        const spot = at(68, number * 30);
        return (
          <text key={number} className='tt-number' x={spot.x} y={spot.y} textAnchor='middle' dominantBaseline='central'>
            {number}
          </text>
        );
      })}
      {ghostAngles !== null && (
        <g className='tt-ghost' data-ghost='true'>
          <line x1='100' y1='100' x2={at(46, ghostAngles.hour).x} y2={at(46, ghostAngles.hour).y} strokeWidth='9' />
          <line x1='100' y1='100' x2={at(76, ghostAngles.minute).x} y2={at(76, ghostAngles.minute).y} strokeWidth='5' />
        </g>
      )}
      <g className='tt-hand' data-hand='hour' style={{ rotate: `${String(angles.hour)}deg` }}>
        <line x1='100' y1='108' x2='100' y2='54' stroke='#2b2420' strokeWidth='9' strokeLinecap='round' />
      </g>
      <g className='tt-hand' data-hand='minute' style={{ rotate: `${String(angles.minute)}deg` }}>
        <line x1='100' y1='112' x2='100' y2='24' stroke='#2c5fae' strokeWidth='5' strokeLinecap='round' />
      </g>
      <circle cx='100' cy='100' r='6' fill='#2b2420' />
    </svg>
  );
}
