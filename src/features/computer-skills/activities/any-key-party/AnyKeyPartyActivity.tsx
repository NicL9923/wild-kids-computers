import { useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames, letterNames, numberHandle } from '../../../../core/strings/shared/index.ts';
import { isLetter } from '../../shared/keyboardLayout.ts';
import { KeyboardPicture } from '../../shared/KeyboardPicture.tsx';
import './anyKeyParty.css';
import { FRIEND_SIZE, FULL_MEADOW_MS, MEADOW, type PartyLevel } from './level.ts';
import { strings } from './strings.ts';

/** How long a pressed key stays lit on the picture. */
const PRESSED_MS = 260;

/**
 * Every key press brings the next friend into the meadow and lights the key on the picture. A
 * letter or a digit says its name; any other key pops. There is no wrong key. Tab is a party key
 * too, so a child pressing keys at random never moves focus by accident. Escape hands the
 * keyboard back to the page: it moves focus to the replay control, and Tab goes on from there.
 */
export default function AnyKeyPartyActivity({ level, kit }: ActivityProps<PartyLevel>) {
  const [arrived, setArrived] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const reminded = useRef(false);
  const full = arrived >= level.friends.length;

  function light(code: string): void {
    setPressed(code);
    kit.scope.setTimeout(() => setPressed((current) => (current === code ? null : current)), PRESSED_MS);
  }

  useActivityKeys(
    kit,
    (event) => {
      if (event.key === 'Escape') {
        document.querySelector<HTMLElement>('[data-control="replay"]')?.focus();
        return;
      }
      event.preventDefault();
      if (event.repeat) return;
      light(event.code);
      const key = event.key.toLowerCase();
      if (isLetter(key)) void kit.speak(letterNames[key]);
      else if (/^[0-9]$/.test(key)) void kit.speak(numberHandle(Number(key)));
      else kit.play('pop');
      if (full) return;
      const next = arrived + 1;
      setArrived(next);
      if (next === level.friends.length) {
        kit.play('sparkle');
        kit.scope.setTimeout(() => kit.roundComplete(), FULL_MEADOW_MS);
      }
    },
    { takeTab: true },
  );

  /** A click on the meadow is not a key press. Say once where the keys are. */
  function clicked(): void {
    if (reminded.current) return;
    reminded.current = true;
    kit.hint(strings.useKeys);
  }

  return (
    <div className='party-stage' data-arrived={arrived} data-full={full}>
      <div className='party-meadow-area'>
        <div className='party-meadow' onPointerDown={clicked}>
          <svg className='party-ground' viewBox='0 0 1000 600' preserveAspectRatio='none' aria-hidden='true'>
            <path className='party-hill' d='M0 420 C200 360 380 380 520 410 S820 450 1000 390 V600 H0 Z' />
          </svg>
          {level.friends.slice(0, arrived).map((friend) => (
            <div
              key={friend.id}
              className='party-friend'
              data-friend={friend.id}
              style={{
                left: `${String((friend.x / MEADOW.width) * 100)}%`,
                top: `${String((friend.y / MEADOW.height) * 100)}%`,
                width: `${String((FRIEND_SIZE / MEADOW.width) * 100)}%`,
              }}
            >
              <Emoji id={friend.emoji} />
            </div>
          ))}
        </div>
      </div>
      <div className='party-keyboard'>
        <KeyboardPicture label={t(emojiNames.keyboard)} marks={pressed === null ? {} : { [pressed]: 'pressed' }} />
      </div>
    </div>
  );
}
