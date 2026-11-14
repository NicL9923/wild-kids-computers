import type { Band } from '../../../core/bands.ts';
import { rgba, type Color } from '../../../core/paint/color.ts';
import type { FillStyle, PaintEffect, PatternId, ShapeKind } from '../../../core/paint/types.ts';
import { partnerTone } from '../../../core/paint/patterns.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { strings as colorNames } from '../../../core/strings/shared/colors.ts';
import { strings as shapeNames } from '../../../core/strings/shared/shapes.ts';
import { paintEffects } from '../../../registry/paint.ts';
import { strings as effectNames } from '../effects/strings.ts';
import { strings } from '../strings.ts';
import type { PenBehavior } from './penInput.ts';

/**
 * What the studio offers each band. When two needs compete, the youngest band wins: `band-3-5`
 * sees five tools, ten colors, three sizes, and six effects, and nothing that needs reading.
 */

export type StudioToolId = 'brush' | 'eraser' | 'line' | 'shapes' | 'fill' | 'text' | 'stamp' | 'effects';

const YOUNGEST_TOOLS: readonly StudioToolId[] = ['brush', 'stamp', 'fill', 'eraser', 'effects'];
const ALL_TOOLS: readonly StudioToolId[] = ['brush', 'eraser', 'line', 'shapes', 'fill', 'text', 'stamp', 'effects'];

export function toolsFor(band: Band): readonly StudioToolId[] {
  return band === 'band-3-5' ? YOUNGEST_TOOLS : ALL_TOOLS;
}

export function isYoungest(band: Band): boolean {
  return band === 'band-3-5';
}

export const TOOL_NAMES: Readonly<Record<StudioToolId, SpokenHandle>> = {
  brush: strings['tool-brush'],
  eraser: strings['tool-eraser'],
  line: strings['tool-line'],
  shapes: strings['tool-shapes'],
  fill: strings['tool-fill'],
  text: strings['tool-text'],
  stamp: strings['tool-stamp'],
  effects: strings['tool-effects'],
};

/** The effects a 3-year-old sees: the most fun and the least confusing, each obvious at once. */
export const YOUNGEST_EFFECT_IDS = [
  'confetti',
  'sparkleDust',
  'soapBubbles',
  'petalShower',
  'swirl',
  'mirror',
] as const;

export function effectsFor(band: Band): readonly PaintEffect[] {
  if (!isYoungest(band)) return paintEffects;
  return YOUNGEST_EFFECT_IDS.flatMap((id) => paintEffects.filter((effect) => effect.id === id));
}

/** Fill and stamps act once per click. Everything else paints while the pen is down. */
export function penBehavior(tool: StudioToolId, effect: PaintEffect | undefined): PenBehavior {
  if (tool === 'fill' || tool === 'stamp' || tool === 'text') return 'once';
  if (tool === 'effects' && effect?.group === 'whole-picture') return 'once';
  return 'stroke';
}

export interface SizeChoice {
  readonly id: 'tiny' | 'small' | 'medium' | 'big' | 'huge';
  /** Brush diameter, line width, or letter height, in document pixels. */
  readonly brush: number;
  /** The longest side of a stamp, in document pixels. */
  readonly stamp: number;
  /** The height of a capital letter, in document pixels. */
  readonly letters: number;
}

const SIZES: readonly SizeChoice[] = [
  { id: 'tiny', brush: 6, stamp: 60, letters: 28 },
  { id: 'small', brush: 14, stamp: 100, letters: 44 },
  { id: 'medium', brush: 32, stamp: 170, letters: 70 },
  { id: 'big', brush: 64, stamp: 260, letters: 110 },
  { id: 'huge', brush: 120, stamp: 380, letters: 170 },
];

export function sizesFor(band: Band): readonly SizeChoice[] {
  // Three sizes a 3-year-old can tell apart at a glance, none too thin to see on the paper.
  return isYoungest(band) ? SIZES.filter((size) => ['medium', 'big', 'huge'].includes(size.id)) : SIZES;
}

/** The size a band starts with: the middle one. */
export function defaultSizeIndex(band: Band): number {
  return Math.floor(sizesFor(band).length / 2);
}

export const SIZE_NAMES: Readonly<Record<SizeChoice['id'], SpokenHandle>> = {
  tiny: strings['size-tiny'],
  small: strings['size-small'],
  medium: strings['size-medium'],
  big: strings['size-big'],
  huge: strings['size-huge'],
};

export interface PaletteColor {
  readonly id: string;
  readonly color: Color;
  readonly name: SpokenHandle;
}

const PALETTE: readonly PaletteColor[] = [
  { id: 'red', color: rgba(220, 38, 38), name: colorNames.red },
  { id: 'orange', color: rgba(245, 130, 32), name: colorNames.orange },
  { id: 'yellow', color: rgba(250, 204, 21), name: colorNames.yellow },
  { id: 'green', color: rgba(34, 160, 70), name: colorNames.green },
  { id: 'sky', color: rgba(64, 182, 235), name: strings.skyBlue },
  { id: 'blue', color: rgba(37, 84, 199), name: colorNames.blue },
  { id: 'purple', color: rgba(128, 60, 190), name: colorNames.purple },
  { id: 'pink', color: rgba(240, 110, 170), name: colorNames.pink },
  { id: 'brown', color: rgba(130, 82, 45), name: colorNames.brown },
  { id: 'gray', color: rgba(140, 140, 140), name: colorNames.gray },
  { id: 'black', color: rgba(30, 30, 30), name: colorNames.black },
  { id: 'white', color: rgba(255, 255, 255), name: colorNames.white },
];

export function paletteFor(band: Band): readonly PaletteColor[] {
  return isYoungest(band) ? PALETTE.filter((color) => color.id !== 'sky' && color.id !== 'gray') : PALETTE;
}

export const SHAPE_NAMES: Readonly<Record<ShapeKind, SpokenHandle>> = {
  rectangle: shapeNames.rectangle,
  ellipse: shapeNames.oval,
  triangle: shapeNames.triangle,
  star: shapeNames.star,
  heart: shapeNames.heart,
  diamond: shapeNames.diamond,
  hexagon: shapeNames.hexagon,
  moon: strings.moon,
  flower: strings.flower,
  arrow: strings.arrow,
};

export type FillStyleId = 'solid' | 'gradient' | 'glow' | PatternId;

export const FILL_STYLE_IDS: readonly FillStyleId[] = [
  'solid',
  'gradient',
  'glow',
  'stripes',
  'checks',
  'dots',
  'zigzag',
];

export const FILL_STYLE_NAMES: Readonly<Record<FillStyleId, SpokenHandle>> = {
  solid: strings['fill-solid'],
  gradient: strings['fill-gradient'],
  glow: strings['fill-glow'],
  stripes: strings['fill-stripes'],
  checks: strings['fill-checks'],
  dots: strings['fill-dots'],
  zigzag: strings['fill-zigzag'],
};

/** The engine's fill style for a choice. The second color is a partner tone of the main one. */
export function fillStyle(id: FillStyleId, color: Color): FillStyle {
  switch (id) {
    case 'solid':
      return { kind: 'solid' };
    case 'gradient':
      return { kind: 'gradient', to: partnerTone(color), direction: 'vertical' };
    case 'glow':
      return { kind: 'gradient', to: partnerTone(color), direction: 'radial' };
    default:
      return { kind: 'pattern', pattern: id, background: partnerTone(color) };
  }
}

/** Stamp rotation steps for older bands, in degrees. */
export const STAMP_TURN = 45;

const TIP_NAMES: Readonly<Record<string, SpokenHandle>> = {
  round: strings['tip-round'],
  soft: strings['tip-soft'],
  marker: strings['tip-marker'],
  chalk: strings['tip-chalk'],
  crayon: strings['tip-crayon'],
  spray: strings['tip-spray'],
  calligraphy: strings['tip-calligraphy'],
  dotted: strings['tip-dotted'],
  rainbow: strings['tip-rainbow'],
  stripes: strings['tip-stripes'],
  checks: strings['tip-checks'],
  zigzag: strings['tip-zigzag'],
};

const isEffectName = (id: string): id is keyof typeof effectNames => Object.hasOwn(effectNames, id);

/** The spoken name of a brush tip. A test proves every registered tip has one. */
export function tipName(id: string): SpokenHandle {
  return TIP_NAMES[id] ?? strings['tip-round'];
}

/** The spoken name of an effect. A test proves every registered effect has one. */
export function effectName(id: string): SpokenHandle {
  return isEffectName(id) ? effectNames[id] : strings['tool-effects'];
}

/** Whether every tip and effect id has its own name, for the registry test. */
export function missingNames(tipIds: readonly string[], effectIds: readonly string[]): string[] {
  return [...tipIds.filter((id) => TIP_NAMES[id] === undefined), ...effectIds.filter((id) => !isEffectName(id))];
}

/** A fully saturated mixed color from a hue in degrees and a lightness from 0 (black) to 100 (white). */
export function mixedColor(hueDegrees: number, lightness: number): Color {
  const h = (((hueDegrees % 360) + 360) % 360) / 60;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  const chroma = 1 - Math.abs(2 * l - 1);
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] =
    h < 1
      ? [chroma, x, 0]
      : h < 2
        ? [x, chroma, 0]
        : h < 3
          ? [0, chroma, x]
          : h < 4
            ? [0, x, chroma]
            : h < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = l - chroma / 2;
  return rgba((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Whether a check mark on this color should be dark, so it stands out on light colors. */
export function needsDarkMark(color: Color): boolean {
  return (299 * color.r + 587 * color.g + 114 * color.b) / 1000 > 150;
}

export const cssColor = (color: Color): string => `rgb(${color.r} ${color.g} ${color.b})`;
