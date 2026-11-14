import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useCarry } from '../../../../activityShell/carry/useCarry.ts';
import type { ActivityKit, ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { colors, feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import { ALL_MATCHED_MS, type Control, type DialsLevel } from './level.ts';
import './slidersAndDials.css';
import { strings } from './strings.ts';

/** Drops away from the flag on one control before its flag grows bigger. */
const MISSES_BEFORE_HELP = 2;

const STEP_KEYS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };

/**
 * Sliders and dials, each with a flag. A child drags a knob, or clicks it to pick it up, moves the
 * pointer, and clicks to put it down. A focused knob also moves with the arrow keys. Putting a
 * control down at its flag gives a check mark; elsewhere, a quiet ring. After two misses on one
 * control its flag grows and a faint knob shows the spot.
 *
 * Moves and keys can come faster than the screen draws, so the handlers read and write the
 * values, the misses, and whether all are matched in one live record, never the last render's.
 */
export default function SlidersAndDialsActivity({ level, kit }: ActivityProps<DialsLevel>) {
  const [values, setValues] = useState<Readonly<Record<string, number>>>(() =>
    Object.fromEntries(level.controls.map((control) => [control.id, control.start])),
  );
  const [misses, setMisses] = useState<Readonly<Record<string, number>>>({});
  const [finished, setFinished] = useState(false);
  const live = useRef({ values, misses, finished });

  function change(control: Control, value: number): void {
    if (live.current.finished) return;
    const next = { ...live.current.values, [control.id]: value };
    live.current = { ...live.current, values: next };
    setValues(next);
  }

  /** The control was put down at `value`, by the pointer or the keyboard. */
  function settle(control: Control, value: number, at: HTMLElement | null): void {
    if (live.current.finished) return;
    change(control, value);
    const next = live.current.values;
    if (value !== control.target) {
      kit.feedback.wrong({ at: at ?? undefined, silent: true });
      const count = (live.current.misses[control.id] ?? 0) + 1;
      const missed = { ...live.current.misses, [control.id]: count };
      live.current = { ...live.current, misses: missed };
      setMisses(missed);
      if (count === MISSES_BEFORE_HELP) kit.hint(strings.lookForFlag);
      return;
    }
    const all = level.controls.every((item) => next[item.id] === item.target);
    kit.feedback.correct({ at: at ?? undefined, ...(all ? { say: feedback.thatsIt } : {}) });
    if (!all) return;
    live.current = { ...live.current, finished: true };
    setFinished(true);
    kit.scope.setTimeout(() => kit.roundComplete(), ALL_MATCHED_MS);
  }

  const sliders = level.controls.filter((control) => control.kind === 'slider');
  const dials = level.controls.filter((control) => control.kind === 'dial');
  const props = (control: Control) => ({
    control,
    kit,
    value: values[control.id] ?? control.start,
    current: () => live.current.values[control.id] ?? control.start,
    helped: (misses[control.id] ?? 0) >= MISSES_BEFORE_HELP,
    locked: finished,
    onChange: (value: number) => change(control, value),
    onSettle: (value: number, at: HTMLElement | null) => settle(control, value, at),
  });

  return (
    <div className='dials-stage' data-finished={finished}>
      {sliders.length > 0 && (
        <div className='dials-sliders'>
          {sliders.map((control) => (
            <Slider key={control.id} {...props(control)} />
          ))}
        </div>
      )}
      {dials.length > 0 && (
        <div className='dials-dials'>
          {dials.map((control) => (
            <Dial key={control.id} {...props(control)} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ControlProps {
  readonly control: Control;
  readonly kit: ActivityKit;
  readonly value: number;
  /** The newest value, which a key or move that lands before the next render reads. */
  readonly current: () => number;
  readonly helped: boolean;
  readonly locked: boolean;
  readonly onChange: (value: number) => void;
  readonly onSettle: (value: number, at: HTMLElement | null) => void;
}

/**
 * The knob's move: useCarry along x over `track`, plus arrow keys on the focused knob when it is
 * not picked up, which move one stop and count only when they reach the flag.
 */
function useKnob({ control, kit, current, locked, onChange, onSettle }: ControlProps) {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLButtonElement | null>(null);
  const max = control.stops - 1;
  const carry = useCarry<string>(kit, {
    kind: 'axis',
    axis: 'x',
    track,
    min: 0,
    max,
    step: 1,
    value: current,
    onChange: (_id, next) => {
      if (!locked) onChange(next);
    },
    onDrop: (_id, next) => {
      if (!locked) onSettle(next, knob.current);
    },
  });
  const item = carry.item(control.id);
  const button = {
    ...item,
    ref: (element: HTMLButtonElement | null) => {
      knob.current = element;
      item.ref(element);
    },
    disabled: locked,
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      item.onKeyDown(event);
      const delta = STEP_KEYS[event.key];
      if (event.defaultPrevented || carry.carried !== null || delta === undefined) return;
      event.preventDefault();
      const next = Math.min(max, Math.max(0, current() + delta));
      onChange(next);
      if (next === control.target) onSettle(next, event.currentTarget);
    },
  };
  return { track, button, carried: carry.carried !== null };
}

/** A visually hidden name for the knob: its kind and color, then its value. */
function KnobName({ control, value, kind }: { control: Control; value: number; kind: string }) {
  return (
    <>
      <span id={`${control.id}-name`} className='wk-visually-hidden'>
        {kind} {t(colors[control.color])}
      </span>
      <span id={`${control.id}-value`} className='wk-visually-hidden'>
        {t(numberHandle(value + 1))}
      </span>
    </>
  );
}

const percent = (value: number, max: number) => `${String((value / max) * 100)}%`;

function Flag(): ReactNode {
  return (
    <svg viewBox='0 0 40 56' className='dials-flag-art' aria-hidden='true'>
      <path d='M6 4 V54' className='dials-flag-pole' />
      <path d='M8 6 H36 L28 16 L36 26 H8 Z' className='dials-flag-cloth' />
    </svg>
  );
}

function Check(): ReactNode {
  return (
    <svg viewBox='0 0 24 24' className='dials-check' aria-hidden='true'>
      <path d='M5 12.5 L10 17.5 L19 7' />
    </svg>
  );
}

function Slider(props: ControlProps) {
  const { control, value, helped } = props;
  const { track, button, carried } = useKnob(props);
  const max = control.stops - 1;
  const matched = value === control.target;
  return (
    <div
      className='dials-control dials-slider'
      data-control={control.id}
      data-kind='slider'
      data-value={value}
      data-matched={matched}
      data-helped={helped}
      data-color={control.color}
    >
      <div ref={track} className='dials-track'>
        {Array.from({ length: control.stops }, (_, stop) => (
          <span key={stop} className='dials-tick' style={{ left: percent(stop, max) }} />
        ))}
        <span className='dials-flag' style={{ left: percent(control.target, max) }}>
          <Flag />
        </span>
        {helped && !matched && <span className='dials-ghost' style={{ left: percent(control.target, max) }} />}
        <button
          type='button'
          className='dials-knob'
          data-carried-now={carried}
          aria-labelledby={`${control.id}-name`}
          aria-describedby={`${control.id}-value`}
          {...button}
          style={{ ...button.style, left: percent(value, max) }}
        >
          {matched && <Check />}
        </button>
      </div>
      <KnobName control={control} value={value} kind={t(strings.slider)} />
    </div>
  );
}

/** The center of the dial and the length of its arm, in the dial picture's units. */
const DIAL = { cx: 100, cy: 104, arm: 74, ticksIn: 82, ticksOut: 94 } as const;

/** The dial points left at 0 and right at the last stop, through straight up. */
function dialPoint(value: number, max: number, radius: number): { x: number; y: number } {
  const angle = Math.PI * (1 - value / max);
  return { x: DIAL.cx + radius * Math.cos(angle), y: DIAL.cy - radius * Math.sin(angle) };
}

function Dial(props: ControlProps) {
  const { control, value, helped } = props;
  const { track, button, carried } = useKnob(props);
  const max = control.stops - 1;
  const matched = value === control.target;
  const tip = dialPoint(value, max, DIAL.arm);
  const flag = dialPoint(control.target, max, DIAL.ticksOut + 4);
  return (
    <div
      className='dials-control dials-dial'
      data-control={control.id}
      data-kind='dial'
      data-value={value}
      data-matched={matched}
      data-helped={helped}
      data-color={control.color}
    >
      <div ref={track} className='dials-face'>
        <svg viewBox='0 0 200 118' className='dials-face-art' aria-hidden='true'>
          <path
            className='dials-arc'
            d={`M${String(DIAL.cx - 96)} ${String(DIAL.cy)} A96 96 0 0 1 ${String(DIAL.cx + 96)} ${String(DIAL.cy)} Z`}
          />
          {Array.from({ length: control.stops }, (_, stop) => {
            const inner = dialPoint(stop, max, DIAL.ticksIn);
            const outer = dialPoint(stop, max, DIAL.ticksOut);
            return (
              <line
                key={stop}
                className='dials-dial-tick'
                data-flag={stop === control.target}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
              />
            );
          })}
          {helped && !matched && (
            <line
              className='dials-ghost-arm'
              x1={DIAL.cx}
              y1={DIAL.cy}
              x2={dialPoint(control.target, max, DIAL.arm).x}
              y2={dialPoint(control.target, max, DIAL.arm).y}
            />
          )}
          <line className='dials-arm' x1={DIAL.cx} y1={DIAL.cy} x2={tip.x} y2={tip.y} />
          <circle className='dials-hub' cx={DIAL.cx} cy={DIAL.cy} r={12} />
          <circle className='dials-tip' cx={tip.x} cy={tip.y} r={matched ? 11 : 8} />
        </svg>
        <span
          className='dials-flag dials-dial-flag'
          style={{ left: `${String((flag.x / 200) * 100)}%`, top: `${String((flag.y / 118) * 100)}%` }}
        >
          <Flag />
        </span>
        <button
          type='button'
          className='dials-dial-button'
          data-carried-now={carried}
          aria-labelledby={`${control.id}-name`}
          aria-describedby={`${control.id}-value`}
          {...button}
        >
          {matched && <Check />}
        </button>
      </div>
      <KnobName control={control} value={value} kind={t(strings.dial)} />
    </div>
  );
}
