import { useRef, useState } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import type { Cancel } from '../../../../core/activityKit/scheduler.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import {
  DOOR_SHAPE,
  GROUND_Y,
  HOUSE,
  isDoubleClick,
  KNOCKS_PER_HINT,
  OPENED_PAUSE_MS,
  STREET,
  type Door,
  type KnockLevel,
} from './level.ts';
import { strings } from './strings.ts';
import './knockKnock.css';

/** Door paint as art colors. Original art. */
const PAINT_COLORS: Readonly<Record<Door['paint'], string>> = {
  red: '#c8553d',
  blue: '#3f6fb5',
  green: '#4f8a4a',
  yellow: '#d9a62e',
  purple: '#7b5aa6',
};

/** A wooden door with two panels and a round knob. Original art. */
function DoorArt({ paint }: { paint: Door['paint'] }) {
  return (
    <svg className='knock-door-art' viewBox='0 0 100 150' preserveAspectRatio='none' aria-hidden='true'>
      <path d='M4 146V40a46 36 0 0 1 92 0v106z' fill={PAINT_COLORS[paint]} stroke='#2b2420' strokeWidth='5' />
      <rect x='18' y='40' width='64' height='38' rx='6' fill='none' stroke='#2b2420' strokeWidth='3' opacity='0.45' />
      <rect x='18' y='88' width='64' height='44' rx='6' fill='none' stroke='#2b2420' strokeWidth='3' opacity='0.45' />
      <circle cx='78' cy='84' r='6' fill='#f3d27a' stroke='#2b2420' strokeWidth='3' />
    </svg>
  );
}

/** The little house around a door. Original art. */
function HouseArt() {
  return (
    <svg className='knock-house-art' viewBox='0 0 140 230' preserveAspectRatio='none' aria-hidden='true'>
      <path d='M4 84L70 8l66 76z' fill='#9c4a3a' stroke='#2b2420' strokeWidth='5' strokeLinejoin='round' />
      <rect x='12' y='80' width='116' height='148' fill='#efe3cc' stroke='#2b2420' strokeWidth='4' />
    </svg>
  );
}

/** A copy of a set without one id. */
function without(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

/**
 * A row of little houses. One click on a door knocks: the door gives a little shake and the
 * first of two dots under it fills. A second click soon after fills the second dot and opens the
 * door, and the animal inside says who it is. If the second click does not come in time, the
 * dots empty again with no fuss; after a couple of single knocks the voice explains, as a hint.
 */
export default function KnockKnockActivity({ level, kit }: ActivityProps<KnockLevel>) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [knocked, setKnocked] = useState<ReadonlySet<string>>(new Set());
  const opened = useRef(new Set<string>());
  const lastClick = useRef(new Map<string, number>());
  const forget = useRef(new Map<string, Cancel>());
  const singles = useRef(0);

  function openDoor(door: Door, element: HTMLElement): void {
    if (opened.current.has(door.id)) return;
    opened.current.add(door.id);
    forget.current.get(door.id)?.();
    lastClick.current.delete(door.id);
    setOpen(new Set(opened.current));
    setKnocked((current) => without(current, door.id));
    kit.play('open');
    kit.feedback.correct({ at: element, silent: true });
    void kit.speak(emojiNames[door.guest]);
    if (opened.current.size === level.doors.length) kit.scope.setTimeout(() => kit.roundComplete(), OPENED_PAUSE_MS);
  }

  function clicked(door: Door, element: HTMLElement): void {
    if (opened.current.has(door.id)) return;
    const now = kit.clock.monotonic();
    if (isDoubleClick(lastClick.current.get(door.id) ?? null, now, level.windowMs)) {
      openDoor(door, element);
      return;
    }
    lastClick.current.set(door.id, now);
    setKnocked((current) => new Set(current).add(door.id));
    kit.play('tap');
    forget.current.get(door.id)?.();
    // Too slow for a second click: the knock fades, and nothing else happens.
    forget.current.set(
      door.id,
      kit.scope.setTimeout(() => {
        lastClick.current.delete(door.id);
        setKnocked((current) => without(current, door.id));
        singles.current += 1;
        if (singles.current % KNOCKS_PER_HINT === 0) kit.hint(strings.twoQuick);
      }, level.windowMs + 1),
    );
  }

  return (
    <div className='knock-stage'>
      <div className='knock-street' data-open={open.size}>
        {level.doors.map((door) => {
          const isOpen = open.has(door.id);
          const isKnocked = knocked.has(door.id);
          return (
            <div
              key={door.id}
              className='knock-house'
              style={{
                left: `${String(((door.x - (level.width * HOUSE.width) / 2) / STREET.width) * 100)}%`,
                top: `${String(((GROUND_Y - level.width * HOUSE.height) / STREET.height) * 100)}%`,
                width: `${String(((level.width * HOUSE.width) / STREET.width) * 100)}cqw`,
                aspectRatio: `${String(HOUSE.width)} / ${String(HOUSE.height)}`,
              }}
            >
              <HouseArt />
              <button
                type='button'
                className='knock-door'
                data-door={door.id}
                data-open={isOpen}
                data-knocked={isKnocked}
                disabled={isOpen}
                aria-label={t(isOpen ? emojiNames[door.guest] : strings.door)}
                style={{
                  width: `${String((level.width / STREET.width) * 100)}cqw`,
                  aspectRatio: `1 / ${String(DOOR_SHAPE)}`,
                }}
                onClick={(event) => clicked(door, event.currentTarget)}
                onDoubleClick={(event) => openDoor(door, event.currentTarget)}
              >
                <span className='knock-inside'>
                  <Emoji id={door.guest} decorative className='knock-guest' />
                </span>
                <span className='knock-panel'>
                  <DoorArt paint={door.paint} />
                </span>
              </button>
              <span className='knock-dots' aria-hidden='true' data-filled={isOpen ? 2 : isKnocked ? 1 : 0}>
                <span className='knock-dot' />
                <span className='knock-dot' />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
