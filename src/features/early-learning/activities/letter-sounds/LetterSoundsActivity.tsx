import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { letterName, letterSound } from '../../reading/alphabet.ts';
import { ChoiceRow } from '../../reading/ChoiceRow.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import type { LetterSoundsLevel } from './level.ts';
import { strings } from './strings.ts';

/**
 * A big speaker that says the sound, and a row of letters. Each letter says its name when the
 * pointer rests on it, which helps a child who knows names but not yet sounds. A wrong letter
 * says its own name and sound, so the child hears the difference, and the round goes on.
 */
export default function LetterSoundsActivity({ level, kit }: ActivityProps<LetterSoundsLevel>) {
  const sound = letterSound(level.answer);
  useRoundInstruction(kit, [strings.instruction, sound], [strings.instruction]);
  const round = useChoiceRound(kit, level.answer, {
    onRight: [letterName(level.answer), sound],
    onWrong: (letter) => [letterName(letter), letterSound(letter)],
  });

  return (
    <div className='rd-stage' data-answer={level.answer}>
      <div className='rd-prompt'>
        <button
          type='button'
          className='rd-listen'
          data-control='hear'
          aria-label={t(strings.hearAgain)}
          onClick={() => void kit.speak(sound)}
        >
          <Emoji id='speaker' decorative />
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
