import type { Finger } from './lessons.ts';

/**
 * Two hands seen from above, palms down, as they rest on the home row. Each finger carries its
 * name as `data-finger`, and the fingers for the next key are drawn in the accent color with a
 * thick outline, so they stand out by shape as well as color. Original art.
 */

interface FingerShape {
  readonly finger: Exclude<Finger, 'thumb'>;
  readonly x: number;
  readonly top: number;
}

const WIDTH = 640;
const FINGER_WIDTH = 42;
const PALM_TOP = 140;
const PALM_BOTTOM = 212;

/** The left hand's four fingers, little finger first. The right hand mirrors them. */
const LEFT: readonly FingerShape[] = [
  { finger: 'left-little', x: 52, top: 78 },
  { finger: 'left-ring', x: 100, top: 46 },
  { finger: 'left-middle', x: 148, top: 30 },
  { finger: 'left-pointer', x: 196, top: 50 },
];

const MIRROR: Readonly<Record<string, Exclude<Finger, 'thumb'>>> = {
  'left-little': 'right-little',
  'left-ring': 'right-ring',
  'left-middle': 'right-middle',
  'left-pointer': 'right-pointer',
};

const RIGHT: readonly FingerShape[] = LEFT.map((shape) => ({
  finger: MIRROR[shape.finger] ?? shape.finger,
  x: WIDTH - shape.x - FINGER_WIDTH,
  top: shape.top,
}));

export function Hands({ active }: { readonly active: readonly Finger[] }) {
  const on = (finger: Finger) => active.includes(finger);
  return (
    <svg className='tc-hands' viewBox={`0 0 ${String(WIDTH)} 230`} aria-hidden='true'>
      {[LEFT, RIGHT].map((hand, side) => {
        const left = Math.min(...hand.map((shape) => shape.x));
        const right = Math.max(...hand.map((shape) => shape.x)) + FINGER_WIDTH;
        // The thumb grows from the palm's inner edge and reaches in toward the space bar.
        const thumbX = side === 0 ? right - 40 : left - 38;
        const thumbTurn = side === 0 ? -28 : 28;
        return (
          <g key={side === 0 ? 'left' : 'right'} className='tc-hand'>
            <rect
              className='tc-finger'
              data-finger='thumb'
              data-active={on('thumb')}
              x={thumbX}
              y={PALM_TOP + 20}
              width={78}
              height={FINGER_WIDTH}
              rx={FINGER_WIDTH / 2}
              transform={`rotate(${String(thumbTurn)} ${String(thumbX + 39)} ${String(PALM_TOP + 41)})`}
            />
            <rect
              className='tc-palm'
              x={left}
              y={PALM_TOP}
              width={right - left}
              height={PALM_BOTTOM - PALM_TOP}
              rx={34}
            />
            {hand.map((shape) => (
              <rect
                key={shape.finger}
                className='tc-finger'
                data-finger={shape.finger}
                data-active={on(shape.finger)}
                x={shape.x}
                y={shape.top}
                width={FINGER_WIDTH}
                height={PALM_TOP - shape.top + 30}
                rx={FINGER_WIDTH / 2}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
