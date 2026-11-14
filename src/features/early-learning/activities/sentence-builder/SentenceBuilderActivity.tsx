import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import { slotId, useSlotRound } from '../../reading/useSlotRound.ts';
import type { SentenceBuilderLevel } from './level.ts';
import { sentenceHandle, strings } from './strings.ts';
import '../../reading/reading.css';

const NOTHING_TO_SAY = () => [];

/**
 * A picture of the sentence, a row of empty places ending in a period, and word tiles. The child
 * hears the sentence and moves each word to its place by dragging, by clicking the word and then
 * the place, or with the keyboard. A word in its place stays; in another place it goes back.
 */
export default function SentenceBuilderActivity({ level, kit }: ActivityProps<SentenceBuilderLevel>) {
  const sentence = sentenceHandle(level.sentence);
  useRoundInstruction(kit, [strings.instruction, sentence], [strings.instruction]);
  const { carry, filled, hint, attachTileRow } = useSlotRound(kit, {
    tiles: level.tiles.map((tile) => ({ id: tile.id, value: tile.word })),
    answers: level.words,
    onPlaced: NOTHING_TO_SAY,
    onDone: [sentence],
    onMiss: NOTHING_TO_SAY,
  });
  const placed = new Set(filled);

  return (
    <div className='rd-stage' data-sentence={level.sentence} data-crowded={level.tiles.length > 6}>
      <div className='rd-prompt rd-prompt-stack'>
        <button
          type='button'
          className='rd-listen rd-picture-button rd-picture-small'
          data-control='hear'
          aria-label={t(sentence)}
          onClick={() => void kit.speak(sentence)}
        >
          <Emoji id={level.picture} decorative />
        </button>
        <ol className='rd-slots' aria-label={t(strings.places)}>
          {level.words.map((word, index) => {
            const tile = filled[index] ?? null;
            return (
              <li
                key={slotId(index)}
                className='rd-slot'
                data-look='word'
                data-place={index}
                data-filled={tile !== null}
                data-hint={hint?.slot === index}
                data-last={index === level.words.length - 1}
                {...carry.target(slotId(index))}
              >
                {tile === null ? null : word}
              </li>
            );
          })}
        </ol>
      </div>
      <fieldset ref={attachTileRow} className='rd-tiles' aria-label={t(strings.tiles)}>
        {level.tiles.map((tile) =>
          placed.has(tile.id) ? (
            <span key={tile.id} className='rd-tile-home' data-look='word' data-home={tile.id} />
          ) : (
            <button
              key={tile.id}
              type='button'
              className='rd-tile'
              data-look='word'
              data-tile={tile.id}
              data-hint={hint?.tile === tile.id}
              {...carry.item(tile.id)}
            >
              {tile.word}
            </button>
          ),
        )}
      </fieldset>
    </div>
  );
}
