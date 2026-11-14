import type { ReactNode } from 'react';
import { Emoji } from '../../../components/ui/Emoji.tsx';
import { PEN_COLOR_VALUES } from '../engine/colors.ts';
import type { BlockDraft, MoveDirection, PenColor } from '../engine/program.ts';
import { COLOR_SHAPES, NAME_PICTURES } from './speech.ts';

/**
 * The picture of each block. Lines use `currentColor`, so a block takes its ink from the theme;
 * only a pen color shows its own paint. Every picture is decorative: the button around it is
 * named and speaks.
 */

/** A pen color as CSS, from the same paint values the drawing uses. */
export function penColorCss(color: PenColor): string {
  const { r, g, b } = PEN_COLOR_VALUES[color];
  return `rgb(${String(r)} ${String(g)} ${String(b)})`;
}

const ARROW_TURNS: Readonly<Record<MoveDirection, number>> = { up: 0, right: 90, down: 180, left: 270 };

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className='rp-picture' viewBox='0 0 48 48' aria-hidden='true' focusable='false'>
      {children}
    </svg>
  );
}

export function ArrowPicture({ direction }: { direction: MoveDirection }) {
  return (
    <Svg>
      <g transform={`rotate(${String(ARROW_TURNS[direction])} 24 24)`}>
        <path d='M24 6 40 24H30v18H18V24H8z' fill='currentColor' />
      </g>
    </Svg>
  );
}

/** A shape cue for a pen color, so a color is never told by hue alone. */
export function ColorShape({ color }: { color: PenColor }) {
  const shape = COLOR_SHAPES[color];
  const common = { className: 'rp-color-shape', strokeWidth: 3, strokeLinejoin: 'round' as const };
  switch (shape) {
    case 'circle':
      return <circle cx='24' cy='24' r='9' {...common} />;
    case 'square':
      return <rect x='15' y='15' width='18' height='18' {...common} />;
    case 'triangle':
      return <path d='M24 13 35 33H13z' {...common} />;
    case 'diamond':
      return <path d='M24 12 36 24 24 36 12 24z' {...common} />;
    case 'hexagon':
      return <path d='M24 13 34 19v12l-10 6-10-6V19z' {...common} />;
    default:
      return <path d='M19 13h10v6h6v10h-6v6H19v-6h-6V19h6z' {...common} />;
  }
}

export function ColorPicture({ color }: { color: PenColor }) {
  return (
    <Svg>
      <rect x='4' y='4' width='40' height='40' rx='10' style={{ fill: penColorCss(color) }} />
      <ColorShape color={color} />
    </Svg>
  );
}

export function RepeatPicture() {
  return (
    <Svg>
      <path d='M38 24a14 14 0 1 1-5-10.7' fill='none' stroke='currentColor' strokeWidth='5' strokeLinecap='round' />
      <path d='M28 6h11v11z' fill='currentColor' />
    </Svg>
  );
}

function PenPicture({ down }: { down: boolean }) {
  // A pencil above a line: touching it with the pen down, lifted with a gap with the pen up.
  const lift = down ? 0 : -9;
  return (
    <Svg>
      <path d='M4 42h40' stroke='currentColor' strokeWidth='3' strokeLinecap='round' opacity={down ? 1 : 0.45} />
      <g transform={`translate(0 ${String(lift)}) rotate(35 24 38)`}>
        <rect x='19' y='6' width='10' height='24' rx='2' fill='currentColor' />
        <path d='M19 30h10l-5 9z' fill='currentColor' />
      </g>
    </Svg>
  );
}

export function ForwardPicture() {
  return (
    <Svg>
      <circle cx='24' cy='40' r='5' fill='currentColor' />
      <path d='M24 34V12' stroke='currentColor' strokeWidth='5' strokeLinecap='round' />
      <path d='M14 18 24 6l10 12z' fill='currentColor' />
    </Svg>
  );
}

export function TurnPicture({ direction }: { direction: 'left' | 'right' }) {
  return (
    <Svg>
      <g transform={direction === 'left' ? 'translate(48 0) scale(-1 1)' : undefined}>
        <path
          d='M12 42V26a12 12 0 0 1 12-12h10'
          fill='none'
          stroke='currentColor'
          strokeWidth='5'
          strokeLinecap='round'
        />
        <path d='M32 4l12 10-12 10z' fill='currentColor' />
      </g>
    </Svg>
  );
}

export function NewBlockPicture() {
  return (
    <Svg>
      <rect
        x='5'
        y='9'
        width='38'
        height='30'
        rx='8'
        fill='none'
        stroke='currentColor'
        strokeWidth='4'
        strokeDasharray='6 4'
      />
      <path d='M24 16v16M16 24h16' stroke='currentColor' strokeWidth='5' strokeLinecap='round' />
    </Svg>
  );
}

/** The picture of any block. A defined block shows the picture of its name. */
export function BlockPicture({ block }: { block: BlockDraft }) {
  switch (block.kind) {
    case 'move':
      return <ArrowPicture direction={block.direction} />;
    case 'forward':
      return <ForwardPicture />;
    case 'turn':
      return <TurnPicture direction={block.direction} />;
    case 'repeat':
      return <RepeatPicture />;
    case 'pen-up':
      return <PenPicture down={false} />;
    case 'pen-down':
      return <PenPicture down />;
    case 'color':
      return <ColorPicture color={block.color} />;
    default:
      return <Emoji id={NAME_PICTURES[block.name]} decorative className='rp-picture' />;
  }
}
