import { useEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import { KeyboardPicture, type KeyMark } from '../../shared/KeyboardPicture.tsx';
import { PATH, START_X, type JumpLevel, type StopKind } from './level.ts';
import './spaceAndEnter.css';
import { strings } from './strings.ts';
import { advance, heightOf, isNear, press, startWalk, type WalkState } from './walk.ts';

/** The pause after the critter goes in at home, so the child sees it arrive. */
const HOME_PAUSE_MS = 1000;
/** Other keys pressed at one stop before the instruction is said again. */
const OTHER_KEYS_BEFORE_HELP = 2;
/** The ground line, in path units from the top. */
const GROUND_Y = 250;
const CRITTER_SIZE = 84;
const THING_SIZE = 64;
const GATE_SIZE = 70;
const HOME_SIZE = 150;

const SAY_AT: Readonly<Record<StopKind, typeof strings.pressSpace>> = {
  jump: strings.pressSpace,
  gate: strings.pressEnterGate,
  home: strings.pressEnterHome,
};

const KEY_FOR: Readonly<Record<StopKind, string>> = { jump: 'Space', gate: 'Enter', home: 'Enter' };

const SIZES: Readonly<Record<StopKind, number>> = { jump: THING_SIZE, gate: GATE_SIZE, home: HOME_SIZE };

const percentX = (x: number) => `${String((x / PATH.width) * 100)}%`;

/**
 * A critter walks along a path toward home. Space jumps it over logs and rocks; Enter opens
 * gates and the door of home. The right key lights up on the keyboard picture. The other key at a
 * stop gets a neutral nudge that says which key to use. Space anywhere else is a happy hop.
 */
export default function SpaceAndEnterActivity({ level, kit }: ActivityProps<JumpLevel>) {
  const [walk, setWalk] = useState<WalkState>(() => startWalk(START_X));
  const [hops, setHops] = useState(0);
  const [wrongHere, setWrongHere] = useState(0);
  const [otherKeys, setOtherKeys] = useState(0);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const critter = useRef<HTMLDivElement>(null);
  const announced = useRef(-1);
  const missed = useRef(0);
  const wrongCount = useRef(0);
  const lastFrame = useRef<number | null>(null);
  const stop = level.stops[walk.stop];
  const near = isNear(walk, level);

  // One animation loop for the round, on the kit's clock, so leaving stops it.
  useEffect(() => {
    let cancel: (() => void) | null = null;
    const frame = (time: number) => {
      const before = lastFrame.current ?? time;
      lastFrame.current = time;
      setWalk((current) => advance(current, level, time - before, kit.reducedMotion));
      cancel = kit.scope.requestFrame(frame);
    };
    cancel = kit.scope.requestFrame(frame);
    return () => cancel?.();
  }, [kit, level]);

  // Says what to do as the critter comes near each stop. The first stop's words are already in
  // the round's opening instruction, so they only become the replay.
  useEffect(() => {
    if (stop === undefined || !near || announced.current === walk.stop) return;
    announced.current = walk.stop;
    kit.setInstruction(SAY_AT[stop.kind], { speak: walk.stop > 0 });
  }, [kit, near, stop, walk.stop]);

  // A critter that keeps walking and had to stop was a late press: it waits, and the difficulty
  // model hears about it, but nothing on screen says it was late.
  const waitingAt = walk.phase === 'waiting' ? walk.stop : null;
  useEffect(() => {
    if (waitingAt !== null && level.walk === 'keeps-walking') missed.current += 1;
  }, [waitingAt, level.walk]);

  const home = walk.phase === 'home';
  useEffect(() => {
    if (!home) return;
    kit.feedback.correct({ at: critter.current ?? undefined });
    kit.scope.setTimeout(() => kit.roundComplete({ mistakes: missed.current + wrongCount.current }), HOME_PAUSE_MS);
  }, [home, kit]);

  function light(code: string): void {
    setPressedKey(code);
    kit.scope.setTimeout(() => setPressedKey((current) => (current === code ? null : current)), 260);
  }

  useActivityKeys(kit, (event) => {
    if (event.repeat || stop === undefined) return;
    const key = event.key === ' ' ? 'space' : event.key === 'Enter' ? 'enter' : null;
    if (key === null) {
      if (event.key.length !== 1 || walk.phase !== 'waiting') return;
      const count = otherKeys + 1;
      setOtherKeys(count);
      if (count === OTHER_KEYS_BEFORE_HELP) kit.hint(SAY_AT[stop.kind]);
      return;
    }
    event.preventDefault();
    light(event.code);
    const { state, result } = press(walk, level, key);
    if (result === 'go') {
      setWalk(state);
      setWrongHere(0);
      setOtherKeys(0);
      kit.play(stop.kind === 'jump' ? 'whoosh' : 'open');
    } else if (result === 'hop') {
      setHops((count) => count + 1);
      kit.play('tap');
    } else if (result === 'wrong') {
      wrongCount.current += 1;
      setWrongHere((count) => count + 1);
      kit.feedback.wrong({
        at: critter.current ?? undefined,
        say: key === 'space' ? strings.enterIsBig : strings.spaceIsLong,
      });
    }
  });

  const marks: Record<string, KeyMark> = {};
  const showKey = stop !== undefined && near && (level.walk === 'waits' || wrongHere > 0);
  if (showKey) marks[KEY_FOR[stop.kind]] = 'target';
  if (pressedKey !== null) marks[pressedKey] = 'pressed';

  return (
    <div className='jump-stage' data-phase={walk.phase} data-stop={walk.stop}>
      <div className='jump-path-area'>
        <div className='jump-path'>
          <svg className='jump-ground' viewBox={`0 0 ${String(PATH.width)} ${String(PATH.height)}`} aria-hidden='true'>
            <rect className='jump-grass' x={0} y={GROUND_Y} width={PATH.width} height={PATH.height - GROUND_Y} />
            <path className='jump-trail' d={`M0 ${String(GROUND_Y + 22)} H${String(PATH.width)}`} />
          </svg>
          {level.stops.map((item, index) => {
            const passed = index < walk.stop || (index === walk.stop && (walk.phase === 'opening' || home));
            const style = { left: percentX(item.x), width: percentX(SIZES[item.kind]) };
            if (item.kind === 'jump') {
              return (
                <div key={item.id} className='jump-thing' data-stop-kind='jump' style={style}>
                  <Emoji id={item.thing ?? 'log'} />
                </div>
              );
            }
            if (item.kind === 'gate') {
              return (
                <div key={item.id} className='jump-gate' data-stop-kind='gate' data-open={passed} style={style}>
                  <Gate label={t(strings.gate)} />
                </div>
              );
            }
            return (
              <div key={item.id} className='jump-home' data-stop-kind='home' data-open={passed} style={style}>
                <Emoji id='house' decorative />
                <span className='wk-visually-hidden'>{t(strings.home)}</span>
              </div>
            );
          })}
          <div
            ref={critter}
            className='jump-critter'
            data-hop={hops % 2}
            data-home={home}
            style={{
              left: percentX(walk.x),
              width: percentX(CRITTER_SIZE),
              bottom: `${String(((PATH.height - GROUND_Y + heightOf(walk)) / PATH.height) * 100)}%`,
            }}
          >
            <Emoji id={level.critter} />
          </div>
        </div>
      </div>
      <div className='jump-keyboard'>
        <KeyboardPicture label={t(emojiNames.keyboard)} marks={marks} />
      </div>
    </div>
  );
}

/** A small wooden gate. Open, the board swings away and leaves the posts. */
function Gate({ label }: { label: string }) {
  return (
    <>
      <svg className='jump-gate-art' viewBox='0 0 70 110' aria-hidden='true'>
        <rect className='jump-post' x={0} y={0} width={10} height={110} rx={3} />
        <rect className='jump-post' x={60} y={0} width={10} height={110} rx={3} />
        <g className='jump-gate-board'>
          <rect x={12} y={18} width={46} height={14} rx={3} />
          <rect x={12} y={56} width={46} height={14} rx={3} />
          <rect x={12} y={90} width={46} height={12} rx={3} />
          <path d='M14 30 L56 60' className='jump-gate-brace' />
        </g>
      </svg>
      <span className='wk-visually-hidden'>{label}</span>
    </>
  );
}
