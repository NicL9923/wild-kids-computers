import { useRef, useState, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import { CheckMark } from '../../reading/CheckMark.tsx';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../../reading/useChoiceRound.ts';
import type { MemoryCard, MemoryPairsLevel } from './level.ts';
import { strings } from './strings.ts';
import './memoryPairs.css';

/** How long two cards that differ stay face up, so the child can look at both. */
const SHOW_MS = 1800;

/**
 * Cards face down in a grid. Turning one says its picture's name. Two that match stay up with a
 * check; two that differ turn back after a moment, or at once when the child turns another card.
 * A miss counts as a mistake only when the child had already seen where the match was, because
 * a first look can only be a guess. After two such misses the match of a turned card glows.
 */
export default function MemoryPairsActivity({ level, kit }: ActivityProps<MemoryPairsLevel>) {
  const [up, setUp] = useState<readonly string[]>([]);
  const [matched, setMatched] = useState<ReadonlySet<string>>(() => new Set());
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [misses, setMisses] = useState(0);
  const turnBack = useRef<(() => void) | null>(null);
  const hinted = useRef<string | null>(null);
  const done = matched.size === level.cards.length;
  const rows = Math.ceil(level.cards.length / level.columns);

  const byId = new Map(level.cards.map((card) => [card.id, card]));
  const partnerOf = (card: MemoryCard) =>
    level.cards.find((other) => other.id !== card.id && other.picture === card.picture);

  // With one card up and enough misses, its match glows when the child has seen it before.
  const single = up.length === 1 ? byId.get(up[0] ?? '') : undefined;
  const singlePartner = single === undefined ? undefined : partnerOf(single);
  const hintCard =
    misses >= HINT_AFTER_TRIES && singlePartner !== undefined && seen.has(singlePartner.id) ? singlePartner.id : null;

  function turn(card: MemoryCard, element: HTMLElement): void {
    if (done || matched.has(card.id) || up.includes(card.id)) return;
    // A third card closes the two that differ at once, so the child never waits.
    const open = up.length === 2 ? [] : up;
    if (up.length === 2) {
      turnBack.current?.();
      turnBack.current = null;
    }
    void kit.speak(emojiNames[card.picture]);
    kit.play('tap');
    const nextSeen = new Set(seen).add(card.id);
    setSeen(nextSeen);
    const first = open.length === 1 ? byId.get(open[0] ?? '') : undefined;
    if (first === undefined) {
      setUp([card.id]);
      const partner = partnerOf(card);
      if (misses >= HINT_AFTER_TRIES && partner !== undefined && seen.has(partner.id) && hinted.current !== card.id) {
        hinted.current = card.id;
        kit.hint();
      }
      return;
    }
    if (first.picture === card.picture) {
      const next = new Set(matched).add(first.id).add(card.id);
      setMatched(next);
      setUp([]);
      setMisses(0);
      kit.feedback.correct({ at: element });
      if (next.size === level.cards.length) {
        void kit.speakSequence([emojiNames[card.picture], feedback.allDone]);
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      }
      return;
    }
    setUp([first.id, card.id]);
    // A miss is a mistake only when the child could have known better: the first card's match
    // was turned before, or this card was, so its picture was no surprise.
    const firstPartner = partnerOf(first);
    const knew = (firstPartner !== undefined && seen.has(firstPartner.id)) || seen.has(card.id);
    if (knew) {
      setMisses(misses + 1);
      kit.feedback.wrong({ at: element });
    }
    turnBack.current = kit.scope.setTimeout(() => {
      turnBack.current = null;
      setUp([]);
    }, SHOW_MS);
  }

  const layout = { '--mp-columns': level.columns, '--mp-rows': rows } as CSSProperties;
  return (
    <div className='mp-stage'>
      <ul className='mp-cards' style={layout} aria-label={t(strings.cards)} data-done={done}>
        {level.cards.map((card, index) => {
          const isMatched = matched.has(card.id);
          const isUp = isMatched || up.includes(card.id);
          return (
            <li key={card.id}>
              <button
                type='button'
                className='mp-card'
                data-card={card.id}
                data-picture={isUp ? card.picture : undefined}
                data-up={isUp}
                data-matched={isMatched}
                data-hint={hintCard === card.id}
                aria-disabled={isMatched}
                aria-label={isUp ? undefined : [t(strings.card), t(numberHandle(index + 1))].join(' ')}
                onClick={(event) => turn(card, event.currentTarget)}
              >
                {isUp ? <Emoji id={card.picture} className='mp-picture' /> : <CardBack />}
                {isMatched && <CheckMark className='mp-check' />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The back of every card: a leaf on a soft ring, the same on every card. */
function CardBack() {
  return (
    <svg className='mp-back' viewBox='0 0 100 100' aria-hidden='true' focusable='false'>
      <circle cx='50' cy='50' r='30' className='mp-back-ring' />
      <path d='M50 30c14 8 16 26 0 40c-16-14-14-32 0-40z' className='mp-back-leaf' />
      <path d='M50 36v30' className='mp-back-vein' />
    </svg>
  );
}
