import { useEffect, useRef } from 'react';
import type { Surface } from '../../../core/paint/surface.ts';

/** A small engine picture, such as a picker preview. Decorative: the button around it has the name. */
export function SurfaceImage({ surface, className }: { surface: Surface; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (ctx === null || ctx === undefined) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(surface.data), surface.width, surface.height), 0, 0);
  }, [surface]);
  return (
    <canvas
      ref={ref}
      width={surface.width}
      height={surface.height}
      aria-hidden='true'
      className={['wk-paint-preview', className].filter(Boolean).join(' ')}
    />
  );
}
