import type { Picture } from './level.ts';

/** Every picture is drawn in a 120 by 120 box. */
const BOX = 120;
const RADIUS = 54;

interface Part {
  readonly key: number;
  readonly shaded: boolean;
}

function circleParts(picture: Picture, parts: readonly Part[]) {
  let start = -Math.PI / 2;
  return parts.map((part) => {
    const share = picture.parts[part.key] ?? 0;
    const end = start + share * Math.PI * 2;
    const [x0, y0] = [Math.cos(start) * RADIUS, Math.sin(start) * RADIUS];
    const [x1, y1] = [Math.cos(end) * RADIUS, Math.sin(end) * RADIUS];
    const large = share > 0.5 ? 1 : 0;
    start = end;
    const d = `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${String(RADIUS)} ${String(RADIUS)} 0 ${String(large)} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    return (
      <path
        key={part.key}
        d={d}
        data-shaded={part.shaded}
        transform={`translate(${String(BOX / 2)} ${String(BOX / 2)})`}
      />
    );
  });
}

function barParts(picture: Picture, parts: readonly Part[]) {
  const width = 112;
  let x = (BOX - width) / 2;
  return parts.map((part) => {
    const w = (picture.parts[part.key] ?? 0) * width;
    const rect = <rect key={part.key} x={x} y={32} width={w} height={56} data-shaded={part.shaded} />;
    x += w;
    return rect;
  });
}

function gridParts(parts: readonly Part[]) {
  const columns = parts.length / 2;
  const cell = Math.min(112 / columns, 56);
  const left = (BOX - cell * columns) / 2;
  const top = (BOX - cell * 2) / 2;
  return parts.map((part) => (
    <rect
      key={part.key}
      x={left + (part.key % columns) * cell}
      y={top + Math.floor(part.key / columns) * cell}
      width={cell}
      height={cell}
      data-shaded={part.shaded}
    />
  ));
}

/**
 * A circle, bar, or grid cut into parts, with some parts shaded. The shaded parts are dark and
 * the rest are white, so the difference is in lightness as well as color.
 */
export function FractionPicture({ picture }: { picture: Picture }) {
  const parts = picture.parts.map((_, key) => ({ key, shaded: picture.shaded.includes(key) }));
  const drawn =
    picture.shape === 'circle'
      ? circleParts(picture, parts)
      : picture.shape === 'bar'
        ? barParts(picture, parts)
        : gridParts(parts);
  return (
    <svg
      className='fraction-picture'
      viewBox={`0 0 ${String(BOX)} ${String(BOX)}`}
      aria-hidden='true'
      focusable='false'
    >
      {drawn}
    </svg>
  );
}
