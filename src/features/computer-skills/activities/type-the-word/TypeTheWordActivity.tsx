import { useEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames, letterNames } from '../../../../core/strings/shared/index.ts';
import { letterCode, rowOf } from '../../shared/keyboardLayout.ts';
import { KeyboardPicture, type KeyMark } from '../../shared/KeyboardPicture.tsx';
import { NEXT_WORD_MS, type TypeWordLevel } from './level.ts';
import { strings } from './strings.ts';
import './typeTheWord.css';

/** Other letters for one place in the word before its key lights up and is named. */
const WRONG_BEFORE_HELP = 2;
/** How long a pressed key stays lit on the picture. */
const PRESSED_MS = 300;

/**
 * A picture and its word, one word at a time. The word is spoken and shown in pale letters, and
 * each letter the child types fills in. Another letter changes nothing in the word: a quiet nudge,
 * and the key that was pressed lights on the keyboard picture. After two, the right key lights up
 * and its name is said.
 *
 * Keys can come faster than the screen draws, so the key handler reads and writes the word, the
 * letters typed, and the wrong count in one live record, never the values of the last render.
 */
export default function TypeTheWordActivity({ level, kit }: ActivityProps<TypeWordLevel>) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const slots = useRef<HTMLOListElement>(null);
  const live = useRef({ index, typed, wrong });
  const word = level.words[index];
  if (word === undefined) throw new RangeError('A type-the-word level has at least one word.');
  const name = emojiNames[word.id];
  const done = typed >= word.letters.length;
  const next = word.letters[typed];

  // Each word is named as it comes up.
  useEffect(() => {
    kit.setInstruction([strings.type, name]);
  }, [kit, name]);

  function light(code: string): void {
    setPressed(code);
    kit.scope.setTimeout(() => setPressed((current) => (current === code ? null : current)), PRESSED_MS);
  }

  useActivityKeys(kit, (event) => {
    const { index: at, typed: filledSoFar, wrong: wrongSoFar } = live.current;
    const current = level.words[at];
    const want = current?.letters[filledSoFar];
    if (current === undefined || want === undefined) return;
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const letter = event.key.toLowerCase();
    if (!/^[a-z]$/.test(letter)) return;
    event.preventDefault();
    light(event.code);
    if (letter !== want) {
      const count = wrongSoFar + 1;
      live.current = { ...live.current, wrong: count };
      setWrong(count);
      kit.feedback.wrong({ at: slots.current?.children[filledSoFar] ?? undefined });
      if (count === WRONG_BEFORE_HELP) kit.hint(letterNames[want]);
      return;
    }
    kit.play('key-tap');
    const filled = filledSoFar + 1;
    live.current = { index: at, typed: filled, wrong: 0 };
    setWrong(0);
    setTyped(filled);
    if (filled < current.letters.length) return;
    kit.feedback.correct({ at: slots.current ?? undefined });
    void kit.speak(emojiNames[current.id]);
    kit.scope.setTimeout(() => {
      if (at + 1 >= level.words.length) {
        kit.roundComplete();
        return;
      }
      live.current = { index: at + 1, typed: 0, wrong: 0 };
      setIndex(at + 1);
      setTyped(0);
      setWrong(0);
    }, NEXT_WORD_MS);
  });

  const marks: Record<string, KeyMark> = {};
  const showKey = next !== undefined && (level.help === 'key' || wrong >= WRONG_BEFORE_HELP);
  if (showKey) marks[letterCode(next)] = 'target';
  if (pressed !== null) marks[pressed] = 'pressed';
  const rowHint = level.help === 'row' && next !== undefined && !showKey ? rowOf(letterCode(next)) : null;
  const say = () => void kit.speak(name);

  return (
    <div className='ttw-stage' data-word={word.id} data-typed={typed} data-done={done}>
      <div className='ttw-scene'>
        <button type='button' className='ttw-picture' onClick={say} onPointerEnter={say} onFocus={say}>
          <Emoji id={word.id} />
        </button>
        <ol className='ttw-slots' ref={slots} aria-label={t(strings.word)}>
          {word.letters.map((letter, place) => (
            <li
              // The same letter can appear twice in a word, so the place is the key.
              key={place}
              className='ttw-slot'
              data-state={place < typed ? 'typed' : place === typed ? 'next' : 'waiting'}
            >
              {t(letterNames[letter])}
            </li>
          ))}
        </ol>
      </div>
      <div className='ttw-keyboard'>
        <KeyboardPicture label={t(emojiNames.keyboard)} marks={marks} rowHint={rowHint} />
      </div>
    </div>
  );
}
