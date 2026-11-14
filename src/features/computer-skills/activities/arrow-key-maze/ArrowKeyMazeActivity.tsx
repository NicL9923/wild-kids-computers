import { useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { KeyboardPicture, type KeyMark } from '../../shared/KeyboardPicture.tsx';
import './arrowKeyMaze.css';
import {
  ARRIVE_PAUSE_MS,
  canMove,
  neighbor,
  OPEN,
  waysFrom,
  type Cell,
  type Direction,
  type MazeLevel,
} from './level.ts';
import { strings } from './strings.ts';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
};

const DIRECTION_CODES: Readonly<Record<Direction, string>> = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
};

/** Bumps into a wall before the next arrow lights up. */
const BUMPS_BEFORE_HELP = 2;
/** Other keys pressed before the arrow keys light up. */
const OTHER_KEYS_BEFORE_HELP = 2;
/** How long a pressed arrow stays lit on the picture. */
const PRESSED_MS = 220;

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/**
 * A maze, a critter, and its snack. The arrow keys move the critter one cell. A wall stops it
 * with a little wobble and nothing else. After two bumps the arrow that leads on lights up on
 * the picture of the arrow keys, and other keys light all four arrows.
 */
export default function ArrowKeyMazeActivity({ level, kit }: ActivityProps<MazeLevel>) {
  const [at, setAt] = useState<Cell>(level.start);
  const [bumps, setBumps] = useState(0);
  const [otherKeys, setOtherKeys] = useState(0);
  const [pressed, setPressed] = useState<Direction | null>(null);
  const [wobble, setWobble] = useState(0);
  const [arrived, setArrived] = useState(false);
  const critter = useRef<HTMLDivElement>(null);
  const helpedAt = useRef<string | null>(null);

  const nextStep = waysFrom(level.cells, at).get(`${String(level.goal.x)},${String(level.goal.y)}`)?.[0] ?? null;
  const showNext = bumps >= BUMPS_BEFORE_HELP && nextStep !== null && !arrived;
  const showAll = otherKeys >= OTHER_KEYS_BEFORE_HELP && !showNext && !arrived;

  function press(direction: Direction): void {
    setPressed(direction);
    kit.scope.setTimeout(() => setPressed(null), PRESSED_MS);
  }

  function help(spot: string, say: typeof strings.thisWay): void {
    // One hint per place the child is stuck, however many times they bump there.
    if (helpedAt.current === spot) return;
    helpedAt.current = spot;
    kit.hint(say);
  }

  useActivityKeys(kit, (event) => {
    if (arrived || event.repeat) return;
    const direction = KEY_DIRECTIONS[event.key];
    if (direction === undefined) {
      if (event.key.length !== 1) return;
      const count = otherKeys + 1;
      setOtherKeys(count);
      if (count >= OTHER_KEYS_BEFORE_HELP) help('other-keys', strings.arrowKeys);
      return;
    }
    event.preventDefault();
    press(direction);
    setOtherKeys(0);
    const to = neighbor(at, direction, level.columns, level.rows);
    if (to === null || !canMove(level.cells, at, direction)) {
      // A bump is harmless: a wobble and a quiet ring, and the critter stays where it is.
      setWobble((count) => count + 1);
      kit.feedback.wrong({ at: critter.current ?? undefined, silent: true });
      const count = bumps + 1;
      setBumps(count);
      if (count >= BUMPS_BEFORE_HELP) help(`${String(at.x)},${String(at.y)}`, strings.thisWay);
      return;
    }
    setAt(to);
    setBumps(0);
    kit.play('tap');
    if (same(to, level.goal)) {
      setArrived(true);
      kit.feedback.correct({ at: critter.current ?? undefined });
      kit.scope.setTimeout(() => kit.roundComplete(), ARRIVE_PAUSE_MS);
    }
  });

  const marks: Record<string, KeyMark> = {};
  if (showAll) for (const code of Object.values(DIRECTION_CODES)) marks[code] = 'target';
  if (showNext) marks[DIRECTION_CODES[nextStep]] = 'target';
  if (pressed !== null) marks[DIRECTION_CODES[pressed]] = 'pressed';

  const place = (cell: Cell) => ({
    left: `${String(((cell.x + 0.5) / level.columns) * 100)}%`,
    top: `${String(((cell.y + 0.5) / level.rows) * 100)}%`,
    width: `${String((0.78 / level.columns) * 100)}%`,
  });

  return (
    <div className='maze-stage'>
      <div className='maze-board-area'>
        <div
          className='maze-board'
          style={{ aspectRatio: `${String(level.columns)} / ${String(level.rows)}` }}
          data-at={`${String(at.x)},${String(at.y)}`}
          data-arrived={arrived}
        >
          <MazeWalls level={level} />
          <div className='maze-piece maze-snack' style={place(level.goal)} data-arrived={arrived}>
            <Emoji id={level.snack} />
          </div>
          <div
            ref={critter}
            className='maze-piece maze-critter'
            style={place(at)}
            data-wobble={wobble % 2}
            data-critter={level.critter}
          >
            <Emoji id={level.critter} />
          </div>
        </div>
      </div>
      <div className='maze-keys'>
        <KeyboardPicture label={t(strings.arrows)} marks={marks} arrowsOnly />
      </div>
    </div>
  );
}

/** The maze's walls as one SVG path over cells 100 units square. */
function MazeWalls({ level }: { level: MazeLevel }) {
  const size = 100;
  const segments: string[] = [];
  level.cells.forEach((row, y) => {
    row.forEach((open, x) => {
      const left = x * size;
      const top = y * size;
      if ((open & OPEN.up) === 0) segments.push(`M${String(left)} ${String(top)}h${String(size)}`);
      if ((open & OPEN.left) === 0) segments.push(`M${String(left)} ${String(top)}v${String(size)}`);
      if (y === level.rows - 1) segments.push(`M${String(left)} ${String(top + size)}h${String(size)}`);
      if (x === level.columns - 1) segments.push(`M${String(left + size)} ${String(top)}v${String(size)}`);
    });
  });
  return (
    <svg
      className='maze-walls'
      viewBox={`0 0 ${String(level.columns * size)} ${String(level.rows * size)}`}
      preserveAspectRatio='none'
      aria-hidden='true'
    >
      <rect className='maze-floor' x={0} y={0} width={level.columns * size} height={level.rows * size} />
      <path className='maze-wall' d={segments.join('')} />
    </svg>
  );
}
