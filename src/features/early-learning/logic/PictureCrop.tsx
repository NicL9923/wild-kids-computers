import { emojiUrl } from '../../../registry/emoji.ts';
import type { Scene } from './scene.ts';
import './logic.css';

/** A picture to cut into pieces: a bundled scene, or an image such as a painting from the gallery. */
export type PictureSource =
  | { readonly kind: 'scene'; readonly scene: Scene }
  | { readonly kind: 'image'; readonly url: string; readonly width: number; readonly height: number };

export interface Crop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const sizeOf = (source: PictureSource) =>
  source.kind === 'scene' ? { width: source.scene.width, height: source.scene.height } : source;

/**
 * One part of a picture, drawn to fill its box: a piece of a jigsaw or a tile of a sliding puzzle.
 * Leave out `crop` for the whole picture. Decorative: the element around it gives the name.
 */
export function PictureCrop({ source, crop, className }: { source: PictureSource; crop?: Crop; className?: string }) {
  const { width, height } = sizeOf(source);
  const box = crop ?? { x: 0, y: 0, width, height };
  return (
    <svg
      className={className === undefined ? 'lg-crop' : `lg-crop ${className}`}
      viewBox={`${String(box.x)} ${String(box.y)} ${String(box.width)} ${String(box.height)}`}
      preserveAspectRatio='none'
      aria-hidden='true'
      focusable='false'
    >
      {source.kind === 'image' ? (
        <image href={source.url} x={0} y={0} width={width} height={height} preserveAspectRatio='none' />
      ) : (
        <SceneContent scene={source.scene} />
      )}
    </svg>
  );
}

function SceneContent({ scene }: { scene: Scene }) {
  const { width, height, horizon } = scene;
  const wave = height * 0.03;
  // A gentle hill or swell along the horizon, from the left edge to the right.
  const ground = `M0 ${String(horizon)} Q${String(width * 0.25)} ${String(horizon - wave)} ${String(width * 0.5)} ${String(horizon)} T${String(width)} ${String(horizon)} V${String(height)} H0 Z`;
  return (
    <g data-theme={scene.theme}>
      <rect className='lg-sky' x={0} y={0} width={width} height={height} />
      <path className='lg-ground' d={ground} />
      {scene.pictures.map((picture) => (
        <image
          key={picture.emoji}
          href={emojiUrl(picture.emoji)}
          x={picture.x - picture.size / 2}
          y={picture.y - picture.size / 2}
          width={picture.size}
          height={picture.size}
        />
      ))}
    </g>
  );
}
