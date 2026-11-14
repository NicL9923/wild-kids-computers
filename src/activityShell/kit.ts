import type { ProfilePictures } from '../app/session/sessionStore.ts';
import type { AudioEngine, ContinuousSound } from '../audio/audioEngine.ts';
import type { ContinuousSfxName, SfxName } from '../audio/sfx/sfxNames.ts';
import type { Band } from '../core/bands.ts';
import type { KitClock } from '../core/activityKit/scheduler.ts';
import type { Scope } from '../core/activityKit/scope.ts';
import type { SpokenHandle, StringHandle } from '../core/strings/defineStrings.ts';

/**
 * The kit handle an activity component receives. Everything an activity does to the world goes
 * through it: time, sound, speech, feedback, saved state, and the end of a round. The shell owns
 * the replay, exit, and mute controls, so an activity cannot leave them out.
 */

/**
 * A spot on screen for feedback: an element (its center), or a point in window coordinates.
 * @public
 */
export type FeedbackSpot = { getBoundingClientRect(): DOMRectReadOnly } | { readonly x: number; readonly y: number };

export interface FeedbackOptions {
  /** Where to show the mark. Leave out to show it in the middle of the activity. */
  readonly at?: FeedbackSpot;
  /** A short line to say, such as `feedback.tryAnother`. Leave out to say nothing. */
  readonly say?: SpokenHandle;
  /** Show the mark without the sound, such as for a click on empty ground. */
  readonly silent?: boolean;
}

/** @public */
export interface KitFeedback {
  /** A gentle confirmation: a soft chime and a check mark. */
  readonly correct: (options?: FeedbackOptions) => void;
  /**
   * A neutral nudge: a low soft sound and a ring, never red, never a frown. Counts one mistake
   * for the difficulty model. A wrong action never ends the round.
   */
  readonly wrong: (options?: FeedbackOptions) => void;
}

/** @public */
export interface InstructionOptions {
  /** Speak the new instruction now. Defaults to true. */
  readonly speak?: boolean;
  /**
   * What the instruction line shows in the bands that show text. Defaults to the spoken strings.
   * Show less when the text would give the answer away, such as the letter whose sound the
   * child is asked to find.
   */
  readonly shown?: StringHandle | readonly StringHandle[];
}

/** @public */
export interface RoundOutcomeInput {
  readonly mistakes?: number;
  readonly hintsUsed?: number;
}

export interface KitState<S> {
  /** The saved state, or the defaults until it loads. */
  readonly value: S;
  readonly loaded: boolean;
  /** Changes the state. The session saves it. */
  readonly update: (change: (current: S) => S) => void;
}

export interface ActivityKit<S = never> {
  /** Owns timers, frames, listeners, and sounds. Leaving the round or the activity cancels them. */
  readonly scope: Scope;
  readonly clock: KitClock;
  /** True when movement should stop. CSS already follows --wk-motion-scale. */
  readonly reducedMotion: boolean;
  /** Speaks one string. A new speak stops the one playing. Leaving stops it. */
  readonly speak: (handle: SpokenHandle) => Promise<void>;
  /** Speaks strings one after another, such as a sentence and a number. */
  readonly speakSequence: (handles: readonly SpokenHandle[]) => Promise<void>;
  /**
   * Changes what the replay control says for the rest of the round, and speaks it unless
   * `speak: false`. The round starts with the definition's first spoken string.
   */
  readonly setInstruction: (instruction: SpokenHandle | readonly SpokenHandle[], options?: InstructionOptions) => void;
  /** Plays a short sound effect. */
  readonly play: (name: SfxName) => void;
  /** Starts a sound the child's action drives, such as a brush. The scope stops it on leave. */
  readonly startSound: (name: ContinuousSfxName) => ContinuousSound;
  readonly feedback: KitFeedback;
  /** Counts one hint for the difficulty model, and says `say` when given. */
  readonly hint: (say?: SpokenHandle) => void;
  /**
   * Ends the round. With no argument the kit uses the mistakes it counted from `feedback.wrong`
   * and the hints from `hint`. A second call in the same round does nothing.
   */
  readonly roundComplete: (outcome?: RoundOutcomeInput) => void;
  /** The activity's saved state. Throws when the definition declares no `state`. */
  readonly state: KitState<S>;
  /** The profile's gallery pictures, for activities that use them, such as a jigsaw. */
  readonly pictures: Pick<ProfilePictures, 'list' | 'read'>;
}

/** The props of every activity component: `export default function XActivity(props: ActivityProps<Level>)`. */
export interface ActivityProps<L, S = never> {
  readonly level: L;
  readonly band: Band;
  readonly kit: ActivityKit<S>;
}

/** What the shell does with the kit's calls. The activity runner builds one per visit. */
export interface KitHost {
  readonly audio: Pick<AudioEngine, 'speak' | 'speakSequence' | 'cancelSpeech' | 'play' | 'startContinuous'>;
  readonly clock: KitClock;
  readonly activityId: string;
  /** The instruction changed. `speak` says whether to say it now; `shown` is the text to show. */
  onInstruction(handles: readonly SpokenHandle[], speak: boolean, shown: readonly StringHandle[]): void;
  onFeedback(kind: 'correct' | 'wrong', options: FeedbackOptions): void;
}

/** Called once when a round ends, with the outcome the difficulty model reads. */
export type RoundCompleteHandler = (outcome: { mistakes: number; hintsUsed: number }) => void;

/**
 * What one round has counted so far. It outlives a kit rebuilt within the round, such as when
 * the saved state changes, so the counts are never lost.
 */
export interface RoundTally {
  mistakes: number;
  hintsUsed: number;
  complete: boolean;
}

export function createTally(): RoundTally {
  return { mistakes: 0, hintsUsed: 0, complete: false };
}

export interface KitParts<S> {
  /** The round's scope: when it is disposed, every kit call becomes a no-op. */
  readonly scope: Scope;
  readonly host: KitHost;
  readonly tally: RoundTally;
  readonly onRoundComplete: RoundCompleteHandler;
  /** The saved state now, or null when the definition declares none. */
  readonly state: KitState<S> | null;
  readonly reducedMotion: boolean;
  readonly pictures: Pick<ProfilePictures, 'list' | 'read'>;
}

function count(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`roundComplete needs ${name} as a whole number from 0, not ${String(value)}.`);
  }
  return value;
}

/**
 * Builds the kit for one round. The shell rebuilds it when the state, motion, or pictures change,
 * with the same tally, and cancels the round's speech when the round ends.
 */
export function createKit<S>(parts: KitParts<S>): ActivityKit<S> {
  const { scope, host, tally, onRoundComplete, state } = parts;
  const speakSequence = (handles: readonly SpokenHandle[]): Promise<void> =>
    scope.disposed ? Promise.resolve() : host.audio.speakSequence(handles);

  return {
    scope,
    clock: host.clock,
    reducedMotion: parts.reducedMotion,
    speak: (handle) => (scope.disposed ? Promise.resolve() : host.audio.speak(handle)),
    speakSequence,
    setInstruction(instruction, options) {
      if (scope.disposed) return;
      const handles: readonly SpokenHandle[] = Array.isArray(instruction) ? instruction : [instruction];
      if (handles.length === 0) throw new Error('setInstruction needs at least one string.');
      const shown: readonly StringHandle[] =
        options?.shown === undefined ? handles : Array.isArray(options.shown) ? options.shown : [options.shown];
      if (shown.length === 0) throw new Error('setInstruction needs at least one string to show.');
      host.onInstruction(handles, options?.speak ?? true, shown);
    },
    play(name) {
      if (!scope.disposed) host.audio.play(name);
    },
    startSound(name) {
      const sound = host.audio.startContinuous(name);
      scope.own(() => sound.stop());
      return sound;
    },
    feedback: {
      correct(options = {}) {
        if (scope.disposed || tally.complete) return;
        host.onFeedback('correct', options);
      },
      wrong(options = {}) {
        if (scope.disposed || tally.complete) return;
        tally.mistakes += 1;
        host.onFeedback('wrong', options);
      },
    },
    hint(say) {
      if (scope.disposed || tally.complete) return;
      tally.hintsUsed += 1;
      if (say !== undefined) void host.audio.speak(say);
    },
    roundComplete(outcome) {
      if (scope.disposed || tally.complete) return;
      const result = {
        mistakes: count(outcome?.mistakes, tally.mistakes, 'mistakes'),
        hintsUsed: count(outcome?.hintsUsed, tally.hintsUsed, 'hintsUsed'),
      };
      tally.complete = true;
      onRoundComplete(result);
    },
    get state(): KitState<S> {
      if (state === null) {
        throw new Error(`Activity ${host.activityId} uses kit.state but declares no state in activity.ts.`);
      }
      return state;
    },
    pictures: parts.pictures,
  };
}
