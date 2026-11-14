import { useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import { PictureCrop, type PictureSource } from '../../logic/PictureCrop.tsx';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../../reading/useChoiceRound.ts';
import { isSolved, neighborsOf, slide, TILE, type Board, type SlidingLevel } from './level.ts';
import { strings } from './strings.ts';
import './slidingPuzzle.css';

/** Which tile an arrow key slides: the one on the far side of the space from the arrow. */
const KEY_OFFSETS: Readonly<Record<string, readonly [dx: number, dy: number]>> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/**
 * A picture cut into tiles with one space. A click on a tile next to the space slides it there;
 * the arrow keys slide the tile on the far side of the space toward it. A tile that cannot slide
 * gives a little wobble. After two of those, the tiles that can slide glow. From band-6-8 up each
 * tile shows its number, and the finished picture stays small beside the board.
 */
export default function SlidingPuzzleActivity({ level, band, kit }: ActivityProps<SlidingLevel>) {
  const [board, setBoard] = useState<Board>(level.board);
  const [stuck, setStuck] = useState(0);
  const [wobble, setWobble] = useState<{ tile: number; count: number } | null>(null);
  const done = isSolved(board);
  const space = board.indexOf(null);
  const movable = new Set(neighborsOf(space, level.columns, level.rows));
  const hinted = !done && stuck >= HINT_AFTER_TRIES;
  const source: PictureSource = { kind: 'scene', scene: level.scene };
  const numbered = band !== 'band-3-5';

  function move(index: number, element: HTMLElement | undefined): void {
    if (done) return;
    const next = slide(board, index, level.columns, level.rows);
    if (next === null) {
      const tile = board[index];
      if (tile != null) setWobble({ tile, count: (wobble?.count ?? 0) + 1 });
      kit.feedback.wrong({ at: element, silent: true });
      const count = stuck + 1;
      setStuck(count);
      if (count === HINT_AFTER_TRIES) kit.hint(strings.canMove);
      return;
    }
    setBoard(next);
    setStuck(0);
    kit.play('tap');
    if (isSolved(next)) {
      kit.feedback.correct();
      void kit.speak(feedback.allDone);
      kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
    }
  }

  useActivityKeys(kit, (event) => {
    const offset = KEY_OFFSETS[event.key];
    if (offset === undefined || done) return;
    event.preventDefault();
    const x = (space % level.columns) + offset[0];
    const y = Math.floor(space / level.columns) + offset[1];
    if (x < 0 || y < 0 || x >= level.columns || y >= level.rows) {
      kit.feedback.wrong({ silent: true });
      return;
    }
    const index = y * level.columns + x;
    move(index, document.querySelector<HTMLElement>(`[data-place="${String(index)}"]`) ?? undefined);
  });

  const place = (index: number) => ({
    left: `${String(((index % level.columns) / level.columns) * 100)}%`,
    top: `${String((Math.floor(index / level.columns) / level.rows) * 100)}%`,
    width: `${String(100 / level.columns)}%`,
    height: `${String(100 / level.rows)}%`,
  });

  return (
    <div className='sp-stage'>
      <div className='sp-board-area'>
        <fieldset
          className='sp-board'
          aria-label={t(strings.board)}
          data-done={done}
          style={{
            aspectRatio: `${String(level.columns)} / ${String(level.rows)}`,
            width: `min(100cqw, calc(100cqh * ${String(level.columns)} / ${String(level.rows)}))`,
          }}
        >
          {board.map((tile, index) => {
            if (tile === null) return null;
            const crop = {
              x: (tile % level.columns) * TILE,
              y: Math.floor(tile / level.columns) * TILE,
              width: TILE,
              height: TILE,
            };
            return (
              <button
                key={tile}
                type='button'
                className='sp-tile'
                style={place(index)}
                data-tile={tile}
                data-place={index}
                data-home={tile === index}
                data-hint={hinted && movable.has(index)}
                data-wobble={wobble?.tile === tile ? wobble.count % 2 : 'none'}
                aria-label={[t(strings.tile), t(numberHandle(tile + 1))].join(' ')}
                onClick={(event) => move(index, event.currentTarget)}
              >
                <PictureCrop source={source} crop={crop} />
                {numbered && (
                  <span className='sp-number' aria-hidden='true'>
                    {t(numberHandle(tile + 1))}
                  </span>
                )}
              </button>
            );
          })}
          {done ? (
            <div className='sp-last' style={place(space)} data-place={space}>
              <PictureCrop
                source={source}
                crop={{
                  x: (space % level.columns) * TILE,
                  y: Math.floor(space / level.columns) * TILE,
                  width: TILE,
                  height: TILE,
                }}
              />
            </div>
          ) : (
            <div className='sp-space' style={place(space)} data-place={space} aria-hidden='true' />
          )}
        </fieldset>
      </div>
      <figure className='sp-goal' aria-label={t(strings.picture)}>
        <PictureCrop source={source} />
      </figure>
    </div>
  );
}
