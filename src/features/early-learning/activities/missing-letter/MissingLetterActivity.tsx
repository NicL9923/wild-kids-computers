import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { letterSound } from '../../reading/alphabet.ts';
import { ChoiceRow } from '../../reading/ChoiceRow.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import type { MissingLetterLevel } from './level.ts';
import { strings } from './strings.ts';

/**
 * A picture that says its word, the word with an empty box for one letter, and letters that say
 * their sounds under the pointer, so a child can sound the word out. The right letter fills the
 * box and the word is said again.
 */
export default function MissingLetterActivity({ level, kit }: ActivityProps<MissingLetterLevel>) {
  const word = emojiNames[level.word];
  const { answer } = level;
  useRoundInstruction(kit, [strings.instruction, word], [strings.instruction]);
  const round = useChoiceRound(kit, answer, {
    onRight: [letterSound(answer), word],
    onWrong: (letter) => [letterSound(letter)],
  });

  return (
    <div className='rd-stage' data-word={level.word} data-crowded={level.letters.length > 5}>
      <div className='rd-prompt'>
        <button
          type='button'
          className='rd-listen rd-picture-button'
          data-control='hear'
          aria-label={t(word)}
          onClick={() => void kit.speak(word)}
        >
          <Emoji id={level.word} decorative />
        </button>
        <ol className='rd-slots' aria-label={t(strings.word)}>
          {level.letters.map((letter, index) =>
            index === level.gap ? (
              // A word's letters repeat, so the position is each box's identity.
              <li key={index} className='rd-slot' data-gap data-filled={round.answered}>
                {round.answered ? letter : null}
              </li>
            ) : (
              <li key={index} className='rd-shown' data-shown={letter}>
                {letter}
              </li>
            ),
          )}
        </ol>
      </div>
      <ChoiceRow
        items={level.choices.map((letter) => ({ key: letter, label: letter, say: letterSound(letter) }))}
        answer={answer}
        round={round}
        kit={kit}
        label={t(strings.letters)}
        look='letter'
      />
    </div>
  );
}
