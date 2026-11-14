import { Check } from 'lucide-react';
import { t } from '../core/strings/defineStrings.ts';
import { strings as feedback } from '../core/strings/shared/feedback.ts';

export interface FeedbackMark {
  readonly id: number;
  readonly kind: 'correct' | 'wrong';
  /** Position in the stage, in CSS pixels. */
  readonly x: number;
  readonly y: number;
  /** What the status line announces to a screen reader. */
  readonly text: string;
}

/**
 * The visible half of feedback. A correct action shows a check in a filled circle. A wrong one
 * shows an open ring with no color of alarm. The two differ by shape, not only by color, and
 * they fade rather than move under reduced motion.
 */
export function FeedbackLayer({ marks }: { marks: readonly FeedbackMark[] }) {
  const latest = marks.at(-1);
  return (
    <>
      <div className='wk-feedback-layer' aria-hidden='true'>
        {marks.map((mark) => (
          <span
            key={mark.id}
            className='wk-feedback-mark'
            data-kind={mark.kind}
            style={{ left: `${String(mark.x)}px`, top: `${String(mark.y)}px` }}
          >
            {mark.kind === 'correct' && <Check strokeWidth={4} />}
          </span>
        ))}
      </div>
      <output className='wk-visually-hidden'>{latest?.text ?? ''}</output>
    </>
  );
}

/** The status text for a mark when the activity said nothing. */
export function defaultFeedbackText(kind: FeedbackMark['kind']): string {
  return t(kind === 'correct' ? feedback.yes : feedback.tryAnother);
}
