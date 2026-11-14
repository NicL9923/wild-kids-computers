import { useRef, useState, type CSSProperties } from 'react';
import { useCarry } from '../../../../activityShell/carry/useCarry.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import { PictureCrop, type Crop } from '../../logic/PictureCrop.tsx';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../../reading/useChoiceRound.ts';
import { PICTURE, type JigsawLevel } from './level.ts';
import { strings } from './strings.ts';
import { useJigsawPicture } from './useJigsawPicture.ts';
import './jigsaw.css';

const pieceId = (index: number) => `piece-${String(index)}`;
const placeId = (index: number) => `place-${String(index)}`;
const indexOf = (id: string) => Number(id.slice(id.indexOf('-') + 1));

/** Tray columns for a number of pieces, so the tray stays about as tall as the board. */
function trayColumns(count: number): number {
  if (count <= 2) return 1;
  if (count <= 6) return 2;
  if (count <= 16) return 3;
  return 4;
}

/**
 * The board with an outline for each piece, and the pieces in a tray beside it. A piece moves with
 * useCarry: dragged, clicked up and clicked down, or carried with the keyboard. It stays only in
 * its own place; anywhere else it goes back to the tray with the kit's neutral nudge. After two
 * misses with one piece, its place glows while that piece is carried.
 */
export default function JigsawActivity({ level, kit }: ActivityProps<JigsawLevel>) {
  const picture = useJigsawPicture(kit, level);
  const [placed, setPlaced] = useState<ReadonlySet<number>>(() => new Set());
  const [misses, setMisses] = useState<ReadonlyMap<number, number>>(() => new Map());
  const tray = useRef<HTMLUListElement>(null);
  const count = level.columns * level.rows;
  const done = placed.size === count;

  const carry = useCarry<string, string>(kit, {
    kind: 'targets',
    accepts: (_piece, place) => !placed.has(indexOf(place)),
    onDrop(piece, place) {
      const home = indexOf(piece);
      const where = indexOf(place);
      const at = document.querySelector(`[data-carry-target="${place}"]`) ?? undefined;
      if (home !== where) {
        const tries = (misses.get(home) ?? 0) + 1;
        setMisses(new Map(misses).set(home, tries));
        kit.feedback.wrong({ at });
        if (tries === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
        else void kit.speak(feedback.goesSomewhereElse);
        return;
      }
      const next = new Set(placed).add(home);
      setPlaced(next);
      // Focus goes on to the next piece in the tray, so a keyboard player carries on from there.
      kit.scope.setTimeout(() => {
        const lost = document.activeElement === null || document.activeElement === document.body;
        if (lost) tray.current?.querySelector<HTMLElement>('[data-carry-item]')?.focus();
      }, 0);
      if (next.size === count) {
        kit.feedback.correct({ at });
        void kit.speak(feedback.allDone);
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      }
    },
  });

  const carried = carry.carried === null ? null : indexOf(carry.carried);
  const hintPlace = carried !== null && (misses.get(carried) ?? 0) >= HINT_AFTER_TRIES ? carried : null;

  if (picture.status === 'loading') return <div className='jg-stage' data-loading='true' />;
  const { source } = picture;
  const crop = (index: number): Crop => ({
    x: ((index % level.columns) * PICTURE.width) / level.columns,
    y: (Math.floor(index / level.columns) * PICTURE.height) / level.rows,
    width: PICTURE.width / level.columns,
    height: PICTURE.height / level.rows,
  });
  const columns = trayColumns(count);
  const layout = {
    '--jg-columns': level.columns,
    '--jg-rows': level.rows,
    '--jg-tray-columns': columns,
    '--jg-tray-rows': Math.ceil(count / columns),
  } as CSSProperties;

  return (
    <div className='jg-stage' style={layout} data-source={picture.from} data-done={done}>
      <div className='jg-board-area'>
        <div className='jg-board' role='group' aria-label={t(strings.board)}>
          {level.guide && <PictureCrop source={source} className='jg-guide' />}
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className='jg-place'
              {...carry.target(placeId(index))}
              data-place={index}
              data-filled={placed.has(index)}
              data-hint={hintPlace === index}
              aria-label={`${t(strings.place)} ${t(numberHandle(index + 1))}`}
              role='img'
            >
              {placed.has(index) && <PictureCrop source={source} crop={crop(index)} />}
            </div>
          ))}
        </div>
      </div>
      <div className='jg-tray-area'>
        <ul className='jg-tray' ref={tray} aria-label={t(strings.tray)}>
          {level.tray.map((index) => (
            <li key={index} className='jg-slot'>
              {!placed.has(index) && (
                <button
                  type='button'
                  className='jg-piece'
                  {...carry.item(pieceId(index))}
                  data-piece={index}
                  aria-label={`${t(strings.piece)} ${t(numberHandle(index + 1))}`}
                >
                  <PictureCrop source={source} crop={crop(index)} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
