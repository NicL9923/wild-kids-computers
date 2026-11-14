import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { letterName, letterSound } from '../../reading/alphabet.ts';
import { ChoiceRow } from '../../reading/ChoiceRow.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import type { FirstSoundLevel } from './level.ts';
import { strings } from './strings.ts';

/**
 * A big picture that says its name when pressed, and a row of letters that say their names
 * under the pointer. The right letter says its sound and the word again, so the child hears the
 * sound at the start of the word.
 */
export default function FirstSoundActivity({ level, kit }: ActivityProps<FirstSoundLevel>) {
  const word = emojiNames[level.word];
  useRoundInstruction(kit, [strings.instruction, word], [strings.instruction]);
  const round = useChoiceRound(kit, level.answer, {
    onRight: [letterSound(level.answer), word],
    onWrong: (letter) => [letterName(letter)],
  });

  return (
    <div className='rd-stage' data-word={level.word}>
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
      </div>
      <ChoiceRow
        items={level.choices.map((letter) => ({ key: letter, label: letter, say: letterName(letter) }))}
        answer={level.answer}
        round={round}
        kit={kit}
        label={t(strings.letters)}
        look='letter'
      />
    </div>
  );
}
