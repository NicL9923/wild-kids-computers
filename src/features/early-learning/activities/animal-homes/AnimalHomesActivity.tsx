import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { useSortRound } from '../../sorting/useSortRound.ts';
import './animalHomes.css';
import { HomeArt } from './HomeArt.tsx';
import type { Home } from './homes.ts';
import type { AnimalHomesLevel } from './level.ts';
import { strings } from './strings.ts';

/** The spoken name of each home. Nest and tree use the shared picture names. */
const HOME_NAMES: Readonly<Record<Home, SpokenHandle>> = {
  nest: emojiNames.nest,
  hive: strings.hive,
  web: strings.web,
  pond: strings.pond,
  ocean: strings.ocean,
  cave: strings.cave,
  burrow: strings.burrow,
  barn: strings.barn,
  ice: strings.ice,
  desert: strings.desert,
  tree: emojiNames.tree,
};

type HomeId = `home-${Home}`;
const homeId = (home: Home): HomeId => `home-${home}`;

/**
 * Animals on top and their homes below, as pictures. Every animal and home says its name when
 * the pointer rests on it or it gets focus. The child carries an animal to a home: in its own
 * home it stays and both names are said; in another it goes back with a neutral nudge.
 */
export default function AnimalHomesActivity({ level, kit }: ActivityProps<AnimalHomesLevel>) {
  const homeOf = (id: EmojiId): Home => {
    const animal = level.animals.find((each) => each.id === id);
    if (animal === undefined) throw new Error(`Animal homes has no ${id}.`);
    return animal.home;
  };
  const { carry, placed, hint, attachTray } = useSortRound<EmojiId, HomeId>(kit, {
    required: level.animals.map((animal) => animal.id),
    targets: level.homes.map(homeId),
    fits: (animal, home) => home === homeId(homeOf(animal)),
    holds: 'one',
    onPlaced: (animal) => [emojiNames[animal], HOME_NAMES[homeOf(animal)]],
    onDone: (animal) => [emojiNames[animal], HOME_NAMES[homeOf(animal)]],
    onMiss: (animal) => [emojiNames[animal]],
  });

  return (
    <div className='ah-stage' data-count={level.animals.length}>
      <ul ref={attachTray} className='ah-animals' aria-label={t(strings.animals)}>
        {level.animals.map((animal) => (
          <li key={animal.id} className='ah-animal-spot'>
            {!placed.has(animal.id) && (
              <button
                type='button'
                className='ah-animal'
                data-animal={animal.id}
                data-hint={hint?.item === animal.id}
                aria-label={t(emojiNames[animal.id])}
                onPointerEnter={() => void kit.speak(emojiNames[animal.id])}
                onFocus={() => void kit.speak(emojiNames[animal.id])}
                {...carry.item(animal.id)}
              >
                <Emoji id={animal.id} decorative />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ul className='ah-homes' aria-label={t(strings.homes)}>
        {level.homes.map((home) => {
          const resident = level.animals.find((animal) => placed.get(animal.id) === homeId(home));
          return (
            <li
              key={home}
              className='ah-home'
              data-home={home}
              data-filled={resident !== undefined}
              data-hint={hint?.target === homeId(home)}
              aria-label={t(HOME_NAMES[home])}
              onPointerEnter={() => void kit.speak(HOME_NAMES[home])}
              {...carry.target(homeId(home))}
            >
              <HomeArt home={home} />
              {resident !== undefined && (
                <span className='ah-resident' data-resident={resident.id}>
                  <Emoji id={resident.id} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
