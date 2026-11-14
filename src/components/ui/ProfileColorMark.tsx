import { isProfileColorId, PROFILE_COLORS, type ProfileColorShape } from './profileColors.ts';

/** Each shape fits a 24 by 24 box centered on (24, 24) in a 48 by 48 view. */
const SHAPES: Record<ProfileColorShape, string> = {
  circle: 'M24 13a11 11 0 1 1 0 22a11 11 0 1 1 0-22z',
  flower:
    'M24 12a5.5 5.5 0 0 1 5.5 6.5a5.5 5.5 0 0 1 0 11a5.5 5.5 0 0 1-11 0a5.5 5.5 0 0 1 0-11A5.5 5.5 0 0 1 24 12zm0 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  heart: 'M24 35 13.5 24.5a6.3 6.3 0 0 1 10.5-7a6.3 6.3 0 0 1 10.5 7z',
  triangle: 'M24 12 36 34H12z',
  square: 'M14 14h20v20H14z',
  leaf: 'M14 34c0-12 8-20 20-20 0 12-8 20-20 20zm2-2 14-14',
  diamond: 'M24 11 36 24 24 37 12 24z',
  moon: 'M28 12a12 12 0 1 0 8 19a10 10 0 0 1-8-19z',
};

export interface ProfileColorMarkProps {
  /** A saved color id. An id this build does not know shows the first color instead of nothing. */
  colorId: string;
  /** The accessible name. Leave it out when the mark sits inside a labelled control. */
  label?: string;
  /** A size token. Defaults to --wk-target-min. */
  size?: string;
}

/** A round swatch of a profile color with that color's shape on it. */
export function ProfileColorMark({ colorId, label, size }: ProfileColorMarkProps) {
  const id = isProfileColorId(colorId) ? colorId : 'sun';
  const shape = PROFILE_COLORS[id];
  const style = size === undefined ? undefined : { '--wk-swatch-size': size };
  return (
    <svg
      className='wk-profile-color'
      viewBox='0 0 48 48'
      style={style}
      data-color={id}
      data-shape={shape}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <circle
        cx='24'
        cy='24'
        r='22'
        style={{ fill: `var(--wk-profile-${id})`, stroke: 'var(--wk-color-border)', strokeWidth: 2 }}
      />
      <path
        d={SHAPES[shape]}
        style={{
          fill: `var(--wk-profile-${id}-mark)`,
          // The leaf's vein is cut out in the swatch color.
          stroke: shape === 'leaf' ? `var(--wk-profile-${id})` : 'none',
          strokeWidth: 2,
          strokeLinecap: 'round',
        }}
      />
    </svg>
  );
}
