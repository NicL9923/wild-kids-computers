/**
 * Small original line glyphs for the toy desktop's own controls. They are generic shapes, not
 * any operating system's icons: a cross closes, a bar minimizes, a square maximizes. Each is
 * decorative; the button around it carries the name. Lines use currentColor.
 */
export type Glyph =
  | 'close'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'resize'
  | 'up'
  | 'previous'
  | 'next'
  | 'play'
  | 'stop'
  | 'search'
  | 'chevron-up'
  | 'chevron-down'
  | 'check';

const PATHS: Readonly<Record<Glyph, string>> = {
  close: 'M7 7 L17 17 M17 7 L7 17',
  minimize: 'M6 17 H18',
  maximize: 'M6 6 H18 V18 H6 Z',
  restore: 'M9 6 H18 V15 M6 9 H15 V18 H6 Z',
  resize: 'M18 8 L8 18 M18 13 L13 18 M18 18 L18 18',
  up: 'M12 18 V6 M6 12 L12 6 L18 12',
  previous: 'M15 6 L9 12 L15 18',
  next: 'M9 6 L15 12 L9 18',
  play: 'M8 6 L18 12 L8 18 Z',
  stop: 'M7 7 H17 V17 H7 Z',
  search: 'M10.5 16 A5.5 5.5 0 1 1 10.5 5 A5.5 5.5 0 1 1 10.5 16 M14.5 14.5 L19 19',
  'chevron-up': 'M6 15 L12 9 L18 15',
  'chevron-down': 'M6 9 L12 15 L18 9',
  check: 'M6 12.5 L10 16.5 L18 7.5',
};

export function ControlGlyph({ glyph, className }: { readonly glyph: Glyph; readonly className?: string }) {
  const filled = glyph === 'play' || glyph === 'stop';
  return (
    <svg
      className={['td-glyph', className].filter(Boolean).join(' ')}
      viewBox='0 0 24 24'
      aria-hidden='true'
      data-filled={filled}
    >
      <path d={PATHS[glyph]} />
    </svg>
  );
}
