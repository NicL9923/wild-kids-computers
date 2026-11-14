import type { CSSProperties } from 'react';
import { shapePath, type ShapeKind, type ShapePaint, type Turn } from './shapes.ts';

const PAINT: Readonly<Record<ShapePaint, string>> = {
  red: '#d9483b',
  orange: '#ee8a2a',
  yellow: '#f2c933',
  green: '#3f9a4c',
  blue: '#3a71cf',
  purple: '#8656b8',
  pink: '#e97fb0',
  brown: '#8c5b31',
  gray: '#8a948c',
  white: '#fbfbf7',
  sky: '#9fd4f0',
  dark: '#3a3f4a',
};

const OUTLINE = '#2b2420';

/** Half the width of a shape's edge, in the units of its box. */
const EDGE = 4;

/**
 * One shape, drawn to fill its box. A piece is painted with a dark edge. A hole is a dark,
 * sunken shape. An outline is a dashed edge that shows where a piece goes. Decorative: the
 * element around it names the shape.
 */
export function ShapeArt({
  kind,
  width,
  height,
  turn = 0,
  paint = 'gray',
  look,
  className,
  style,
}: {
  kind: ShapeKind;
  /** The box, in the same units as every other shape on screen. */
  width: number;
  height: number;
  turn?: Turn;
  paint?: ShapePaint;
  look: 'piece' | 'hole' | 'outline';
  className?: string;
  style?: CSSProperties;
}) {
  // One edge width for every shape, so big and small shapes read as one set.
  const edge = Math.min(EDGE, Math.min(width, height) / 6);
  const d = shapePath(kind, width, height, turn, edge);
  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      data-look={look}
      aria-hidden='true'
      focusable='false'
    >
      {look === 'piece' && (
        <path d={d} fill={PAINT[paint]} stroke={OUTLINE} strokeWidth={edge * 1.6} strokeLinejoin='round' />
      )}
      {look === 'hole' && (
        <path d={d} fill='#4a3a2c' stroke='#2a1f16' strokeWidth={edge * 1.6} strokeLinejoin='round' />
      )}
      {look === 'outline' && (
        <path
          d={d}
          fill='#ffffff'
          fillOpacity='0.55'
          stroke={OUTLINE}
          strokeWidth={edge * 1.4}
          strokeDasharray={`${String(edge * 3)} ${String(edge * 2)}`}
          strokeLinejoin='round'
        />
      )}
    </svg>
  );
}
