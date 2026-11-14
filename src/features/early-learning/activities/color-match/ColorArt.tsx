import type { ReactNode } from 'react';
import type { MatchColor, ToyKind } from './level.ts';

/**
 * The paint for each color, and a pattern of its own for a child who sees some colors alike.
 * Each pattern differs in direction or mark, not just density, so no two read the same.
 */
export const PAINT: Readonly<Record<MatchColor, string>> = {
  red: '#d93a3a',
  orange: '#f08a24',
  yellow: '#f5cf2f',
  green: '#3a9a4a',
  blue: '#2f6cd0',
  purple: '#8450b8',
  pink: '#ef7fb2',
  brown: '#8a5a2e',
};

/** Marks on light paint are dark; on dark paint, white. */
const MARK: Readonly<Record<MatchColor, string>> = {
  red: '#ffffff',
  orange: '#3b2410',
  yellow: '#3b2f10',
  green: '#ffffff',
  blue: '#ffffff',
  purple: '#ffffff',
  pink: '#3b1027',
  brown: '#ffffff',
};

const OUTLINE = '#2b2420';

/** The marks of one pattern tile, 16 by 16 units, in the ink for its paint. */
const MARKS: Readonly<Record<MatchColor, (ink: string) => ReactNode>> = {
  red: (ink) => <rect x='0' y='5' width='16' height='5' fill={ink} />,
  orange: (ink) => <circle cx='8' cy='8' r='3.2' fill={ink} />,
  yellow: (ink) => <path d='M0 11l4-6 4 6 4-6 4 6' fill='none' stroke={ink} strokeWidth='2.4' />,
  green: (ink) => <path d='M-4 4l8-8M0 16L16 0M12 20l8-8' stroke={ink} strokeWidth='3.2' />,
  blue: (ink) => <rect x='5' y='0' width='5' height='16' fill={ink} />,
  purple: (ink) => (
    <>
      <rect x='0' y='0' width='8' height='8' fill={ink} />
      <rect x='8' y='8' width='8' height='8' fill={ink} />
    </>
  ),
  pink: (ink) => <circle cx='8' cy='8' r='4' fill='none' stroke={ink} strokeWidth='2.2' />,
  brown: (ink) => <path d='M8 3v10M3 8h10' stroke={ink} strokeWidth='2.6' />,
};

const patternId = (color: MatchColor) => `cm-pattern-${color}`;

/** The pattern definitions, once per stage. Decorative. */
export function PatternDefs({ colors }: { colors: readonly MatchColor[] }) {
  return (
    <svg className='cm-defs' aria-hidden='true' focusable='false'>
      <defs>
        {colors.map((color) => (
          <pattern key={color} id={patternId(color)} width='16' height='16' patternUnits='userSpaceOnUse'>
            <g opacity='0.75'>{MARKS[color](MARK[color])}</g>
          </pattern>
        ))}
      </defs>
    </svg>
  );
}

/** Paint for a shape: the color, and its pattern over it when patterns are on. */
function Paint({
  color,
  patterns,
  children,
}: {
  color: MatchColor;
  patterns: boolean;
  children: (fill: string) => ReactNode;
}) {
  return (
    <>
      {children(PAINT[color])}
      {patterns && children(`url(#${patternId(color)})`)}
    </>
  );
}

/** One toy, drawn in its color. Decorative: the button around it says the color. */
export function ToyArt({ kind, color, patterns }: { kind: ToyKind; color: MatchColor; patterns: boolean }) {
  return (
    <svg className='cm-toy-art' viewBox='0 0 100 100' aria-hidden='true' focusable='false'>
      {kind === 'ball' && (
        <>
          <Paint color={color} patterns={patterns}>
            {(fill) => <circle cx='50' cy='52' r='40' fill={fill} stroke={OUTLINE} strokeWidth='4' />}
          </Paint>
          <ellipse cx='36' cy='36' rx='10' ry='7' fill='#ffffff' opacity='0.55' />
        </>
      )}
      {kind === 'balloon' && (
        <>
          <path d='M50 78c-2 8 4 10 0 18' fill='none' stroke={OUTLINE} strokeWidth='3' />
          <Paint color={color} patterns={patterns}>
            {(fill) => (
              <path
                d='M50 6c19 0 32 15 32 33 0 20-16 37-32 39C34 76 18 59 18 39 18 21 31 6 50 6z'
                fill={fill}
                stroke={OUTLINE}
                strokeWidth='4'
              />
            )}
          </Paint>
          <path d='M44 82h12l-6-6z' fill={OUTLINE} />
          <ellipse cx='38' cy='26' rx='7' ry='10' fill='#ffffff' opacity='0.5' />
        </>
      )}
      {kind === 'block' && (
        <>
          <Paint color={color} patterns={patterns}>
            {(fill) => (
              <rect x='14' y='16' width='72' height='72' rx='10' fill={fill} stroke={OUTLINE} strokeWidth='4' />
            )}
          </Paint>
          <rect
            x='26'
            y='28'
            width='48'
            height='48'
            rx='6'
            fill='none'
            stroke={OUTLINE}
            strokeWidth='3'
            opacity='0.5'
          />
        </>
      )}
      {kind === 'cup' && (
        <>
          <path d='M70 38h6a12 12 0 0 1 0 24h-6' fill='none' stroke={OUTLINE} strokeWidth='6' />
          <Paint color={color} patterns={patterns}>
            {(fill) => (
              <path
                d='M16 26h56v50a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z'
                fill={fill}
                stroke={OUTLINE}
                strokeWidth='4'
              />
            )}
          </Paint>
        </>
      )}
    </svg>
  );
}

/** The front of a box painted in its color. Decorative: the box around it says the color. */
export function BoxArt({ color, patterns }: { color: MatchColor; patterns: boolean }) {
  return (
    <svg className='cm-box-art' viewBox='0 0 160 100' preserveAspectRatio='none' aria-hidden='true' focusable='false'>
      <Paint color={color} patterns={patterns}>
        {(fill) => <path d='M6 8h148l-8 86H14z' fill={fill} stroke={OUTLINE} strokeWidth='4' strokeLinejoin='round' />}
      </Paint>
      <path d='M2 4h156v12H2z' fill={OUTLINE} opacity='0.85' />
    </svg>
  );
}

/** A small swatch in stripes, for the pattern switch. */
export function PatternIcon() {
  return (
    <svg className='cm-pattern-icon' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <rect x='2' y='2' width='20' height='20' rx='5' fill='none' stroke='currentColor' strokeWidth='2.5' />
      <path d='M6 18L18 6M3 12l9-9M12 21l9-9' stroke='currentColor' strokeWidth='2.5' />
    </svg>
  );
}
