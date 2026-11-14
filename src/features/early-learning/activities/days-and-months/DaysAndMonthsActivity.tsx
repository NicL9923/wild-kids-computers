import type { ActivityKit, ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { ChoiceRow } from '../../reading/ChoiceRow.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import { slotId, useSlotRound } from '../../reading/useSlotRound.ts';
import '../../reading/reading.css';
import './daysAndMonths.css';
import type { DaysAndMonthsLevel, OrderRound, QuestionRound } from './level.ts';
import { nameOf } from './names.ts';
import { strings } from './strings.ts';

/**
 * Two kinds of round. A question shows the named day or month next to an empty box, on the side
 * the answer goes, and offers a few names that each say themselves under the pointer. An order
 * round has a row of boxes and the names below: the child carries each name to its box, by drag,
 * by click and click, or with the keyboard.
 */
export default function DaysAndMonthsActivity({ level, kit }: ActivityProps<DaysAndMonthsLevel>) {
  return level.mode === 'order' ? <PutInOrder level={level} kit={kit} /> : <Question level={level} kit={kit} />;
}

const QUESTIONS = {
  days: { after: strings.dayAfter, before: strings.dayBefore },
  months: { after: strings.monthAfter, before: strings.monthBefore },
} as const;

function Question({ level, kit }: { level: QuestionRound; kit: ActivityKit }) {
  const given = nameOf(level.cycle, level.given);
  const answer = nameOf(level.cycle, level.answer);
  useRoundInstruction(kit, [QUESTIONS[level.cycle][level.mode], given]);
  // Choice keys are the indexes as text, as the shared choice row expects.
  const round = useChoiceRound(kit, String(level.answer), {
    onRight: level.mode === 'after' ? [given, answer] : [answer, given],
    onWrong: (choice) => [nameOf(level.cycle, Number(choice))],
  });
  const gap = (
    <li key='gap' className='rd-slot dm-name' data-look='word' data-gap data-filled={round.answered}>
      {round.answered ? t(answer) : null}
    </li>
  );
  const shown = (
    <li key='given' className='rd-shown dm-name' data-shown={level.given}>
      {t(given)}
    </li>
  );
  return (
    <div className='rd-stage dm-stage' data-mode={level.mode} data-cycle={level.cycle}>
      <div className='rd-prompt'>
        <ol className='rd-slots' aria-label={t(strings.sequence)}>
          {level.mode === 'after' ? [shown, gap] : [gap, shown]}
        </ol>
      </div>
      <ChoiceRow
        items={level.choices.map((choice) => ({
          key: String(choice),
          label: t(nameOf(level.cycle, choice)),
          say: nameOf(level.cycle, choice),
        }))}
        answer={String(level.answer)}
        round={round}
        kit={kit}
        label={t(strings.choices)}
        look='word'
      />
    </div>
  );
}

function PutInOrder({ level, kit }: { level: OrderRound; kit: ActivityKit }) {
  useRoundInstruction(kit, [level.cycle === 'days' ? strings.orderDays : strings.orderMonths]);
  const label = (index: number) => t(nameOf(level.cycle, index));
  const byLabel = new Map(level.run.map((index) => [label(index), nameOf(level.cycle, index)]));
  const said = (value: string) => {
    const handle = byLabel.get(value);
    return handle === undefined ? [] : [handle];
  };
  const { carry, filled, hint, attachTileRow } = useSlotRound(kit, {
    tiles: level.tiles.map((index) => ({ id: `tile-${String(index)}` as const, value: label(index) })),
    answers: level.run.map(label),
    onPlaced: said,
    onDone: [...level.run.map((index) => nameOf(level.cycle, index)), feedback.allDone],
    onMiss: said,
  });
  const placed = new Set(filled);
  return (
    <div className='rd-stage dm-stage' data-mode='order' data-cycle={level.cycle}>
      <div className='rd-prompt'>
        <ol className='rd-slots dm-boxes' aria-label={t(strings.sequence)}>
          {level.run.map((index, place) => {
            const tile = filled[place];
            return (
              <li
                key={slotId(place)}
                className='rd-slot dm-name'
                data-look='word'
                data-box={place}
                data-filled={tile !== null}
                data-hint={hint?.slot === place}
                {...carry.target(slotId(place))}
              >
                {tile === null || tile === undefined ? null : label(index)}
              </li>
            );
          })}
        </ol>
      </div>
      <fieldset ref={attachTileRow} className='rd-tiles' aria-label={t(strings.tiles)}>
        {level.tiles.map((index) => {
          const id = `tile-${String(index)}` as const;
          return placed.has(id) ? (
            <span key={id} className='rd-tile-home dm-name' data-home={id} />
          ) : (
            <button
              key={id}
              type='button'
              className='rd-tile dm-name'
              data-look='word'
              data-tile={index}
              data-hint={hint?.tile === id}
              onPointerEnter={() => void kit.speak(nameOf(level.cycle, index))}
              onFocus={() => void kit.speak(nameOf(level.cycle, index))}
              {...carry.item(id)}
            >
              {label(index)}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
