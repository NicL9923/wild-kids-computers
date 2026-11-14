import type { CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { emojiNames, feedback, shapes as shapeNames } from '../../../../core/strings/shared/index.ts';
import { ShapeArt } from '../../shapes/ShapeArt.tsx';
import { useSortRound } from '../../sorting/useSortRound.ts';
import { fitsPiece, TRAY, type ShapeBuilderLevel, type Tile, type TileId } from './level.ts';
import { BOARD, type Part, type Picture } from './pictures.ts';
import './shapeBuilder.css';
import { strings } from './strings.ts';

type OutlineId = `outline-${number}`;
const outlineId = (index: number): OutlineId => `outline-${index}`;

/** The picture and the tray side by side, with a gap between, in board units. */
const GAP = 40;
const WIDTH = BOARD.width + GAP + TRAY.width;

/** Places a box on the whole stage, in percent, from its left and top in stage units. */
function place(left: number, top: number, width: number, height: number): CSSProperties {
  return {
    left: `${String((left / WIDTH) * 100)}%`,
    top: `${String((top / BOARD.height) * 100)}%`,
    width: `${String((width / WIDTH) * 100)}%`,
    height: `${String((height / BOARD.height) * 100)}%`,
  };
}

/** Places a tile in the tray, in percent of the tray. */
const inTray = (tile: Tile): CSSProperties => ({
  left: `${String((tile.left / TRAY.width) * 100)}%`,
  top: `${String((tile.top / TRAY.height) * 100)}%`,
  width: `${String((tile.width / TRAY.width) * 100)}%`,
  height: `${String((tile.height / TRAY.height) * 100)}%`,
});

const placePart = (part: Part) => place(part.x - part.width / 2, part.y - part.height / 2, part.width, part.height);

function nameOf(picture: Picture): SpokenHandle {
  return picture.name === 'robot' ? strings.robot : emojiNames[picture.name];
}

/** A part drawn as a piece or an outline, optionally placed on the board. */
const art = (part: Omit<Part, 'x' | 'y'>, look: 'piece' | 'outline', className?: string, style?: CSSProperties) => (
  <ShapeArt
    kind={part.shape}
    width={part.width}
    height={part.height}
    turn={part.turn ?? 0}
    paint={part.paint}
    look={look}
    className={className}
    style={style}
  />
);

/**
 * A picture with some pieces missing, and the missing pieces in a tray beside it, each the same
 * size as its outline. A piece says its shape's name when the pointer rests on it or it gets
 * focus. On its own outline it stays; anywhere else it goes back with a neutral nudge. When the
 * last piece lands, the picture says its name.
 */
export default function ShapeBuilderActivity({ level, kit }: ActivityProps<ShapeBuilderLevel>) {
  const { picture, missing, tiles } = level;
  const tileOf = (id: TileId): Tile => {
    const tile = tiles.find((each) => each.id === id);
    if (tile === undefined) throw new Error(`Shape builder has no ${id}.`);
    return tile;
  };
  const round = useSortRound<TileId, OutlineId>(kit, {
    required: tiles.filter((tile) => tile.piece !== null).map((tile) => tile.id),
    targets: missing.map(outlineId),
    fits: (id, outline) => {
      const piece = picture.pieces[Number(outline.slice('outline-'.length))];
      return piece !== undefined && fitsPiece(tileOf(id), piece);
    },
    holds: 'one',
    onPlaced: (id) => [shapeNames[tileOf(id).shape]],
    onDone: () => [feedback.youDidIt, nameOf(picture)],
    onMiss: (id) => [shapeNames[tileOf(id).shape]],
  });
  const { carry, placed, hint, attachTray } = round;
  const filled = new Map([...placed.entries()].map(([tile, outline]) => [outline, tileOf(tile)]));
  const shown = (index: number) => !missing.includes(index) || filled.has(outlineId(index));

  return (
    <div className='sb-stage'>
      <div className='sb-board' data-picture={picture.name}>
        <div className='sb-picture' style={place(0, 0, BOARD.width, BOARD.height)} />
        {picture.pieces.map((piece, index) => {
          const key = `piece-${String(index)}`;
          if (!missing.includes(index))
            return <span key={key}>{art(piece, 'piece', 'sb-part', placePart(piece))}</span>;
          const tile = filled.get(outlineId(index));
          return (
            <div
              key={key}
              className='sb-outline'
              data-outline={index}
              data-filled={tile !== undefined}
              data-hint={hint?.target === outlineId(index)}
              style={placePart(piece)}
              {...carry.target(outlineId(index))}
            >
              {art(tile ?? piece, tile === undefined ? 'outline' : 'piece')}
            </div>
          );
        })}
        {picture.details.map((detail, index) =>
          shown(detail.on) ? (
            <span key={`detail-${String(index)}`}>{art(detail, 'piece', 'sb-part sb-detail', placePart(detail))}</span>
          ) : null,
        )}
        <ul
          ref={attachTray}
          className='sb-tray'
          aria-label={t(strings.tray)}
          style={place(BOARD.width + GAP, 0, TRAY.width, BOARD.height)}
        >
          {tiles.map((tile) => (
            <li key={tile.id} className='sb-tile-spot' style={inTray(tile)}>
              {!placed.has(tile.id) && (
                <button
                  type='button'
                  className='sb-tile'
                  data-tile={tile.id}
                  data-shape={tile.shape}
                  data-hint={hint?.item === tile.id}
                  aria-label={t(shapeNames[tile.shape])}
                  onPointerEnter={() => void kit.speak(shapeNames[tile.shape])}
                  onFocus={() => void kit.speak(shapeNames[tile.shape])}
                  {...carry.item(tile.id)}
                >
                  {art(tile, 'piece')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
