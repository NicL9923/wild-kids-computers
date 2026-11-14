import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { letterName, shown } from '../../reading/alphabet.ts';
import { ChoiceRow } from '../../reading/ChoiceRow.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import type { FindTheLetterLevel } from './level.ts';
import { strings } from './strings.ts';

/**
 * A speaker that names the letter, and the letters to search. Knowing a letter by sight is the
 * goal, so the letters stay quiet under the pointer, unlike other choices for the youngest. A
 * wrong letter says its own name, so every try teaches a letter, and the round goes on.
 */
export default function FindTheLetterActivity({ level, kit }: ActivityProps<FindTheLetterLevel>) {
  const name = letterName(level.answer);
  useRoundInstruction(kit, [strings.instruction, name], [strings.instruction]);
  const round = useChoiceRound(kit, level.answer, {
    onRight: [name],
    onWrong: (letter) => [letterName(letter)],
  });

  return (
    <div className='rd-stage' data-answer={level.answer}>
      <div className='rd-prompt'>
        <button
          type='button'
          className='rd-listen'
          data-control='hear'
          aria-label={t(strings.hearAgain)}
          onClick={() => void kit.speak(name)}
        >
          <Emoji id='speaker' decorative />
        </button>
      </div>
      <ChoiceRow
        items={level.choices.map((letter) => ({ key: letter, label: shown(letter, level.letterCase) }))}
        answer={level.answer}
        round={round}
        kit={kit}
        label={t(strings.letters)}
        look='letter'
      />
    </div>
  );
}
