import type { CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { PictureChoices } from '../../logic/PictureChoices.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import { isShape, type PatternItem, type WhatComesNextLevel } from './level.ts';
import { shapeName, ShapePicture } from './ShapePicture.tsx';
import { strings } from './strings.ts';
import './whatComesNext.css';

function nameOf(item: PatternItem): readonly SpokenHandle[] {
  return isShape(item) ? shapeName(item) : [emojiNames[item]];
}

function Item({ item }: { item: PatternItem }) {
  return isShape(item) ? <ShapePicture shape={item} /> : <Emoji id={item} />;
}

/**
 * A row of pictures or shapes that repeats, an empty box at its end, and choices below. Each
 * choice says its name under the pointer. The right one fills the box and the row is said out
 * loud, so the child hears the pattern. A wrong one says its name and steps back; after two,
 * the answer stands out.
 */
export default function WhatComesNextActivity({ level, kit }: ActivityProps<WhatComesNextLevel>) {
  // The last unit and the answer, said after the answer, so the child hears the pattern go on.
  const tail = [...level.shown.slice(-level.unit.length), level.answer].flatMap(nameOf);
  const round = useChoiceRound<PatternItem>(kit, level.answer, {
    onRight: tail,
    onWrong: (choice) => nameOf(choice),
  });
  const slots = level.shown.length + 1;
  return (
    <div className='wn-stage' style={{ '--wn-slots': slots } as CSSProperties}>
      <ol className='wn-row' aria-label={t(strings.pattern)}>
        {level.shown.map((item, index) => (
          <li key={index} className='wn-item' data-item={item}>
            <Item item={item} />
          </li>
        ))}
        <li className='wn-item wn-next' data-next={round.answered ? level.answer : ''} aria-label={t(strings.next)}>
          {round.answered ? <Item item={level.answer} /> : <QuestionMark />}
        </li>
      </ol>
      <PictureChoices
        items={level.choices.map((item) => ({ key: item, picture: <Item item={item} />, say: nameOf(item) }))}
        answer={level.answer}
        round={round}
        kit={kit}
        label={t(strings.choices)}
      />
    </div>
  );
}

function QuestionMark() {
  return (
    <svg viewBox='0 0 100 100' aria-hidden='true' focusable='false' className='wn-question'>
      <path d='M34 36c0-10 7-17 16-17s16 6 16 15c0 12-14 13-14 26' />
      <circle cx='52' cy='76' r='5' />
    </svg>
  );
}
