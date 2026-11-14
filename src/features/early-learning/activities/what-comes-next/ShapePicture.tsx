import { t } from '../../../../core/strings/defineStrings.ts';
import { colors, shapes } from '../../../../core/strings/shared/index.ts';
import { SHAPE_COLORS, type ShapeId } from './level.ts';

const PATHS: Readonly<Record<ShapeId, string>> = {
  circle: 'M50 10a40 40 0 1 1 0 80a40 40 0 1 1 0-80z',
  square: 'M14 14h72v72h-72z',
  triangle: 'M50 10l42 76h-84z',
  star: 'M50 6l12.4 27.5l30 3.3l-22.4 20.2l6.3 29.5l-26.3-15.1l-26.3 15.1l6.3-29.5l-22.4-20.2l30-3.3z',
  heart: 'M50 88c-24-17-40-32-40-50c0-12 9-22 21-22c8 0 15 4 19 11c4-7 11-11 19-11c12 0 21 10 21 22c0 18-16 33-40 50z',
  diamond: 'M50 6l38 44l-38 44l-38-44z',
};

/** The spoken name of a shape item, such as "red circle". */
export function shapeName(shape: ShapeId) {
  return [colors[SHAPE_COLORS[shape]], shapes[shape]] as const;
}

/** A shape drawn in its own color, with a dark edge so it shows on any background. */
export function ShapePicture({ shape }: { shape: ShapeId }) {
  const [color, name] = shapeName(shape);
  return (
    <svg viewBox='0 0 100 100' role='img' aria-label={`${t(color)} ${t(name)}`} className='wn-shape'>
      <path d={PATHS[shape]} className='wn-shape-fill' data-color={SHAPE_COLORS[shape]} />
    </svg>
  );
}
