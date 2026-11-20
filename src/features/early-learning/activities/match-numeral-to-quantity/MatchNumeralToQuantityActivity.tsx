import { useEffect, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { ObjectGroup, PER_ROW } from '../../math/ObjectGroup.tsx';
import { strings as math } from '../../math/strings.ts';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import './matchNumeralToQuantity.css';
import type { MatchLevel } from './level.ts';
import { strings } from './strings.ts';

/**
 * A numeral on a card, and groups of things below it. The card says its number when touched.
 * Picking the group with that many ends the round. A wrong group is set aside, and after two
 * the right one is shown more plainly.
 */
export default function MatchNumeralToQuantityActivity({ level, kit }: ActivityProps<MatchLevel>) {
  const number = numberHandle(level.target);
  const round = useChoiceRound(kit, { answer: level.answer, sayCorrect: [number, feedback.thatsIt] });
  // Every card has room for the largest group, so the things are one size in every card.
  const rows = Math.max(2, Math.ceil(Math.max(...level.groups.map((group) => group.count)) / PER_ROW));
  const shape = { '--cols': PER_ROW, '--rows': rows } as CSSProperties;

  // Names the number for this round.
  useEffect(() => {
    kit.setInstruction([strings.find, number]);
  }, [kit, number]);

  return (
    <div className='math-stage match-stage'>
      <button type='button' className='match-numeral' onClick={() => void kit.speak(number)}>
        {t(number)}
      </button>
      <fieldset className='math-groups' aria-label={t(math.groups)} style={shape}>
        {level.groups.map((group) => {
          const look = round.lookOf(group.id);
          return (
            <button
              key={group.id}
              type='button'
              className='math-group'
              data-group={group.id}
              data-look={look}
              disabled={look === 'tried' || look === 'done'}
              onClick={(event) => round.choose(group.id, event.currentTarget)}
            >
              <ObjectGroup kind={level.kind} count={group.count} />
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
