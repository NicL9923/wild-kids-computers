import { useState, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import { peersOf, type SudokuLevel } from './level.ts';
import { strings } from './strings.ts';
import './pictureSudoku.css';

/** How long a square that already holds the picked animal stays marked. */
const CONFLICT_MS = 1600;

const keyOf = (row: number, column: number) => `${String(row)},${String(column)}`;

/**
 * A small grid of animals with empty squares, and the animals to choose from beside it. The child
 * picks an empty square, or starts on the first one, and clicks an animal. The right animal fills
 * the square. A wrong one stays out, and when the row, column, or box already holds it, that
 * square is marked so the child sees why. After two tries on one square its animal stands out.
 */
export default function PictureSudokuActivity({ level, kit }: ActivityProps<SudokuLevel>) {
  const [filled, setFilled] = useState<ReadonlySet<string>>(() => new Set());
  const [active, setActive] = useState<string | null>(() => {
    const [first] = level.blanks;
    return first === undefined ? null : keyOf(first[0], first[1]);
  });
  const [tries, setTries] = useState(0);
  const [conflicts, setConflicts] = useState<ReadonlySet<string>>(() => new Set());
  const blankKeys = new Set(level.blanks.map(([r, c]) => keyOf(r, c)));
  const done = filled.size === level.blanks.length;
  useRoundInstruction(kit, [level.boxes ? strings.boxes : strings.instruction]);

  const activeCell = level.blanks.find(([r, c]) => keyOf(r, c) === active) ?? null;
  const answer = activeCell === null ? null : (level.solution[activeCell[0]]?.[activeCell[1]] ?? null);
  const hinted = !done && tries >= HINT_AFTER_TRIES ? answer : null;

  function select(key: string): void {
    if (done || filled.has(key) || key === active) return;
    setActive(key);
    setTries(0);
    kit.play('tap');
  }

  function place(value: number, element: HTMLElement): void {
    if (done || activeCell === null || active === null) return;
    const [row, column] = activeCell;
    const square = document.querySelector(`[data-cell="${active}"]`) ?? element;
    if (value === answer) {
      const next = new Set(filled).add(active);
      setFilled(next);
      setTries(0);
      setConflicts(new Set());
      kit.feedback.correct({ at: square });
      const picture = level.pictures[value];
      const nextBlank = level.blanks.find(([r, c]) => !next.has(keyOf(r, c)));
      setActive(nextBlank === undefined ? null : keyOf(nextBlank[0], nextBlank[1]));
      if (nextBlank === undefined) {
        void kit.speakSequence(picture === undefined ? [feedback.allDone] : [emojiNames[picture], feedback.allDone]);
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      } else if (picture !== undefined) {
        void kit.speak(emojiNames[picture]);
      }
      return;
    }
    // Show where this animal already is in the row, column, or box, when it is there.
    const clash = peersOf(level.size, level.boxes, row, column)
      .filter(([r, c]) => (!blankKeys.has(keyOf(r, c)) || filled.has(keyOf(r, c))) && level.solution[r]?.[c] === value)
      .map(([r, c]) => keyOf(r, c));
    setConflicts(new Set(clash));
    if (clash.length > 0) kit.scope.setTimeout(() => setConflicts(new Set()), CONFLICT_MS);
    const nextTries = tries + 1;
    setTries(nextTries);
    kit.feedback.wrong({ at: square });
    if (nextTries === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
    else void kit.speak(clash.length > 0 ? feedback.lookAgain : feedback.tryAnother);
  }

  function cell(r: number, c: number) {
    const key = keyOf(r, c);
    const value = level.solution[r]?.[c] ?? -1;
    const picture = level.pictures[value];
    const shown = !blankKeys.has(key) || filled.has(key);
    if (!blankKeys.has(key) || picture === undefined) {
      return (
        <div key={key} className='ps-cell' data-cell={key} data-conflict={conflicts.has(key)}>
          {picture !== undefined && <Emoji id={picture} />}
        </div>
      );
    }
    return (
      <button
        key={key}
        type='button'
        className='ps-cell ps-blank'
        data-cell={key}
        data-filled={shown}
        data-active={active === key}
        data-conflict={conflicts.has(key)}
        aria-pressed={active === key}
        aria-label={shown ? undefined : t(strings.empty)}
        onClick={() => select(key)}
      >
        {shown && <Emoji id={picture} />}
      </button>
    );
  }

  const layout = { '--ps-size': level.size } as CSSProperties;
  return (
    <div className='ps-stage' style={layout} data-size={level.size}>
      <div className='ps-board-area'>
        <fieldset className='ps-grid' aria-label={t(strings.grid)} data-boxes={level.boxes}>
          {level.boxes
            ? [0, 2].flatMap((top) =>
                [0, 2].map((left) => (
                  <div key={keyOf(top, left)} className='ps-box'>
                    {[0, 1].flatMap((dr) => [0, 1].map((dc) => cell(top + dr, left + dc)))}
                  </div>
                )),
              )
            : level.solution.flatMap((row, r) => row.map((_, c) => cell(r, c)))}
        </fieldset>
      </div>
      <fieldset className='ps-palette' aria-label={t(strings.animals)}>
        {level.pictures.map((picture, value) => (
          <button
            key={picture}
            type='button'
            className='ps-animal'
            data-animal={picture}
            data-hint={hinted === value}
            disabled={done}
            onPointerEnter={() => void kit.speak(emojiNames[picture])}
            onFocus={() => void kit.speak(emojiNames[picture])}
            onClick={(event) => place(value, event.currentTarget)}
          >
            <Emoji id={picture} />
          </button>
        ))}
      </fieldset>
    </div>
  );
}
