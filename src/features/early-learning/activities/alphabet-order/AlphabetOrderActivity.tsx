import { useEffect, useRef, useState } from 'react';
import type { ActivityKit, ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as feedback } from '../../../../core/strings/shared/feedback.ts';
import { letterName, type Letter } from '../../reading/alphabet.ts';
import { ChoiceRow } from '../../reading/ChoiceRow.tsx';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES, useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import type { AlphabetOrderLevel } from './level.ts';
import { strings } from './strings.ts';

/**
 * Two kinds of round. "What comes next" shows a run of letters and an empty box after it, and
 * says the run out loud. "Put in order" has a row of empty boxes and the letters below them: the
 * child clicks the letter that comes first, then the next, and each one moves up into its box.
 */
export default function AlphabetOrderActivity({ level, kit }: ActivityProps<AlphabetOrderLevel>) {
  return level.mode === 'next' ? (
    <NextLetter run={level.run} answer={level.answer} choices={level.choices} kit={kit} />
  ) : (
    <PutInOrder letters={level.letters} shuffled={level.shuffled} kit={kit} />
  );
}

function NextLetter({
  run,
  answer,
  choices,
  kit,
}: {
  run: readonly Letter[];
  answer: Letter;
  choices: readonly Letter[];
  kit: ActivityKit;
}) {
  const names = run.map(letterName);
  useRoundInstruction(kit, [strings.whatComesNext, ...names]);
  const round = useChoiceRound(kit, answer, {
    onRight: [...names, letterName(answer)],
    onWrong: (letter) => [letterName(letter)],
  });

  return (
    <div className='rd-stage' data-mode='next'>
      <div className='rd-prompt'>
        <ol className='rd-slots rd-sequence' aria-label={t(strings.sequence)}>
          {run.map((letter) => (
            <li key={letter} className='rd-shown' data-shown={letter}>
              {letter}
            </li>
          ))}
          <li className='rd-slot' data-filled={round.answered} data-gap>
            {round.answered ? answer : null}
          </li>
        </ol>
      </div>
      <ChoiceRow
        items={choices.map((letter) => ({ key: letter, label: letter, say: letterName(letter) }))}
        answer={answer}
        round={round}
        kit={kit}
        label={t(strings.letters)}
        look='letter'
      />
    </div>
  );
}

function PutInOrder({
  letters,
  shuffled,
  kit,
}: {
  letters: readonly Letter[];
  shuffled: readonly Letter[];
  kit: ActivityKit;
}) {
  useRoundInstruction(kit, [strings.putInOrder]);
  const [placed, setPlaced] = useState(0);
  // Wrong tries since the last right one. The hint is for the letter the child is looking for now.
  const [tries, setTries] = useState(0);
  const done = placed === letters.length;
  const wanted = letters[placed];
  const hinted = !done && tries >= HINT_AFTER_TRIES;
  const pool = useRef<HTMLFieldSetElement | null>(null);

  // A placed letter leaves the row. When it had focus, focus moves to the first letter left, so
  // a keyboard player carries on from there.
  useEffect(() => {
    if (placed === 0 || done) return;
    if (document.activeElement === null || document.activeElement === document.body) {
      pool.current?.querySelector('button')?.focus();
    }
  }, [placed, done]);

  function choose(letter: Letter, element: HTMLElement): void {
    if (done || letters.indexOf(letter) < placed) return;
    if (letter === wanted) {
      const next = placed + 1;
      setPlaced(next);
      setTries(0);
      kit.feedback.correct({ at: element });
      if (next === letters.length) {
        void kit.speakSequence(letters.map(letterName));
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      } else {
        void kit.speak(letterName(letter));
      }
      return;
    }
    const nextTries = tries + 1;
    setTries(nextTries);
    kit.feedback.wrong({ at: element });
    if (nextTries === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
    else void kit.speakSequence([letterName(letter), feedback.tryAnother]);
  }

  return (
    <div className='rd-stage' data-mode='order'>
      <div className='rd-prompt'>
        <ol className='rd-slots' aria-label={t(strings.sequence)}>
          {letters.map((letter, index) => (
            <li key={letter} className='rd-slot' data-slot={index} data-filled={index < placed}>
              {index < placed ? letter : null}
            </li>
          ))}
        </ol>
      </div>
      <fieldset ref={pool} className='rd-choices' aria-label={t(strings.letters)}>
        {shuffled.map((letter) => {
          const isPlaced = letters.indexOf(letter) < placed;
          return isPlaced ? (
            <span key={letter} className='rd-tile-home' data-placed={letter} />
          ) : (
            <button
              key={letter}
              type='button'
              className='rd-choice'
              data-look='letter'
              data-choice={letter}
              data-hint={hinted && letter === wanted}
              onPointerEnter={() => void kit.speak(letterName(letter))}
              onFocus={() => void kit.speak(letterName(letter))}
              onClick={(event) => choose(letter, event.currentTarget)}
            >
              {letter}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
