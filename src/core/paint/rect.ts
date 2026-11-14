/** An integer pixel rectangle. A rectangle with no area is empty, whatever its position. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

export function isEmptyRect(rect: Rect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}

/** The smallest integer rectangle that covers the real-valued box from (x0, y0) to (x1, y1). */
export function rectFromBounds(x0: number, y0: number, x1: number, y1: number): Rect {
  const left = Math.floor(Math.min(x0, x1));
  const top = Math.floor(Math.min(y0, y1));
  const right = Math.ceil(Math.max(x0, x1));
  const bottom = Math.ceil(Math.max(y0, y1));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function unionRect(a: Rect, b: Rect): Rect {
  if (isEmptyRect(a)) return b;
  if (isEmptyRect(b)) return a;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function intersectRect(a: Rect, b: Rect): Rect {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return EMPTY_RECT;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The part of a rectangle that lies on a width by height surface. */
export function clipRect(rect: Rect, width: number, height: number): Rect {
  return intersectRect(rect, { x: 0, y: 0, width, height });
}

export function growRect(rect: Rect, by: number): Rect {
  if (isEmptyRect(rect)) return rect;
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}
