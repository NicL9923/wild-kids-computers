import { useEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames, feedback, letterNames } from '../../../../core/strings/shared/index.ts';
import { letterCode, rowOf } from '../../shared/keyboardLayout.ts';
import { KeyboardPicture, type KeyMark } from '../../shared/KeyboardPicture.tsx';
import './findTheKey.css';
import { NEXT_LETTER_MS, type KeyLevel } from './level.ts';
import { strings } from './strings.ts';

/** Wrong letters for one target before its key lights up. */
const WRONG_BEFORE_HELP = 2;
/** How long a pressed key stays lit on the picture. */
const PRESSED_MS = 300;

/**
 * One big letter at a time, spoken, with a picture of the keyboard below. The child presses the
 * real key; either case counts. A wrong letter lights the key that was pressed on the picture
 * and gets a neutral nudge. After two, the right key lights up.
 *
 * Keys can come faster than the screen draws, so the key handler reads and writes the wrong count
 * and whether the letter is found in one live record, never the values of the last render.
 */
export default function FindTheKeyActivity({ level, kit }: ActivityProps<KeyLevel>) {
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const card = useRef<HTMLButtonElement>(null);
  const live = useRef({ index, wrong, found });
  const letter = level.letters[index];
  if (letter === undefined) throw new RangeError('A find-the-key level has at least one letter.');
  const name = letterNames[letter];

  // Each letter is named as it comes up.
  useEffect(() => {
    kit.setInstruction([strings.press, letterNames[letter]]);
  }, [kit, letter]);

  function light(code: string): void {
    setPressed(code);
    kit.scope.setTimeout(() => setPressed((current) => (current === code ? null : current)), PRESSED_MS);
  }

  useActivityKeys(kit, (event) => {
    const { index: at, wrong: wrongSoFar, found: done } = live.current;
    if (done || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    light(event.code);
    const typed = event.key.toLowerCase();
    if (!/^[a-z]$/.test(typed)) return;
    event.preventDefault();
    const want = level.letters[at];
    if (want === undefined) return;
    if (typed !== want) {
      const count = wrongSoFar + 1;
      live.current = { ...live.current, wrong: count };
      setWrong(count);
      kit.feedback.wrong({ at: card.current ?? undefined });
      if (count === WRONG_BEFORE_HELP && level.help !== 'key') kit.hint(feedback.hereItIs);
      return;
    }
    live.current = { ...live.current, found: true };
    setFound(true);
    kit.feedback.correct({ at: card.current ?? undefined });
    kit.scope.setTimeout(() => {
      if (at + 1 >= level.letters.length) {
        kit.roundComplete();
        return;
      }
      live.current = { index: at + 1, wrong: 0, found: false };
      setIndex(at + 1);
      setWrong(0);
      setFound(false);
    }, NEXT_LETTER_MS);
  });

  const target = letterCode(letter);
  const showKey = level.help === 'key' || wrong >= WRONG_BEFORE_HELP || found;
  const marks: Record<string, KeyMark> = {};
  if (showKey) marks[target] = 'target';
  if (pressed !== null) marks[pressed] = 'pressed';

  return (
    <div className='findkey-stage' data-letter={letter} data-found={found}>
      <button
        ref={card}
        type='button'
        className='findkey-card'
        onPointerEnter={() => void kit.speak(name)}
        onFocus={() => void kit.speak(name)}
        onClick={() => void kit.speak(name)}
      >
        <span className='findkey-upper'>{t(name).toUpperCase()}</span>
        <span className='findkey-lower' aria-hidden='true'>
          {t(name)}
        </span>
      </button>
      <div className='findkey-keyboard'>
        <KeyboardPicture
          label={t(emojiNames.keyboard)}
          marks={marks}
          rowHint={level.help === 'row' && !showKey ? rowOf(target) : null}
        />
      </div>
    </div>
  );
}
