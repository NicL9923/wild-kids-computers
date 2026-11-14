import { useCallback, useEffect, useRef, useState } from 'react';
import { useCarry, type Carry } from '../../../activityShell/carry/useCarry.ts';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { strings as feedback } from '../../../core/strings/shared/feedback.ts';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES } from '../reading/useChoiceRound.ts';

export interface SortRoundOptions<I extends string, T extends string> {
  /** The items the child must place. An item left out, such as a spare shape, never fits. */
  readonly required: readonly I[];
  /** Every target on screen, in screen order. */
  readonly targets: readonly T[];
  /** True when the item belongs on the target. */
  readonly fits: (item: I, target: T) => boolean;
  /** Whether a target holds one item, like a hole, or many, like a box. */
  readonly holds: 'one' | 'many';
  /** What to say when an item lands where it belongs, unless it finished the round. */
  readonly onPlaced: (item: I, target: T) => readonly SpokenHandle[];
  /** What to say when the last item lands. */
  readonly onDone: (item: I, target: T) => readonly SpokenHandle[];
  /** What to say before "Try another one." when an item does not belong where it was put. */
  readonly onMiss: (item: I) => readonly SpokenHandle[];
}

export interface SortRound<I extends string, T extends string> {
  readonly carry: Carry<I, T>;
  /** Where each placed item sits. */
  readonly placed: ReadonlyMap<I, T>;
  readonly done: boolean;
  /** After two misses in a row: the item that missed last and a target it fits. */
  readonly hint: { readonly item: I; readonly target: T } | null;
  /** A callback ref for the items' container, so focus can move on when a focused item is placed. */
  readonly attachTray: (element: HTMLElement | null) => void;
}

type RoundKit = Pick<
  ActivityKit<unknown>,
  'scope' | 'play' | 'feedback' | 'hint' | 'speak' | 'speakSequence' | 'roundComplete'
>;

/**
 * A round of putting things where they belong: toys in the box of their color, shapes in their
 * holes, animals in their homes. An item moves with `useCarry`, so it can be dragged, clicked up
 * and clicked down, or carried with the keyboard. Every free target takes every item, so the
 * marking never gives the answer away. An item that belongs stays; one that does not goes back
 * with the kit's neutral nudge. After two misses in a row the item and a target it fits stand
 * out, and the kit counts a hint.
 */
export function useSortRound<I extends string, T extends string>(
  kit: RoundKit,
  options: SortRoundOptions<I, T>,
): SortRound<I, T> {
  const [placed, setPlaced] = useState<ReadonlyMap<I, T>>(() => new Map());
  const [misses, setMisses] = useState<{ count: number; item: I | null }>({ count: 0, item: null });
  const done = options.required.every((item) => placed.has(item));
  const tray = useRef<HTMLElement | null>(null);
  const attachTray = useCallback((element: HTMLElement | null) => {
    tray.current = element;
  }, []);
  const taken = new Set(placed.values());

  // A placed item leaves the tray. When it had focus, focus moves to the first item left, so a
  // keyboard player carries on from there.
  useEffect(() => {
    if (placed.size === 0 || done) return;
    if (document.activeElement === null || document.activeElement === document.body) {
      tray.current?.querySelector<HTMLElement>('[data-carry-item]')?.focus();
    }
  }, [placed, done]);

  const carry = useCarry<I, T>(kit, {
    kind: 'targets',
    accepts: (item, target) => !placed.has(item) && (options.holds === 'many' || !taken.has(target)),
    onDrop(item, target) {
      if (placed.has(item) || done) return;
      const at = document.querySelector(`[data-carry-target="${target}"]`) ?? undefined;
      if (!options.fits(item, target)) {
        const count = misses.count + 1;
        setMisses({ count, item });
        kit.feedback.wrong({ at });
        if (count === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
        else void kit.speakSequence([...options.onMiss(item), feedback.tryAnother]);
        return;
      }
      const next = new Map(placed).set(item, target);
      setPlaced(next);
      setMisses({ count: 0, item: null });
      if (options.required.every((each) => next.has(each))) {
        kit.feedback.correct({ at });
        void kit.speakSequence(options.onDone(item, target));
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS * 2);
      } else {
        void kit.speakSequence(options.onPlaced(item, target));
      }
    },
  });

  const hintItem = !done && misses.count >= HINT_AFTER_TRIES ? misses.item : null;
  const hintTarget =
    hintItem === null
      ? undefined
      : options.targets.find(
          (target) => options.fits(hintItem, target) && (options.holds === 'many' || !taken.has(target)),
        );
  return {
    carry,
    placed,
    done,
    hint: hintItem === null || hintTarget === undefined ? null : { item: hintItem, target: hintTarget },
    attachTray,
  };
}
