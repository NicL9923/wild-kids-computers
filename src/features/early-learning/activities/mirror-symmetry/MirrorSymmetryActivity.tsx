import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../../reading/useChoiceRound.ts';
import { cellsToFill, inChildHalf, isFilled, type Cell, type MirrorLevel } from './level.ts';
import './mirrorSymmetry.css';
import { strings } from './strings.ts';

const PAINT: Readonly<Record<MirrorLevel['paint'], string>> = {
  red: '#d9483b',
  blue: '#3a71cf',
  green: '#3f9a4c',
  purple: '#8656b8',
  orange: '#e07b1f',
};

const key = (cell: Cell) => `${String(cell.row)}-${String(cell.column)}`;

const ARROWS: Readonly<Record<string, Cell>> = {
  ArrowUp: { row: -1, column: 0 },
  ArrowDown: { row: 1, column: 0 },
  ArrowLeft: { row: 0, column: -1 },
  ArrowRight: { row: 0, column: 1 },
};

/**
 * A grid split by a dashed mirror line. One half shows its part of the picture. In the other
 * half every square is a button: a square the mirror needs fills with the picture's paint, and
 * any other square gives a neutral nudge and stays empty. After two such tries the next square
 * to fill stands out. The arrow keys move between the squares to fill.
 */
export default function MirrorSymmetryActivity({ level, kit }: ActivityProps<MirrorLevel>) {
  const targets = cellsToFill(level);
  const [filled, setFilled] = useState<ReadonlySet<string>>(() => new Set());
  const [tries, setTries] = useState(0);
  const [active, setActive] = useState<Cell>(() => firstChildCell(level));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const done = filled.size === targets.length;
  const next = targets.find((cell) => !filled.has(key(cell)));
  const hinted = !done && tries >= HINT_AFTER_TRIES && next !== undefined ? key(next) : null;

  function press(cell: Cell, element: HTMLElement): void {
    if (done || filled.has(key(cell))) return;
    if (isFilled(level, cell)) {
      const now = new Set(filled).add(key(cell));
      setFilled(now);
      setTries(0);
      if (now.size === targets.length) {
        kit.feedback.correct({ at: element });
        void kit.speak(feedback.youDidIt);
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      } else {
        kit.play('tap');
      }
      return;
    }
    const nextTries = tries + 1;
    setTries(nextTries);
    kit.feedback.wrong({ at: element });
    if (nextTries === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
    else void kit.speak(feedback.lookAgain);
  }

  function move(event: KeyboardEvent<HTMLButtonElement>, from: Cell): void {
    const step = ARROWS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const to = { row: from.row + step.row, column: from.column + step.column };
    const inGrid = to.row >= 0 && to.row < level.size && to.column >= 0 && to.column < level.size;
    if (!inGrid || !inChildHalf(level, to)) return;
    setActive(to);
    buttons.current.get(key(to))?.focus();
  }

  const style = { '--ms-size': level.size, '--ms-paint': PAINT[level.paint] } as CSSProperties;
  return (
    <div className='ms-stage'>
      <fieldset
        className='ms-grid'
        aria-label={t(strings.picture)}
        data-axis={level.axis}
        data-given={level.given}
        style={style}
      >
        {Array.from({ length: level.size * level.size }, (_, index) => {
          const cell = { row: Math.floor(index / level.size), column: index % level.size };
          if (!inChildHalf(level, cell)) {
            return <span key={key(cell)} className='ms-cell' data-shown={isFilled(level, cell)} />;
          }
          const isActive = cell.row === active.row && cell.column === active.column;
          return (
            <button
              key={key(cell)}
              ref={(element) => {
                if (element === null) buttons.current.delete(key(cell));
                else buttons.current.set(key(cell), element);
              }}
              type='button'
              className='ms-cell ms-square'
              data-cell={key(cell)}
              data-filled={filled.has(key(cell))}
              data-hint={hinted === key(cell)}
              aria-pressed={filled.has(key(cell))}
              aria-label={label(cell)}
              tabIndex={isActive ? 0 : -1}
              onFocus={() => setActive(cell)}
              onKeyDown={(event) => move(event, cell)}
              onClick={(event) => press(cell, event.currentTarget)}
            />
          );
        })}
      </fieldset>
    </div>
  );
}

/** The square's name for a screen reader, such as "Row 2 column 3". */
const label = (cell: Cell) =>
  [t(strings.row), t(numberHandle(cell.row + 1)), t(strings.column), t(numberHandle(cell.column + 1))].join(' ');

/** The top left square of the child's half, where keyboard focus starts. */
function firstChildCell(level: MirrorLevel): Cell {
  for (let index = 0; index < level.size * level.size; index += 1) {
    const cell = { row: Math.floor(index / level.size), column: index % level.size };
    if (inChildHalf(level, cell)) return cell;
  }
  return { row: 0, column: 0 };
}
