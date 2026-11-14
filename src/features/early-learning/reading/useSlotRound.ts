import { useCallback, useEffect, useRef, useState } from 'react';
import { useCarry, type Carry } from '../../../activityShell/carry/useCarry.ts';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { strings as feedback } from '../../../core/strings/shared/feedback.ts';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from './useChoiceRound.ts';

export type SlotId = `slot-${number}`;

export const slotId = (index: number): SlotId => `slot-${index}`;

interface SlotTile<T extends string> {
  readonly id: T;
  /** What the tile says on screen, such as a letter or a word. Tiles that show the same fit the same place. */
  readonly value: string;
}

export interface SlotRoundOptions<T extends string> {
  readonly tiles: readonly SlotTile<T>[];
  /** What each place takes, in order. */
  readonly answers: readonly string[];
  /** What to say when a tile lands in its place, unless it finished the round. */
  readonly onPlaced: (value: string) => readonly SpokenHandle[];
  /** What to say when the last tile lands. */
  readonly onDone: readonly SpokenHandle[];
  /** What to say before "Try another one." when a tile does not fit. */
  readonly onMiss: (value: string) => readonly SpokenHandle[];
}

export interface SlotRound<T extends string> {
  readonly carry: Carry<T, SlotId>;
  /** The tile in each place, by place index, or null while empty. */
  readonly filled: readonly (T | null)[];
  readonly done: boolean;
  /** After two misses in a row: the place to fill next and a tile for it. */
  readonly hint: { readonly slot: number; readonly tile: T } | null;
  /** A callback ref for the tiles' container, so focus can move on when a focused tile is placed. */
  readonly attachTileRow: (element: HTMLFieldSetElement | null) => void;
}

type RoundKit = Pick<
  ActivityKit<unknown>,
  'scope' | 'play' | 'feedback' | 'hint' | 'speak' | 'speakSequence' | 'roundComplete'
>;

/**
 * A round of putting tiles in places: letters into a word, words into a sentence. A tile moves
 * with `useCarry`, so it can be dragged, clicked up and clicked down, or carried with the
 * keyboard. Every empty place takes a tile, so the outline never says which place is right. A
 * tile that fits stays; one that does not goes back with the kit's neutral nudge. After two
 * misses in a row the next place and a tile for it stand out, and the kit counts a hint.
 */
export function useSlotRound<T extends string>(kit: RoundKit, options: SlotRoundOptions<T>): SlotRound<T> {
  const { tiles, answers } = options;
  const [filled, setFilled] = useState<readonly (T | null)[]>(() => answers.map(() => null));
  const [misses, setMisses] = useState(0);
  const done = filled.every((tile) => tile !== null);
  const tileRow = useRef<HTMLFieldSetElement | null>(null);
  const placedCount = filled.filter((tile) => tile !== null).length;
  const attachTileRow = useCallback((element: HTMLFieldSetElement | null) => {
    tileRow.current = element;
  }, []);

  // A placed tile leaves the row. When it had focus, focus moves to the first tile left, so a
  // keyboard player carries on from there.
  useEffect(() => {
    if (placedCount === 0 || done) return;
    if (document.activeElement === null || document.activeElement === document.body) {
      tileRow.current?.querySelector('button')?.focus();
    }
  }, [placedCount, done]);

  const carry = useCarry<T, SlotId>(kit, {
    kind: 'targets',
    accepts: (_tile, slot) => filled[Number(slot.slice('slot-'.length))] === null,
    onDrop(tileId, slot) {
      const index = Number(slot.slice('slot-'.length));
      const tile = tiles.find((each) => each.id === tileId);
      if (tile === undefined || filled[index] !== null) return;
      const at = document.querySelector(`[data-carry-target="${slot}"]`) ?? undefined;
      if (tile.value !== answers[index]) {
        const nextMisses = misses + 1;
        setMisses(nextMisses);
        kit.feedback.wrong({ at });
        if (nextMisses === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
        else void kit.speakSequence([...options.onMiss(tile.value), feedback.tryAnother]);
        return;
      }
      const next = filled.map((each, place) => (place === index ? tile.id : each));
      setFilled(next);
      setMisses(0);
      if (next.every((each) => each !== null)) {
        kit.feedback.correct({ at });
        void kit.speakSequence(options.onDone);
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS * 2);
      } else {
        void kit.speakSequence(options.onPlaced(tile.value));
      }
    },
  });

  const placed = new Set(filled);
  const nextSlot = filled.indexOf(null);
  const hintTile =
    !done && misses >= HINT_AFTER_TRIES
      ? tiles.find((tile) => !placed.has(tile.id) && tile.value === answers[nextSlot])
      : undefined;
  return {
    carry,
    filled,
    done,
    hint: hintTile === undefined ? null : { slot: nextSlot, tile: hintTile.id },
    attachTileRow,
  };
}
