import { useState } from 'react';
import type { ActivityKit, ActivityProps } from '../../../../activityShell/kit.ts';
import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES, useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import { ClockFace } from './ClockFace.tsx';
import { addMinutes, digital, sameTime, type ClockTime, type TellTheTimeLevel } from './level.ts';
import { strings } from './strings.ts';
import './tellTheTime.css';
import { sayTime } from './timeWords.ts';

/**
 * A clock at the round's own time, never the real time, so it never reads as a countdown.
 * "Read" rounds offer a few times written as a digital clock writes them; each says its time
 * when the pointer rests on it or it gets focus. "Set" rounds say a time and show it written;
 * the child turns the hands with buttons and says "This is the time" to check.
 */
export default function TellTheTimeActivity({ level, kit }: ActivityProps<TellTheTimeLevel>) {
  return level.mode === 'read' || level.start === null ? (
    <ReadTheClock level={level} kit={kit} />
  ) : (
    <SetTheClock level={level} start={level.start} kit={kit} />
  );
}

function ReadTheClock({ level, kit }: { level: TellTheTimeLevel; kit: ActivityKit }) {
  useRoundInstruction(kit, [strings.whatTime]);
  const answer = digital(level.time);
  const round = useChoiceRound(kit, answer, {
    onRight: sayTime(level.time),
    onWrong: (choice) => {
      const time = level.choices.find((each) => digital(each) === choice);
      return time === undefined ? [] : sayTime(time);
    },
  });
  return (
    <div className='tt-stage' data-mode='read'>
      <ClockFace time={level.time} />
      <fieldset className='tt-choices' aria-label={t(strings.times)}>
        {level.choices.map((time) => {
          const shown = digital(time);
          const isAnswer = round.answered && shown === answer;
          return (
            <button
              key={shown}
              type='button'
              className='tt-choice'
              data-choice={shown}
              data-tried={round.tried.has(shown)}
              data-answer={isAnswer}
              data-hint={round.hinted && shown === answer}
              disabled={round.tried.has(shown) || (round.answered && !isAnswer)}
              onPointerEnter={() => void kit.speakSequence(sayTime(time))}
              onFocus={() => void kit.speakSequence(sayTime(time))}
              onClick={(event) => round.choose(shown, event.currentTarget)}
            >
              {shown}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}

function SetTheClock({ level, start, kit }: { level: TellTheTimeLevel; start: ClockTime; kit: ActivityKit }) {
  const words = sayTime(level.time);
  useRoundInstruction(kit, [strings.setTo, ...words], [strings.setShown]);
  const [time, setTime] = useState(start);
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState(false);
  const hinted = !done && tries >= HINT_AFTER_TRIES;

  function turn(minutes: number): void {
    if (done) return;
    kit.play('tap');
    setTime((now) => addMinutes(now, minutes));
  }

  function check(element: HTMLElement): void {
    if (done) return;
    if (sameTime(time, level.time)) {
      setDone(true);
      kit.feedback.correct({ at: element });
      void kit.speakSequence(words);
      kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      return;
    }
    const nextTries = tries + 1;
    setTries(nextTries);
    kit.feedback.wrong({ at: element });
    if (nextTries === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
    else void kit.speakSequence([feedback.lookAgain, ...words]);
  }

  const control = (label: SpokenHandle, minutes: number, name: string, back: boolean) => (
    <button
      type='button'
      className='tt-turn'
      data-turn={name}
      disabled={done}
      onPointerEnter={() => void kit.speak(label)}
      onFocus={() => void kit.speak(label)}
      onClick={() => turn(minutes)}
    >
      <TurnIcon back={back} />
      <span>{t(label)}</span>
    </button>
  );

  return (
    <div className='tt-stage' data-mode='set' data-time={digital(time)}>
      <ClockFace time={time} ghost={hinted ? level.time : null} />
      <div className='tt-controls'>
        <p className='tt-target' data-target={digital(level.time)}>
          {digital(level.time)}
        </p>
        <div className='tt-turns'>
          {control(strings.hourBack, -60, 'hour-back', true)}
          {control(strings.hourForward, 60, 'hour-forward', false)}
          {control(strings.minuteBack, -level.step, 'minute-back', true)}
          {control(strings.minuteForward, level.step, 'minute-forward', false)}
        </div>
        <button
          type='button'
          className='tt-check'
          data-control='check'
          data-done={done}
          onPointerEnter={() => void kit.speak(strings.check)}
          onFocus={() => void kit.speak(strings.check)}
          onClick={(event) => check(event.currentTarget)}
        >
          {t(strings.check)}
        </button>
      </div>
    </div>
  );
}

/** A curved arrow, turning back or forward. Decorative: the button says what it does. */
function TurnIcon({ back }: { back: boolean }) {
  return (
    <svg className='tt-turn-icon' viewBox='0 0 24 24' aria-hidden='true' focusable='false' data-back={back}>
      <path d='M5 13a7 7 0 1 0 2.5-6.2' fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='round' />
      <path
        d='M4 3.5v4.8h4.8'
        fill='none'
        stroke='currentColor'
        strokeWidth='2.6'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}
