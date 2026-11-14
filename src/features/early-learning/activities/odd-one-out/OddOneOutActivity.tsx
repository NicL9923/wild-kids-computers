import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames, type EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { PictureChoices } from '../../logic/PictureChoices.tsx';
import { useChoiceRound } from '../../reading/useChoiceRound.ts';
import type { GroupId, OddOneOutLevel } from './level.ts';
import { strings } from './strings.ts';
import './oddOneOut.css';

/** The reason said after the answer, by the group the other pictures share. */
const REASONS: Partial<Record<GroupId, SpokenHandle>> = {
  fruit: strings.fruit,
  vegetables: strings.vegetables,
  sweets: strings.sweets,
  farm: strings.farm,
  sea: strings.sea,
  birds: strings.birds,
  bugs: strings.bugs,
  road: strings.road,
  clothes: strings.clothes,
  instruments: strings.instruments,
  balls: strings.balls,
  sky: strings.sky,
};

/**
 * A row of big pictures that say their names under the pointer. The child clicks the one that
 * does not belong. The answer says its name and why, "The others are all fruit." A wrong pick
 * says its name and steps back; after two, the odd picture stands out.
 */
export default function OddOneOutActivity({ level, kit }: ActivityProps<OddOneOutLevel>) {
  const reason = REASONS[level.group];
  const round = useChoiceRound<EmojiId>(kit, level.odd, {
    onRight: reason === undefined ? [emojiNames[level.odd]] : [emojiNames[level.odd], reason],
    onWrong: (choice) => [emojiNames[choice]],
  });
  return (
    <div className='oo-stage'>
      <PictureChoices
        items={level.items.map((item) => ({ key: item, picture: <Emoji id={item} />, say: [emojiNames[item]] }))}
        answer={level.odd}
        round={round}
        kit={kit}
        label={t(strings.pictures)}
      />
    </div>
  );
}
