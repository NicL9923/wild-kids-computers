import { useEffect, useRef, useState } from 'react';
import type { ActivityKit } from '../../../../activityShell/kit.ts';
import type { Band } from '../../../../core/bands.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import { ToyDesktop } from '../../desktop/ToyDesktop.tsx';
import { useDesktop } from '../../desktop/useDesktop.ts';
import type { LessonLevel, LessonStep } from './lesson.ts';

/** Wrong tries in one step before the harness points at the answer. */
export const HINT_AFTER_TRIES = 2;

/** The pause after the last step, so the child sees the window close before the round ends. */
export const LESSON_DONE_PAUSE_MS = 1200;

/** The parts of the kit a lesson uses. Any lesson's kit fits. */
export type LessonKit = Pick<
  ActivityKit<unknown>,
  'scope' | 'play' | 'speak' | 'pictures' | 'setInstruction' | 'feedback' | 'hint' | 'roundComplete'
>;

export interface LessonDesktopProps {
  readonly level: LessonLevel;
  readonly band: Band;
  readonly kit: LessonKit;
  /** The steps of one round, in order. The round completes when the last one is done. */
  readonly steps: readonly LessonStep[];
}

/**
 * Runs a toy desktop lesson: builds the desktop from the level, shows only the parts the level
 * asks for, checks each step after every action, says the next step's instruction, nudges a
 * wrong try, points at the answer after a couple of tries, and ends the round when the last step
 * is done.
 */
export function LessonDesktop({ level, band, kit, steps }: LessonDesktopProps) {
  const desktop = useDesktop(() => level.desktop);
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState<HighlightTarget | null>(null);
  const progress = useRef({ step: 0, tries: 0, hinted: false });
  const live = useRef({ kit, steps });
  useEffect(() => {
    live.current = { kit, steps };
  });

  // The first step's own instruction replaces the definition's main one. The shell sets the main
  // instruction in its own effect, which runs after this one, so this waits for that to finish.
  const first = steps[0]?.instruction;
  useEffect(() => {
    if (first === undefined) return;
    queueMicrotask(() => {
      if (!kit.scope.disposed) kit.setInstruction(first);
    });
  }, [first, kit]);

  const { listen } = desktop;
  useEffect(
    () =>
      listen((transition, action) => {
        const now = progress.current;
        const { kit: kitNow, steps: stepsNow } = live.current;
        const current = stepsNow[now.step];
        // After the last step there is no current step, so nothing the child does counts.
        if (current === undefined) return;
        if (current.done(transition.state, transition.events)) {
          const next = now.step + 1;
          progress.current = { step: next, tries: 0, hinted: false };
          setStep(next);
          setHighlight(null);
          const following = stepsNow[next];
          if (following === undefined) {
            kitNow.feedback.correct({ say: feedback.youDidIt });
            kitNow.scope.setTimeout(() => kitNow.roundComplete(), LESSON_DONE_PAUSE_MS);
          } else {
            kitNow.feedback.correct();
            if (following.instruction !== undefined) kitNow.setInstruction(following.instruction);
          }
          return;
        }
        if (current.wrong?.(transition, action) !== true) return;
        const tries = now.tries + 1;
        progress.current = { ...now, tries };
        kitNow.feedback.wrong({ say: feedback.tryAnother });
        const target = current.hint?.(transition.state) ?? null;
        if (tries >= HINT_AFTER_TRIES && target !== null && !now.hinted) {
          progress.current = { ...progress.current, hinted: true };
          setHighlight(target);
          kitNow.hint(feedback.hereItIs);
        }
      }),
    [listen],
  );

  return (
    <div className='td-lesson' data-lesson-step={step}>
      <ToyDesktop desktop={desktop} kit={kit} band={band} parts={level.parts} highlight={highlight} />
    </div>
  );
}
