import type { ProfilePictures } from '../app/session/sessionStore.ts';
import type { AudioEngine, ContinuousSound } from '../audio/audioEngine.ts';
import type { ContinuousSfxName, SfxName } from '../audio/sfx/sfxNames.ts';
import type { Band } from '../core/bands.ts';
import type { KitClock } from '../core/activityKit/scheduler.ts';
import type { Scope } from '../core/activityKit/scope.ts';
import type { SpokenHandle } from '../core/strings/defineStrings.ts';

/**
 * The kit handle an activity component receives. Everything an activity does to the world goes
 * through it: time, sound, speech, feedback, saved state, and the end of a round. The shell owns
 * the replay, exit, and mute controls, so an activity cannot leave them out.
 */

/** A spot on screen for feedback: an element (its center), or a point in window coordinates. */
export type FeedbackSpot = { getBoundingClientRect(): DOMRectReadOnly } | { readonly x: number; readonly y: number };

export interface FeedbackOptions {
  /** Where to show the mark. Leave out to show it in the middle of the activity. */
  readonly at?: FeedbackSpot;
  /** A short line to say, such as `feedback.tryAnother`. Leave out to say nothing. */
  readonly say?: SpokenHandle;
  /** Show the mark without the sound, such as for a click on empty ground. */
  readonly silent?: boolean;
}

export interface KitFeedback {
  /** A gentle confirmation: a soft chime and a check mark. */
  readonly correct: (options?: FeedbackOptions) => void;
  /**
   * A neutral nudge: a low soft sound and a ring, never red, never a frown. Counts one mistake
   * for the difficulty model. A wrong action never ends the round.
   */
  readonly wrong: (options?: FeedbackOptions) => void;
}

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
  readonly setInstruction: (instruction: SpokenHandle | readonly SpokenHandle[], options?: { speak?: boolean }) => void;
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
export interface KitHost<S> {
  readonly audio: Pick<AudioEngine, 'speak' | 'speakSequence' | 'cancelSpeech' | 'play' | 'startContinuous'>;
  readonly clock: KitClock;
  readonly reducedMotion: boolean;
  readonly state: KitState<S> | null;
  readonly pictures: Pick<ProfilePictures, 'list' | 'read'>;
  readonly activityId: string;
  /** The instruction changed. `speak` says whether to say it now. */
  onInstruction(handles: readonly SpokenHandle[], speak: boolean): void;
  onFeedback(kind: 'correct' | 'wrong', options: FeedbackOptions): void;
}

/** Called once when a round ends, with the outcome the difficulty model reads. */
export type RoundCompleteHandler = (outcome: { mistakes: number; hintsUsed: number }) => void;

function count(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`roundComplete needs ${name} as a whole number from 0, not ${String(value)}.`);
  }
  return value;
}

/**
 * Builds the kit for one round. `scope` is the round's scope: when it is disposed, every kit call
 * becomes a no-op. The shell cancels the round's speech when the round ends.
 */
export function createKit<S>(scope: Scope, host: KitHost<S>, onRoundComplete: RoundCompleteHandler): ActivityKit<S> {
  let mistakes = 0;
  let hintsUsed = 0;
  let complete = false;

  const speakSequence = (handles: readonly SpokenHandle[]): Promise<void> =>
    scope.disposed ? Promise.resolve() : host.audio.speakSequence(handles);

  return {
    scope,
    clock: host.clock,
    reducedMotion: host.reducedMotion,
    speak: (handle) => (scope.disposed ? Promise.resolve() : host.audio.speak(handle)),
    speakSequence,
    setInstruction(instruction, options) {
      if (scope.disposed) return;
      const handles: readonly SpokenHandle[] = Array.isArray(instruction) ? instruction : [instruction];
      if (handles.length === 0) throw new Error('setInstruction needs at least one string.');
      host.onInstruction(handles, options?.speak ?? true);
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
        if (scope.disposed || complete) return;
        host.onFeedback('correct', options);
      },
      wrong(options = {}) {
        if (scope.disposed || complete) return;
        mistakes += 1;
        host.onFeedback('wrong', options);
      },
    },
    hint(say) {
      if (scope.disposed || complete) return;
      hintsUsed += 1;
      if (say !== undefined) void host.audio.speak(say);
    },
    roundComplete(outcome) {
      if (scope.disposed || complete) return;
      const result = {
        mistakes: count(outcome?.mistakes, mistakes, 'mistakes'),
        hintsUsed: count(outcome?.hintsUsed, hintsUsed, 'hintsUsed'),
      };
      complete = true;
      onRoundComplete(result);
    },
    get state(): KitState<S> {
      if (host.state === null) {
        throw new Error(`Activity ${host.activityId} uses kit.state but declares no state in activity.ts.`);
      }
      return host.state;
    },
    pictures: host.pictures,
  };
}
