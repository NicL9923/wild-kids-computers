import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActivityKit } from '../../../../activityShell/kit.ts';
import { toyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import { ToyDesktop } from '../../desktop/ToyDesktop.tsx';
import { useDesktop } from '../../desktop/useDesktop.ts';
import type { DesktopState } from '../../model/state.ts';
import type { LessonLevel, LessonStep } from './lesson.ts';
import { startSteps, stepAfter } from './stepWalk.ts';

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
  /** Lesson marks on the desktop under the windows, such as a place to move a window to. */
  readonly backdrop?: (view: LessonView) => ReactNode;
}

/** What a lesson's backdrop draws from. */
export interface LessonView {
  /** CSS pixels per desktop unit. */
  readonly scale: number;
  readonly state: DesktopState;
  /** The index of the step the child is on. Equal to the step count once the round is done. */
  readonly step: number;
}

/**
 * Runs a toy desktop lesson: builds the desktop from the level, shows only the parts the level
 * asks for, checks each step after every action, says the next step's instruction, nudges a
 * wrong try, points at the answer after a couple of tries, and ends the round when the last step
 * is done.
 */
export function LessonDesktop({ level, band, kit, steps, backdrop }: LessonDesktopProps) {
  const desktop = useDesktop(() => level.desktop);
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState<HighlightTarget | null>(null);
  const progress = useRef(startSteps(level.desktop));
  const live = useRef({ kit, steps });
  useEffect(() => {
    live.current = { kit, steps };
  });

  // The first step's own instruction replaces the definition's main one.
  const first = steps[0]?.instruction;
  useEffect(() => {
    if (first === undefined) return;
    kit.setInstruction(first);
  }, [first, kit]);

  const { listen, replace } = desktop;
  useEffect(
    () =>
      listen((transition, action) => {
        const { kit: kitNow, steps: stepsNow } = live.current;
        const result = stepAfter(stepsNow, progress.current, transition, action, toyClipboard);
        const before = stepsNow[progress.current.step];
        progress.current = result.progress;
        switch (result.kind) {
          case 'done': {
            setStep(result.progress.step);
            setHighlight(null);
            const following = stepsNow[result.progress.step];
            if (following === undefined) {
              kitNow.feedback.correct({ say: feedback.youDidIt });
              kitNow.scope.setTimeout(() => kitNow.roundComplete(), LESSON_DONE_PAUSE_MS);
            } else {
              kitNow.feedback.correct();
              if (following.instruction !== undefined) kitNow.setInstruction(following.instruction);
            }
            return;
          }
          case 'restore':
            // What the step needs is back, and the child hears the step again. Nothing counts.
            replace(result.progress.start);
            if (before?.instruction !== undefined) kitNow.setInstruction(before.instruction);
            return;
          case 'wrong':
            kitNow.feedback.wrong({ say: before?.nudge ?? feedback.tryAnother });
            if (result.hint !== null) {
              setHighlight(result.hint);
              kitNow.hint(feedback.hereItIs);
            }
            return;
          default:
            return;
        }
      }),
    [listen, replace],
  );

  return (
    <div className='td-lesson' data-lesson-step={step}>
      <ToyDesktop
        desktop={desktop}
        kit={kit}
        band={band}
        parts={level.parts}
        highlight={highlight}
        backdrop={backdrop === undefined ? undefined : (scale) => backdrop({ scale, state: desktop.state, step })}
      />
    </div>
  );
}
