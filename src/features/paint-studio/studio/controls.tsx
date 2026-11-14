import type { ComponentProps, ReactNode } from 'react';
import { Emoji } from '../../../components/ui/Emoji.tsx';
import type { EmojiId } from '../../../core/strings/shared/emoji.ts';

/**
 * A studio control: a picture with its name. The youngest band sees only the picture, and every
 * band's screen reader hears the name. `pressed` marks the chosen tool, color, or size with a
 * ring and a check, so color is never the only sign.
 */
export function StudioButton({
  label,
  picture,
  pressed,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'type' | 'children'> & { label: string; picture: ReactNode; pressed?: boolean }) {
  return (
    <button
      {...props}
      type='button'
      aria-pressed={pressed}
      className={['wk-button wk-paint-button', className].filter(Boolean).join(' ')}
    >
      <span className='wk-paint-button-picture'>{picture}</span>
      <span className='wk-reading-text wk-paint-button-label'>{label}</span>
      {pressed === true && <CheckMark />}
    </button>
  );
}

export function CheckMark() {
  return (
    <span className='wk-paint-check' aria-hidden='true'>
      <svg viewBox='0 0 24 24' focusable='false'>
        <path
          d='M5 12.5l4.5 4.5L19 7.5'
          fill='none'
          stroke='currentColor'
          strokeWidth='3.5'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    </span>
  );
}

export function EmojiPicture({ id }: { id: EmojiId }) {
  return <Emoji id={id} decorative className='wk-paint-emoji' />;
}

/** Small line pictures for controls that no emoji shows well. They draw in the text color. */
type GlyphName = 'paper' | 'shapes' | 'letters' | 'line' | 'bigger' | 'smaller' | 'flip' | 'turn';

const GLYPHS: Readonly<Record<GlyphName, ReactNode>> = {
  paper: (
    <>
      <path d='M5 2.5h9.5l4.5 4.5v14.5H5z' fill='none' stroke='currentColor' strokeWidth='2' strokeLinejoin='round' />
      <path d='M14.5 2.5V7H19' fill='none' stroke='currentColor' strokeWidth='2' strokeLinejoin='round' />
      <path d='M12 10.5v7M8.5 14h7' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' />
    </>
  ),
  shapes: (
    <>
      <path d='M2.5 21.5l5.5-10 5.5 10z' fill='currentColor' />
      <circle cx='17' cy='7' r='4.5' fill='none' stroke='currentColor' strokeWidth='2.5' />
      <rect x='14' y='14' width='7.5' height='7.5' rx='1' fill='none' stroke='currentColor' strokeWidth='2.5' />
    </>
  ),
  letters: (
    <path
      d='M4 21L11 3h2l7 18M7 14h10'
      fill='none'
      stroke='currentColor'
      strokeWidth='3'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  ),
  line: <path d='M4 20L20 4' stroke='currentColor' strokeWidth='3.5' strokeLinecap='round' />,
  bigger: (
    <>
      <circle cx='12' cy='12' r='9' fill='currentColor' opacity='0.2' />
      <path d='M12 6v12M6 12h12' stroke='currentColor' strokeWidth='3.5' strokeLinecap='round' />
    </>
  ),
  smaller: (
    <>
      <circle cx='12' cy='12' r='5' fill='currentColor' opacity='0.2' />
      <path d='M7 12h10' stroke='currentColor' strokeWidth='3.5' strokeLinecap='round' />
    </>
  ),
  flip: (
    <>
      <path d='M12 3v18' stroke='currentColor' strokeWidth='2' strokeDasharray='3 3' />
      <path d='M9 6L3 17h6z' fill='currentColor' />
      <path d='M15 6l6 11h-6z' fill='none' stroke='currentColor' strokeWidth='2' strokeLinejoin='round' />
    </>
  ),
  turn: (
    <>
      <path d='M19 12a7 7 0 1 1-2.05-4.95' fill='none' stroke='currentColor' strokeWidth='3' strokeLinecap='round' />
      <path
        d='M20 3v6h-6'
        fill='none'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </>
  ),
};

export function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg className='wk-paint-glyph' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      {GLYPHS[name]}
    </svg>
  );
}

/** A dot whose size shows a brush size. */
export function SizeDot({ fraction }: { fraction: number }) {
  return (
    <span className='wk-paint-size-dot' aria-hidden='true'>
      <span style={{ width: `${Math.round(fraction * 100)}%`, height: `${Math.round(fraction * 100)}%` }} />
    </span>
  );
}
