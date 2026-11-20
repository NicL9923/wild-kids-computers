import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames, feedback } from '../../../../core/strings/shared/index.ts';
import {
  directionTo,
  FOUND_PAUSE_MS,
  GROUND,
  TREE_WIDTH,
  TRIES_BEFORE_HINT,
  TRUNK,
  type Perch,
  type TreeLevel,
} from './level.ts';
import { strings } from './strings.ts';
import './climbTheTallTree.css';

/** The sky, the trunk, a branch and leaves for every animal, and the ground. Original art. */
function TreeArt({ level }: { level: TreeLevel }) {
  const { height, size } = level;
  return (
    <svg className='tree-art' viewBox={`0 0 ${String(TREE_WIDTH)} ${String(height)}`} aria-hidden='true'>
      <defs>
        <linearGradient id='tree-sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#8ccbed' />
          <stop offset='1' stopColor='#dff1fa' />
        </linearGradient>
      </defs>
      <rect width={TREE_WIDTH} height={height} fill='url(#tree-sky)' />
      <g fill='#3f8a3c'>
        <circle cx='500' cy='60' r='150' />
        <circle cx='380' cy='110' r='100' />
        <circle cx='620' cy='110' r='100' />
      </g>
      <rect
        x={TRUNK.left}
        y='80'
        width={TRUNK.right - TRUNK.left}
        height={height - GROUND - 60}
        fill='#8a5a33'
        stroke='#5b3a20'
        strokeWidth='8'
      />
      {level.perches.map((perch) => {
        const left = perch.x < TRUNK.left;
        const branchY = perch.y + size * 0.4;
        return (
          <g key={perch.id}>
            <path
              d={`M${String(left ? TRUNK.left : TRUNK.right)} ${String(branchY + 30)}L${String(perch.x)} ${String(branchY)}`}
              stroke='#7a4c2a'
              strokeWidth='26'
              strokeLinecap='round'
            />
            <g fill='#4f9a4a'>
              <circle cx={perch.x + (left ? -size * 0.55 : size * 0.55)} cy={branchY - 10} r={size * 0.32} />
              <circle cx={perch.x + (left ? -size * 0.2 : size * 0.2)} cy={branchY + 18} r={size * 0.26} />
            </g>
          </g>
        );
      })}
      <rect y={height - GROUND} width={TREE_WIDTH} height={GROUND} fill='#7cbf5e' />
      <rect y={height - GROUND} width={TREE_WIDTH} height='14' fill='#5ea544' />
    </svg>
  );
}

/** An arrow up, drawn. Turned over for down. */
function ArrowArt() {
  return (
    <svg className='tree-arrow-art' viewBox='0 0 40 40' aria-hidden='true'>
      <path d='M20 34V8M8 19l12-12 12 12' />
    </svg>
  );
}

/**
 * A tree far taller than its window, with animals on the branches. The child starts at the
 * ground and scrolls with the wheel, a trackpad, the scroll bar, or the keys, and clicks the
 * animal in the picture. A wrong animal gets "Look again"; after two, an arrow at the window's edge
 * shows which way to scroll and the voice says it.
 */
export default function ClimbTheTallTreeActivity({ level, kit }: ActivityProps<TreeLevel>) {
  const [found, setFound] = useState(0);
  const [hint, setHint] = useState<'up' | 'down' | 'here' | null>(null);
  const tries = useRef(0);
  const scroller = useRef<HTMLElement>(null);
  const announced = useRef(-1);
  const target = level.perches.find((perch) => perch.id === level.finds[found]);

  // The climb starts at the ground.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, []);

  // Each find is said as it comes up: "Scroll and find the" and the animal's name.
  useEffect(() => {
    if (target === undefined || announced.current === found) return;
    announced.current = found;
    kit.setInstruction([strings.find, emojiNames[target.animal]]);
  }, [kit, found, target]);

  /** The top of the window, in tree units. */
  function windowTop(): number {
    const element = scroller.current;
    if (element === null || element.clientWidth === 0) return 0;
    return (element.scrollTop / element.clientWidth) * TREE_WIDTH;
  }

  function scrolled(): void {
    if (hint !== null && target !== undefined) setHint(directionTo(target, windowTop()));
  }

  function choose(perch: Perch, element: HTMLElement): void {
    if (target === undefined) return;
    if (perch.id === target.id) {
      tries.current = 0;
      setHint(null);
      setFound(found + 1);
      kit.feedback.correct({ at: element });
      if (found + 1 === level.finds.length) kit.scope.setTimeout(() => kit.roundComplete(), FOUND_PAUSE_MS);
      return;
    }
    kit.feedback.wrong({ at: element, say: feedback.lookAgain });
    tries.current += 1;
    if (tries.current !== TRIES_BEFORE_HINT) return;
    const direction = directionTo(target, windowTop());
    setHint(direction);
    kit.hint(direction === 'up' ? strings.higher : direction === 'down' ? strings.lower : feedback.hereItIs);
  }

  const doneIds = new Set(level.finds.slice(0, found));
  return (
    <div className='tree-stage'>
      <div className='tree-layout'>
        <div className='tree-card' data-looking-for={target?.animal ?? ''}>
          <p className='tree-card-label'>{t(strings.lookFor)}</p>
          {target !== undefined && <Emoji key={target.id} id={target.animal} className='tree-card-picture' />}
        </div>
        <div className='tree-frame' data-found={found}>
          {/* The scroll area takes focus so the arrow, page, Home, and End keys scroll it. */}
          <section
            ref={scroller}
            className='tree-scroller'
            aria-label={t(strings.tree)}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see the comment above.
            tabIndex={0}
            onScroll={scrolled}
          >
            <div className='tree-content' style={{ aspectRatio: `${String(TREE_WIDTH)} / ${String(level.height)}` }}>
              <TreeArt level={level} />
              {level.perches.map((perch) => (
                <button
                  key={perch.id}
                  type='button'
                  className='tree-animal'
                  data-perch={perch.id}
                  data-found={doneIds.has(perch.id)}
                  data-hint={hint !== null && perch.id === target?.id}
                  aria-label={t(emojiNames[perch.animal])}
                  style={{
                    left: `${String((perch.x / TREE_WIDTH) * 100)}%`,
                    top: `${String((perch.y / level.height) * 100)}%`,
                    width: `${String((level.size / TREE_WIDTH) * 100)}%`,
                  }}
                  onClick={(event) => choose(perch, event.currentTarget)}
                >
                  <Emoji id={perch.animal} decorative className='tree-animal-picture' />
                </button>
              ))}
            </div>
          </section>
          {(hint === 'up' || hint === 'down') && (
            <span className='tree-arrow' data-direction={hint}>
              <ArrowArt />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
