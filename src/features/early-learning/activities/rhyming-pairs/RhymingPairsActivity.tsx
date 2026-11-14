import { useState, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { strings as feedback } from '../../../../core/strings/shared/feedback.ts';
import { CheckMark } from '../../reading/CheckMark.tsx';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../../reading/useChoiceRound.ts';
import type { Card, RhymingPairsLevel } from './level.ts';
import { strings } from './strings.ts';
import '../../reading/reading.css';

/**
 * Picture cards that say their names under the pointer. The child picks one card, then the
 * card that rhymes with it. A match says both names, so the child hears the rhyme, and both
 * cards rest with a check. A card that does not rhyme says its name and the first card stays
 * picked, so the child can listen again. After two misses the rhyming card stands out.
 */
export default function RhymingPairsActivity({ level, kit }: ActivityProps<RhymingPairsLevel>) {
  const [picked, setPicked] = useState<Card | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(() => new Set());
  const [misses, setMisses] = useState(0);
  // After two misses, the card that rhymes with the picked one stands out.
  const hintFor = picked !== null && misses >= HINT_AFTER_TRIES ? picked : null;
  const columns = level.cards.length <= 4 ? level.cards.length : Math.ceil(level.cards.length / 2);
  const rows = Math.ceil(level.cards.length / columns);

  function press(card: Card, element: HTMLElement): void {
    if (matched.has(card.word) || matched.size === level.cards.length) return;
    const name = emojiNames[card.word];
    if (picked === null || picked.word === card.word) {
      setPicked(picked === null ? card : null);
      setMisses(0);
      kit.play('tap');
      void kit.speak(name);
      return;
    }
    if (picked.rhyme === card.rhyme) {
      const next = new Set(matched).add(picked.word).add(card.word);
      setMatched(next);
      setPicked(null);
      setMisses(0);
      kit.feedback.correct({ at: element });
      void kit.speakSequence([emojiNames[picked.word], name]);
      if (next.size === level.cards.length) kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      return;
    }
    const nextMisses = misses + 1;
    setMisses(nextMisses);
    kit.feedback.wrong({ at: element });
    if (nextMisses === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
    else void kit.speakSequence([name, feedback.tryAnother]);
  }

  const layout = { '--rd-columns': columns, '--rd-rows': rows } as CSSProperties;
  return (
    <div className='rd-stage rd-stage-board'>
      <div className='rd-board'>
        <ul className='rd-cards' style={layout} aria-label={t(strings.cards)}>
          {level.cards.map((card) => {
            const isMatched = matched.has(card.word);
            return (
              <li key={card.word}>
                <button
                  type='button'
                  className='rd-card'
                  data-card={card.word}
                  data-matched={isMatched}
                  data-hint={
                    hintFor !== null && !isMatched && card.rhyme === hintFor.rhyme && card.word !== hintFor.word
                  }
                  aria-pressed={picked?.word === card.word}
                  aria-disabled={isMatched}
                  onPointerEnter={() => void kit.speak(emojiNames[card.word])}
                  onFocus={() => void kit.speak(emojiNames[card.word])}
                  onClick={(event) => press(card, event.currentTarget)}
                >
                  <Emoji id={card.word} />
                  {isMatched && <CheckMark className='rd-card-check' />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
