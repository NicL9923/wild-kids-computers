import { useEffect, useRef, useState } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { DeskArt, PartArt } from './ComputerArt.tsx';
import { BOARD, LAYOUT, type PartId, type PartsLevel } from './level.ts';
import { PART_NAMES, promptFor } from './prompts.ts';
import { strings } from './strings.ts';
import './partsOfAComputer.css';

/** Wrong picks before the right part lights up. */
export const TRIES_BEFORE_HINT = 2;

/** The pause after the right part, so the child hears its name before the next round. */
const FOUND_PAUSE_MS = 1400;

function placeOf(part: PartId) {
  const box = LAYOUT[part];
  return {
    left: `${String((box.x / BOARD.width) * 100)}%`,
    top: `${String((box.y / BOARD.height) * 100)}%`,
    width: `${String((box.width / BOARD.width) * 100)}%`,
    height: `${String((box.height / BOARD.height) * 100)}%`,
  };
}

/**
 * A computer on a desk. The child hears a part's name, or at higher difficulty what it does, and
 * clicks it. A wrong pick says that part's own name, so every try still teaches. The parts stay
 * quiet under the pointer, because knowing them is the goal.
 */
export default function PartsOfAComputerActivity({ level, kit }: ActivityProps<PartsLevel>) {
  const [found, setFound] = useState(false);
  const [lit, setLit] = useState(false);
  const tries = useRef(0);
  const prompt = promptFor(level);

  // The shell says the main instruction as the round starts; this round's own question follows.
  useEffect(() => kit.scope.setTimeout(() => kit.setInstruction(prompt), 0), [kit, prompt]);

  function pick(part: PartId, element: HTMLElement): void {
    if (found) return;
    if (part === level.target) {
      setFound(true);
      setLit(false);
      kit.feedback.correct({ at: element });
      void kit.speakSequence([PART_NAMES[part], feedback.youFoundIt]);
      kit.scope.setTimeout(() => kit.roundComplete(), FOUND_PAUSE_MS);
      return;
    }
    kit.feedback.wrong({ at: element, say: PART_NAMES[part] });
    tries.current += 1;
    if (tries.current === TRIES_BEFORE_HINT) {
      setLit(true);
      kit.hint();
    }
  }

  return (
    <div className='poc-stage'>
      <section className='poc-scene' aria-label={t(strings.scene)} data-mode={level.mode}>
        <DeskArt />
        {level.parts.map((part) => (
          <button
            key={part}
            type='button'
            className='poc-part'
            data-part={part}
            data-hint={lit && part === level.target}
            data-found={found && part === level.target}
            aria-label={t(PART_NAMES[part])}
            style={placeOf(part)}
            onClick={(event) => pick(part, event.currentTarget)}
          >
            <PartArt part={part} />
          </button>
        ))}
      </section>
    </div>
  );
}
