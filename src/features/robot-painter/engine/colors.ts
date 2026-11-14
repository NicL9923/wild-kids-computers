import { rgba, type Color } from '../../../core/paint/color.ts';
import type { PenColor } from './program.ts';

/**
 * Paint values for the pen palette. Each one reads clearly on white paper, and no two are
 * told apart by hue alone at the same lightness. A screen still names or marks each color,
 * because color is never the only signal.
 */
export const PEN_COLOR_VALUES: Readonly<Record<PenColor, Color>> = {
  blue: rgba(0x2c, 0x5f, 0xae),
  red: rgba(0xc8, 0x37, 0x2d),
  green: rgba(0x2f, 0x7a, 0x45),
  orange: rgba(0xe0, 0x7b, 0x00),
  purple: rgba(0x7a, 0x3f, 0xa0),
  black: rgba(0x1d, 0x31, 0x24),
};
