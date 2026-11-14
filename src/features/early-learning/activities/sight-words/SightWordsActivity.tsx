import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { ChoiceRow } from '../../reading/ChoiceRow.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import type { SightWordsLevel } from './level.ts';
import { strings, wordHandle } from './strings.ts';

/**
 * A speaker that says the word, and the written words to pick from. Reading the word is the
 * goal, so the words stay quiet under the pointer. A wrong word says itself, so every try reads
 * a word out loud, and the round goes on.
 */
export default function SightWordsActivity({ level, kit }: ActivityProps<SightWordsLevel>) {
  const word = wordHandle(level.answer);
  useRoundInstruction(kit, [strings.instruction, word], [strings.instruction]);
  const round = useChoiceRound(kit, level.answer, {
    onRight: [word],
    onWrong: (choice) => [wordHandle(choice)],
  });

  return (
    <div className='rd-stage' data-answer={level.answer}>
      <div className='rd-prompt'>
        <button
          type='button'
          className='rd-listen'
          data-control='hear'
          aria-label={t(strings.hearAgain)}
          onClick={() => void kit.speak(word)}
        >
          <Emoji id='speaker' decorative />
        </button>
      </div>
      <ChoiceRow
        items={level.choices.map((choice) => ({ key: choice, label: t(wordHandle(choice)) }))}
        answer={level.answer}
        round={round}
        kit={kit}
        label={t(strings.words)}
        look='word'
      />
    </div>
  );
}
