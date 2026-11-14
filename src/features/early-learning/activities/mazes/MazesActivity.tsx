import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../../reading/useChoiceRound.ts';
import { keyOf, neighbor, OPEN, straightRun, waysFrom, type Cell, type Direction, type MazeLevel } from './level.ts';
import { strings } from './strings.ts';
import './mazes.css';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
};

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/** Board units per cell in the drawing. */
const UNIT = 100;

/**
 * A maze, an animal, and its snack. The animal follows the pointer along open paths: moving the
 * pointer into the next cell, or clicking a cell in a straight open line, walks it there. The
 * arrow keys move it one cell. Cells it has walked keep a small dot, so the child sees where it
 * has been. A wall stops it with a little wobble. After two bumps or clicks that cannot be
 * reached in one place, the next cell on the way glows.
 */
export default function MazesActivity({ level, kit }: ActivityProps<MazeLevel>) {
  const [at, setAt] = useState<Cell>(level.start);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([keyOf(level.start)]));
  const [bumps, setBumps] = useState(0);
  const [wobble, setWobble] = useState(0);
  const [arrived, setArrived] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const critter = useRef<HTMLDivElement>(null);
  const helpedAt = useRef<string | null>(null);

  const nextStep = waysFrom(level.cells, at).get(keyOf(level.goal))?.[0] ?? null;
  const nextCell = nextStep === null ? null : neighbor(at, nextStep, level.columns, level.rows);
  const hint = bumps >= HINT_AFTER_TRIES && !arrived ? nextCell : null;

  function walk(run: readonly Cell[]): void {
    const last = run.at(-1);
    if (last === undefined || arrived) return;
    setAt(last);
    setBumps(0);
    setVisited((before) => new Set([...before, ...run.map(keyOf)]));
    kit.play('tap');
    if (same(last, level.goal)) {
      setArrived(true);
      kit.feedback.correct({ at: critter.current ?? undefined });
      void kit.speak(feedback.youFoundIt);
      kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
    }
  }

  /** A move that cannot happen: a wobble, a quiet ring, and help after two in one place. */
  function bump(spot: { x: number; y: number } | undefined): void {
    setWobble((count) => count + 1);
    kit.feedback.wrong({ at: spot ?? critter.current ?? undefined, silent: true });
    const count = bumps + 1;
    setBumps(count);
    const here = keyOf(at);
    if (count >= HINT_AFTER_TRIES && helpedAt.current !== here) {
      helpedAt.current = here;
      kit.hint(strings.thisWay);
    }
  }

  useActivityKeys(kit, (event) => {
    const direction = KEY_DIRECTIONS[event.key];
    if (direction === undefined || arrived || event.repeat) return;
    event.preventDefault();
    const to = neighbor(at, direction, level.columns, level.rows);
    const run = to === null ? null : straightRun(level, at, to);
    if (run === null) bump(undefined);
    else walk(run);
  });

  /** The cell under a point in window coordinates, or null off the board. */
  function cellAt(clientX: number, clientY: number): Cell | null {
    const rect = board.current?.getBoundingClientRect();
    if (rect === undefined) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * level.columns);
    const y = Math.floor(((clientY - rect.top) / rect.height) * level.rows);
    return x < 0 || y < 0 || x >= level.columns || y >= level.rows ? null : { x, y };
  }

  function follow(event: ReactPointerEvent<HTMLDivElement>): void {
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null || arrived) return;
    const run = straightRun(level, at, cell, level.goal);
    if (run !== null) walk(run);
  }

  function click(event: ReactPointerEvent<HTMLDivElement>): void {
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null || arrived || same(cell, at)) return;
    const run = straightRun(level, at, cell, level.goal);
    if (run === null) bump({ x: event.clientX, y: event.clientY });
    else walk(run);
  }

  const place = (cell: Cell) => ({
    left: `${String(((cell.x + 0.5) / level.columns) * 100)}%`,
    top: `${String(((cell.y + 0.5) / level.rows) * 100)}%`,
    width: `${String((0.8 / level.columns) * 100)}%`,
  });

  return (
    <div className='mz-stage'>
      <div className='mz-board-area'>
        <div
          ref={board}
          className='mz-board'
          role='group'
          tabIndex={0}
          aria-label={t(strings.maze)}
          style={{
            aspectRatio: `${String(level.columns)} / ${String(level.rows)}`,
            width: `min(100cqw, calc(100cqh * ${String(level.columns)} / ${String(level.rows)}))`,
          }}
          data-at={keyOf(at)}
          data-arrived={arrived}
          onPointerMove={follow}
          onPointerUp={click}
        >
          <svg
            className='mz-drawing'
            viewBox={`0 0 ${String(level.columns * UNIT)} ${String(level.rows * UNIT)}`}
            preserveAspectRatio='none'
            aria-hidden='true'
          >
            <rect className='mz-floor' x={0} y={0} width={level.columns * UNIT} height={level.rows * UNIT} />
            {[...visited].map((key) => {
              const [x = 0, y = 0] = key.split(',').map(Number);
              return (
                <circle
                  key={key}
                  className='mz-trail'
                  cx={(x + 0.5) * UNIT}
                  cy={(y + 0.5) * UNIT}
                  r={UNIT * 0.1}
                  data-trail={key}
                />
              );
            })}
            {hint !== null && (
              <rect
                className='mz-hint'
                x={hint.x * UNIT + UNIT * 0.08}
                y={hint.y * UNIT + UNIT * 0.08}
                width={UNIT * 0.84}
                height={UNIT * 0.84}
                rx={UNIT * 0.2}
                data-hint={keyOf(hint)}
              />
            )}
            <MazeWalls level={level} />
          </svg>
          <div className='mz-piece mz-snack' style={place(level.goal)} data-arrived={arrived}>
            <Emoji id={level.snack} />
          </div>
          <div
            ref={critter}
            className='mz-piece mz-critter'
            style={place(at)}
            data-wobble={wobble === 0 ? 'none' : wobble % 2}
          >
            <Emoji id={level.critter} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The walls as one path over cells UNIT square. */
function MazeWalls({ level }: { level: MazeLevel }) {
  const segments: string[] = [];
  level.cells.forEach((row, y) => {
    row.forEach((open, x) => {
      const left = x * UNIT;
      const top = y * UNIT;
      if ((open & OPEN.up) === 0) segments.push(`M${String(left)} ${String(top)}h${String(UNIT)}`);
      if ((open & OPEN.left) === 0) segments.push(`M${String(left)} ${String(top)}v${String(UNIT)}`);
      if (y === level.rows - 1) segments.push(`M${String(left)} ${String(top + UNIT)}h${String(UNIT)}`);
      if (x === level.columns - 1) segments.push(`M${String(left + UNIT)} ${String(top)}v${String(UNIT)}`);
    });
  });
  return <path className='mz-wall' d={segments.join('')} />;
}
