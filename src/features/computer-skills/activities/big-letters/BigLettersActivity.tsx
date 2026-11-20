import { useEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import { KeyboardPicture, type KeyMark } from '../../shared/KeyboardPicture.tsx';
import './bigLetters.css';
import { judge } from './judge.ts';
import { NEXT_ITEM_MS, shiftFor, UNSHIFTED, type ShiftLevel } from './level.ts';
import { charSpeech, itemSpeech } from './speech.ts';
import { strings } from './strings.ts';

/** Other characters for one place before Shift and the key light up and the character is named. */
const WRONG_BEFORE_HELP = 2;
/** How long a pressed key stays lit on the picture. */
const PRESSED_MS = 300;

/** A key cap drawn for the combination to press: Shift, the key, or both. */
function KeyCap({ main, under, shift }: { main: string; under?: string; shift?: boolean }) {
  return (
    <span className='big-cap' data-cap={shift === true ? 'shift' : 'key'}>
      {shift === true && (
        <svg className='big-cap-arrow' viewBox='0 0 40 40' aria-hidden='true'>
          <path d='M20 4 L36 22 H27 V36 H13 V22 H4 Z' />
        </svg>
      )}
      <span className='big-cap-main'>{main}</span>
      {under !== undefined && <span className='big-cap-under'>{under}</span>}
    </span>
  );
}

/**
 * One thing to type at a time that needs Shift: a capital, a sign, or a short word. The keys to
 * hold and press are drawn as key caps and lit on the keyboard picture. Pressing the key without
 * Shift says to keep Shift held down; a key that is not the one changes nothing but a quiet nudge.
 *
 * Keys can come faster than the screen draws, so the key handler reads and writes the item, the
 * characters typed, and the wrong count in one live record, never the values of the last render.
 */
export default function BigLettersActivity({ level, kit }: ActivityProps<ShiftLevel>) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [capsLock, setCapsLock] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const chars = useRef<HTMLSpanElement>(null);
  const live = useRef({ index, typed, wrong });
  const item = level.items[index];
  if (item === undefined) throw new RangeError('A big-letters level has at least one item.');
  const want = item.chars[typed];
  const done = want === undefined;

  // Each item is named as it comes up.
  useEffect(() => {
    kit.setInstruction([item.kind === 'word' ? strings.type : strings.holdShiftType, ...itemSpeech(item)]);
  }, [kit, item]);

  function light(code: string): void {
    setPressed(code);
    kit.scope.setTimeout(() => setPressed((current) => (current === code ? null : current)), PRESSED_MS);
  }

  useActivityKeys(kit, (event) => {
    const { index: at, typed: filledSoFar, wrong: wrongSoFar } = live.current;
    const current = level.items[at];
    const char = current?.chars[filledSoFar];
    if (current === undefined || char === undefined) return;
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'CapsLock') {
      setCapsLock(event.getModifierState('CapsLock'));
      return;
    }
    // Shift on its own, and keys that type nothing, are part of getting ready.
    if (Array.from(event.key).length !== 1) return;
    event.preventDefault();
    light(event.code);
    const kind = judge(event, char);
    setCapsLock(event.getModifierState('CapsLock'));
    if (kind === 'caps-lock') {
      kit.hint(strings.capsLock);
      return;
    }
    if (kind !== 'right') {
      const count = wrongSoFar + 1;
      live.current = { ...live.current, wrong: count };
      setWrong(count);
      const say = kind === 'no-shift' ? strings.holdShift : kind === 'extra-shift' ? strings.letGo : undefined;
      kit.feedback.wrong({
        at: chars.current?.children[filledSoFar] ?? undefined,
        ...(say === undefined ? {} : { say }),
      });
      if (count === WRONG_BEFORE_HELP && kind === 'other') kit.hint(charSpeech(char.char)[0]);
      return;
    }
    kit.play('key-tap');
    const filled = filledSoFar + 1;
    live.current = { index: at, typed: filled, wrong: 0 };
    setWrong(0);
    setTyped(filled);
    if (filled < current.chars.length) return;
    kit.feedback.correct({ at: chars.current ?? undefined });
    kit.scope.setTimeout(() => {
      if (at + 1 >= level.items.length) {
        kit.roundComplete();
        return;
      }
      live.current = { index: at + 1, typed: 0, wrong: 0 };
      setIndex(at + 1);
      setTyped(0);
      setWrong(0);
    }, NEXT_ITEM_MS);
  });

  const helped = wrong >= WRONG_BEFORE_HELP;
  const showCaps = want !== undefined && (level.help !== 'none' || helped);
  const showKey = want !== undefined && (level.help === 'keys' || helped || !want.shift);
  const marks: Record<string, KeyMark> = {};
  if (want !== undefined && showCaps) {
    if (want.shift) marks[shiftFor(want.code)] = 'target';
    if (showKey) marks[want.code] = 'target';
  }
  if (capsLock) marks.CapsLock = 'target';
  if (pressed !== null) marks[pressed] = 'pressed';
  const say = () => void kit.speakSequence(itemSpeech(item));
  // A key cap shows the plain character under a sign, as printed on a real key.
  const under = want === undefined || !want.shift ? undefined : UNSHIFTED[want.code];

  return (
    <div className='big-stage' data-item={item.text} data-typed={typed} data-done={done} data-caps-lock={capsLock}>
      <div className='big-scene'>
        <button
          type='button'
          className='big-card'
          data-kind={item.kind}
          onClick={say}
          onPointerEnter={say}
          onFocus={say}
        >
          <span className='big-chars' ref={chars}>
            {item.chars.map((char, place) => (
              <span
                // A word can hold the same character twice, so the place is the key.
                key={place}
                className='big-char'
                data-state={place < typed ? 'typed' : place === typed ? 'next' : 'waiting'}
              >
                {char.char}
              </span>
            ))}
          </span>
        </button>
        <div className='big-combo' data-shown={showCaps}>
          {want !== undefined && showCaps && (
            <>
              {want.shift && <KeyCap main={t(strings.shiftKey)} shift />}
              {want.shift && (
                <span className='big-combo-and' aria-hidden='true'>
                  {t(strings.plusMark)}
                </span>
              )}
              <KeyCap main={want.char} {...(under === undefined ? {} : { under })} />
            </>
          )}
        </div>
      </div>
      <div className='big-keyboard'>
        <KeyboardPicture label={t(emojiNames.keyboard)} marks={marks} />
      </div>
    </div>
  );
}
