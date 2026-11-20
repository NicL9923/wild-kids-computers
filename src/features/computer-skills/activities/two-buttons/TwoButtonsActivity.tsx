import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import { SORTED_PAUSE_MS, TRIES_BEFORE_HINT, type ButtonsLevel, type MouseButton } from './level.ts';
import { strings } from './strings.ts';
import './twoButtons.css';

/**
 * A computer mouse seen from above. The button to press is filled and carries a fingertip dot,
 * so it differs from the other in shape as well as color. Original art.
 */
function MouseArt({ lit, className }: { lit: MouseButton; className: string }) {
  return (
    <svg className={className} viewBox='0 0 100 140' aria-hidden='true'>
      <path
        d='M50 6C24 6 10 26 10 52v46c0 24 18 38 40 38s40-14 40-38V52C90 26 76 6 50 6z'
        className='buttons-mouse-body'
      />
      <path d='M50 6C24 6 10 26 10 52v8h40z' className='buttons-mouse-key' data-lit={lit === 'left'} />
      <path d='M50 6c26 0 40 20 40 46v8H50z' className='buttons-mouse-key' data-lit={lit === 'right'} />
      <rect x='45' y='22' width='10' height='22' rx='5' className='buttons-mouse-wheel' />
      <circle cx={lit === 'left' ? 30 : 70} cy='38' r='8' className='buttons-mouse-finger' />
    </svg>
  );
}

/** A trackpad with two fingertips on it. Original art. */
function TrackpadArt() {
  return (
    <svg className='buttons-trackpad-art' viewBox='0 0 120 80' aria-hidden='true'>
      <rect x='4' y='4' width='112' height='72' rx='12' className='buttons-mouse-body' />
      <circle cx='48' cy='40' r='10' className='buttons-mouse-finger' />
      <circle cx='72' cy='40' r='10' className='buttons-mouse-finger' />
    </svg>
  );
}

/**
 * Things come one at a time in the middle, each with a small mouse that lights the button to
 * press and an arrow to its box. A left click sends it to the left box, a right click to the
 * right box. The wrong button gets a calm word naming the right one; after two tries the big mouse
 * over that box lights up too. The keyboard's menu key opens the same right-click.
 */
export default function TwoButtonsActivity({ level, kit }: ActivityProps<ButtonsLevel>) {
  const [sorted, setSorted] = useState(0);
  const [lit, setLit] = useState<MouseButton | null>(null);
  const tries = useRef(0);
  const set = useRef(false);
  const boxes = useRef(new Map<MouseButton, HTMLElement>());
  const current = level.things[sorted];

  // The replay control also says how to right-click on a trackpad. The shell still speaks the
  // main instruction because this sets `speak: false`.
  useEffect(() => {
    if (set.current) return;
    set.current = true;
    kit.setInstruction([strings.instruction, strings.trackpad], { speak: false });
  }, [kit]);

  function press(button: MouseButton, card: HTMLElement): void {
    if (current === undefined) return;
    if (button !== current.button) {
      kit.feedback.wrong({ at: card, say: current.button === 'left' ? strings.useLeft : strings.useRight });
      tries.current += 1;
      if (tries.current === TRIES_BEFORE_HINT) {
        setLit(current.button);
        kit.hint();
      }
      return;
    }
    tries.current = 0;
    setLit(null);
    setSorted(sorted + 1);
    kit.feedback.correct({ at: boxes.current.get(button) });
    if (sorted + 1 === level.things.length) kit.scope.setTimeout(() => kit.roundComplete(), SORTED_PAUSE_MS);
  }

  function rightClick(event: MouseEvent<HTMLButtonElement>): void {
    // No menu here: the right click is the answer.
    event.preventDefault();
    press('right', event.currentTarget);
  }

  return (
    <div className='buttons-stage'>
      <div className='buttons-board' data-sorted={sorted} onContextMenu={(event) => event.preventDefault()}>
        {(['left', 'right'] as const).map((side) => (
          <div
            key={side}
            ref={(element) => {
              if (element === null) boxes.current.delete(side);
              else boxes.current.set(side, element);
            }}
            className='buttons-side'
            data-side={side}
            data-hint={lit === side}
          >
            <MouseArt lit={side} className='buttons-mouse-big' />
            <p className='buttons-side-name'>{t(side === 'left' ? strings.left : strings.right)}</p>
            <div className='buttons-box' data-box={side}>
              {level.things
                .slice(0, sorted)
                .filter((thing) => thing.button === side)
                .map((thing) => (
                  <Emoji key={thing.id} id={thing.picture} decorative className='buttons-boxed' />
                ))}
            </div>
          </div>
        ))}
        <div className='buttons-middle'>
          {current !== undefined && (
            <button
              key={current.id}
              type='button'
              className='buttons-card'
              data-thing={current.id}
              data-button={current.button}
              aria-label={t(emojiNames[current.picture])}
              onClick={(event) => press('left', event.currentTarget)}
              onContextMenu={rightClick}
            >
              <Emoji id={current.picture} decorative className='buttons-picture' />
              <span className='buttons-badge' data-side={current.button}>
                <MouseArt lit={current.button} className='buttons-mouse-small' />
                <svg className='buttons-arrow' viewBox='0 0 40 24' aria-hidden='true'>
                  <path d='M4 12h28M22 4l10 8-10 8' />
                </svg>
              </span>
            </button>
          )}
          <p className='buttons-tip'>
            <TrackpadArt />
            <span>{t(strings.trackpad)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
