import { useEffect, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { ObjectGroup, PER_ROW } from '../../math/ObjectGroup.tsx';
import { strings as math } from '../../math/strings.ts';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import type { Ask, MoreLevel } from './level.ts';
import { strings } from './strings.ts';

const QUESTION: Readonly<Record<Ask, SpokenHandle>> = {
  more: strings.more,
  fewer: strings.fewer,
  most: strings.most,
  fewest: strings.fewest,
};

/**
 * Two or three groups of the same things, side by side. The spoken question asks for the group
 * with more or fewer. A wrong group is set aside, and after two tries the right one is shown
 * more plainly.
 */
export default function MoreOrFewerActivity({ level, kit }: ActivityProps<MoreLevel>) {
  const answer = level.groups.find((group) => group.id === level.answer);
  const round = useChoiceRound(kit, {
    answer: level.answer,
    sayCorrect: [numberHandle(answer?.count ?? 0), feedback.thatsIt],
  });
  const largest = Math.max(...level.groups.map((group) => group.count));
  // A scattered card is nearly square, like its board; rows keep the shape of five across.
  const shape = (
    level.arrangement === 'scatter'
      ? { '--cols': 10, '--rows': 9 }
      : { '--cols': PER_ROW, '--rows': Math.max(2, Math.ceil(largest / PER_ROW)) }
  ) as CSSProperties;

  // The shell asks "more" as the round starts; any other question replaces it.
  const question = QUESTION[level.ask];
  useEffect(() => {
    if (question === strings.more) return undefined;
    return kit.scope.setTimeout(() => kit.setInstruction(question), 0);
  }, [kit, question]);

  return (
    <div className='math-stage'>
      <fieldset className='math-groups' aria-label={t(math.groups)} style={shape} data-ask={level.ask}>
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
              <ObjectGroup kind={level.kind} count={group.count} spots={group.spots ?? undefined} size={level.size} />
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
