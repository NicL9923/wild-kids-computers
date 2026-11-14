import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import { KeyboardPicture, type KeyMark } from '../../shared/KeyboardPicture.tsx';
import { Hands } from './Hands.tsx';
import { codeFor, fingerFor, LINE_DONE_PAUSE_MS, shiftFingerFor, type Finger } from './lessons.ts';
import type { TypingLevel } from './level.ts';
import { FINGER_NAMES, lessonIntro } from './speech.ts';
import { strings } from './strings.ts';
import './typingCourse.css';

/** Other keys for one character before its finger is named. */
const WRONG_BEFORE_HELP = 2;
/** How long a pressed key stays lit on the picture. */
const PRESSED_MS = 300;

/**
 * One lesson of the typing course: a line to type, the hands with the finger for the next key,
 * and the keyboard with each finger's keys tinted and the next key lit. A key that is not the next
 * one types nothing: the line waits, and the key that was pressed lights on the picture. Nothing
 * on screen counts time or speed.
 */
export default function TypingCourseActivity({ level, kit }: ActivityProps<TypingLevel>) {
  const [typed, setTyped] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const area = useRef<HTMLFieldSetElement>(null);
  const chars = Array.from(level.line);
  const want = chars[typed];
  const done = want === undefined;

  // The lesson's new keys, after the shell's own start of the round.
  useEffect(() => kit.scope.setTimeout(() => kit.setInstruction(lessonIntro(level)), 0), [kit, level]);

  // The line takes focus, so Space types a space instead of pressing a button.
  useLayoutEffect(() => area.current?.focus(), []);

  function light(code: string): void {
    setPressed(code);
    kit.scope.setTimeout(() => setPressed((current) => (current === code ? null : current)), PRESSED_MS);
  }

  useActivityKeys(kit, (event) => {
    if (done || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (Array.from(event.key).length !== 1) return;
    event.preventDefault();
    light(event.code);
    if (event.key !== want) {
      const count = wrong + 1;
      setWrong(count);
      const needsShift = want !== want.toLowerCase() && event.key === want.toLowerCase();
      if (needsShift && wrong === 0) kit.hint(strings.holdShift);
      else if (count === WRONG_BEFORE_HELP) kit.hint(FINGER_NAMES[fingerFor(want)]);
      return;
    }
    setWrong(0);
    setTyped(typed + 1);
    if (typed + 1 < chars.length) return;
    kit.feedback.correct({ at: area.current ?? undefined, say: strings.lineDone });
    kit.scope.setTimeout(() => kit.roundComplete(), LINE_DONE_PAUSE_MS);
  });

  const fingers: Finger[] = [];
  const marks: Record<string, KeyMark> = {};
  if (want !== undefined) {
    fingers.push(fingerFor(want));
    marks[codeFor(want)] = 'target';
    const shift = shiftFingerFor(want);
    if (shift !== null) {
      fingers.push(shift);
      marks[shift === 'left-little' ? 'ShiftLeft' : 'ShiftRight'] = 'target';
    }
  }
  if (pressed !== null) marks[pressed] = 'pressed';

  return (
    <div className='tc-stage' data-lesson={level.id} data-typed={typed} data-done={done}>
      <fieldset
        className='tc-line'
        ref={area}
        // The line is where typing goes. It takes focus so Space types a space instead of pressing
        // a shell button, and a keyboard user can come back to it with Tab.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-waiting={wrong > 0}
      >
        <legend className='wk-visually-hidden'>{t(strings.line)}</legend>
        {chars.map((char, place) => (
          <span
            // A line repeats characters, so the place is the key.
            key={place}
            className='tc-char'
            data-state={place < typed ? 'typed' : place === typed ? 'next' : 'waiting'}
            data-space={char === ' '}
          >
            {char}
          </span>
        ))}
      </fieldset>
      <figure className='tc-hands-figure'>
        <Hands active={fingers} />
        <figcaption className='tc-finger-name'>
          {fingers.length > 0 && fingers.map((finger) => t(FINGER_NAMES[finger])).join(', ')}
        </figcaption>
      </figure>
      <div className='tc-keyboard'>
        <KeyboardPicture label={t(emojiNames.keyboard)} marks={marks} />
      </div>
    </div>
  );
}
