import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { isLetter, letterSound, type Letter } from '../../reading/alphabet.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import { slotId, useSlotRound } from '../../reading/useSlotRound.ts';
import type { BuildTheWordLevel } from './level.ts';
import { strings } from './strings.ts';
import '../../reading/reading.css';

/** The sounds of the tile values, which are always letters here. */
const soundsOf = (value: string) => (isLetter(value) ? [letterSound(value)] : []);

/**
 * A picture that says its word, a row of boxes, and letter tiles that say their sounds under
 * the pointer. The child drags a tile to a box, or clicks the tile and then the box, or uses the
 * keyboard. A tile in its box stays and says its sound; in another box it goes back home.
 */
export default function BuildTheWordActivity({ level, kit }: ActivityProps<BuildTheWordLevel>) {
  const word = emojiNames[level.word];
  useRoundInstruction(kit, [strings.instruction, word], [strings.instruction]);
  const { carry, filled, hint, attachTileRow } = useSlotRound(kit, {
    tiles: level.tiles.map((tile) => ({ id: tile.id, value: tile.letter })),
    answers: level.letters,
    onPlaced: soundsOf,
    onDone: [...level.letters.map((letter: Letter) => letterSound(letter)), word],
    onMiss: soundsOf,
  });
  const placed = new Set(filled);

  return (
    <div className='rd-stage' data-word={level.word} data-crowded={level.tiles.length > 7}>
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
        <ol className='rd-slots' aria-label={t(strings.boxes)}>
          {level.letters.map((letter, index) => {
            const isFilled = filled[index] !== null;
            const shownLetter = isFilled || level.guide ? letter : null;
            return (
              <li
                key={slotId(index)}
                className='rd-slot'
                data-box={index}
                data-filled={isFilled}
                data-hint={hint?.slot === index}
                {...carry.target(slotId(index))}
              >
                {shownLetter !== null && <span className={isFilled ? undefined : 'rd-slot-guide'}>{shownLetter}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      <fieldset ref={attachTileRow} className='rd-tiles' aria-label={t(strings.tiles)}>
        {level.tiles.map((tile) =>
          placed.has(tile.id) ? (
            <span key={tile.id} className='rd-tile-home' data-home={tile.id} />
          ) : (
            <button
              key={tile.id}
              type='button'
              className='rd-tile'
              data-look='letter'
              data-tile={tile.id}
              data-hint={hint?.tile === tile.id}
              onPointerEnter={() => void kit.speak(letterSound(tile.letter))}
              onFocus={() => void kit.speak(letterSound(tile.letter))}
              {...carry.item(tile.id)}
            >
              {tile.letter}
            </button>
          ),
        )}
      </fieldset>
    </div>
  );
}
