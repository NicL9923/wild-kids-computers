import type { CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { shapes as shapeNames } from '../../../../core/strings/shared/index.ts';
import { ShapeArt } from '../../shapes/ShapeArt.tsx';
import type { ShapeKind } from '../../shapes/shapes.ts';
import { useSortRound } from '../../sorting/useSortRound.ts';
import { FORMS, type PieceId, type ShapeSorterLevel } from './level.ts';
import './shapeSorter.css';
import { strings } from './strings.ts';

type HoleId = `hole-${ShapeKind}`;
const holeId = (shape: ShapeKind): HoleId => `hole-${shape}`;

/** A box sized to the shape's form, in units of the stage's shape size. */
function formStyle(shape: ShapeKind): CSSProperties {
  const form = FORMS[shape];
  return {
    width: `calc(var(--ss-unit) * ${String(form.width / 100)})`,
    height: `calc(var(--ss-unit) * ${String(form.height / 100)})`,
  };
}

/**
 * Shapes on top and a lid with holes below. A shape says its name when the pointer rests on it
 * or it gets focus. The child carries a shape to a hole: in its own hole it drops in and its name
 * is said again. In another hole it goes back home with a neutral nudge. The holes are all one
 * dark color, so only the shape tells where a piece goes.
 */
export default function ShapeSorterActivity({ level, kit }: ActivityProps<ShapeSorterLevel>) {
  const shapeOf = (id: PieceId): ShapeKind => {
    const piece = level.pieces.find((each) => each.id === id);
    if (piece === undefined) throw new Error(`Shape sorter has no ${id}.`);
    return piece.shape;
  };
  const { carry, placed, hint, attachTray } = useSortRound<PieceId, HoleId>(kit, {
    required: level.pieces.map((piece) => piece.id),
    targets: level.holes.map(holeId),
    fits: (piece, hole) => hole === holeId(shapeOf(piece)),
    holds: 'one',
    onPlaced: (piece) => [shapeNames[shapeOf(piece)]],
    onDone: (piece) => [shapeNames[shapeOf(piece)]],
    onMiss: (piece) => [shapeNames[shapeOf(piece)]],
  });

  return (
    <div className='ss-stage' data-count={level.pieces.length}>
      <ul ref={attachTray} className='ss-pieces' aria-label={t(strings.shapes)}>
        {level.pieces.map((piece) => (
          <li key={piece.id} className='ss-slot' style={formStyle(piece.shape)}>
            {!placed.has(piece.id) && (
              <button
                type='button'
                className='ss-piece'
                data-piece={piece.id}
                data-shape={piece.shape}
                data-hint={hint?.item === piece.id}
                aria-label={t(shapeNames[piece.shape])}
                onPointerEnter={() => void kit.speak(shapeNames[piece.shape])}
                onFocus={() => void kit.speak(shapeNames[piece.shape])}
                {...carry.item(piece.id)}
              >
                <ShapeArt kind={piece.shape} {...FORMS[piece.shape]} paint={piece.paint} look='piece' />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ul className='ss-lid' aria-label={t(strings.holes)}>
        {level.holes.map((shape) => {
          const inside = level.pieces.find((piece) => placed.get(piece.id) === holeId(shape));
          return (
            <li
              key={shape}
              className='ss-hole'
              data-hole={shape}
              data-filled={inside !== undefined}
              data-hint={hint?.target === holeId(shape)}
              aria-label={t(shapeNames[shape])}
              style={formStyle(shape)}
              {...carry.target(holeId(shape))}
            >
              <ShapeArt kind={shape} {...FORMS[shape]} look='hole' />
              {inside !== undefined && (
                <ShapeArt className='ss-dropped' kind={shape} {...FORMS[shape]} paint={inside.paint} look='piece' />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
