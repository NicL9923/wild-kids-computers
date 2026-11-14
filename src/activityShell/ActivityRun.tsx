import { useNavigate } from '@tanstack/react-router';
import {
  Component,
  createElement,
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { usePictures, useProgress, useSessionLength, useTestInfo } from '../app/session/sessionHooks.ts';
import { useReducedMotion } from '../app/theme/ThemeRoot.tsx';
import { useAudio } from '../audio/AudioProvider.tsx';
import type { Band } from '../core/bands.ts';
import { withDeadline } from '../core/activityKit/deadline.ts';
import type { ActivityDefinition } from '../core/activityKit/defineActivity.ts';
import { systemScheduler } from '../core/activityKit/scheduler.ts';
import { clampDifficulty, nextDifficulty, startingDifficulty } from '../core/activityKit/difficulty.ts';
import { roundSeed } from '../core/activityKit/random.ts';
import type { Scope } from '../core/activityKit/scope.ts';
import { t, type SpokenHandle, type StringHandle } from '../core/strings/defineStrings.ts';
import { Screen } from '../components/ui/Screen.tsx';
import { FeedbackLayer, defaultFeedbackText, type FeedbackMark } from './FeedbackLayer.tsx';
import { FinishScreen } from './FinishScreen.tsx';
import {
  createKit,
  createTally,
  type ActivityKit,
  type FeedbackOptions,
  type KitHost,
  type KitParts,
  type KitState,
  type RoundCompleteHandler,
} from './kit.ts';
import { kitScheduler } from './kitTime.ts';
import { CLOSING_PATH } from '../app/paths.ts';
import { AREA_PATH } from './paths.ts';
import { ExitControl, InstructionControl, MuteControl } from './ShellControls.tsx';
import { StepPicker } from './StepPicker.tsx';
import { strings } from './strings.ts';
import { ACTIVITY_LOAD_DEADLINE_MS, BETWEEN_ROUNDS_MS, FEEDBACK_MARK_MS, IDLE_CHECK_MS } from './timing.ts';
import { useScope } from './useScope.ts';
import { WithActivityState } from './WithActivityState.tsx';
import { ActivityNotOpened } from './ActivityNotOpened.tsx';

type LoadedComponent = ComponentType<{ level: unknown; band: Band; kit: ActivityKit<unknown> }>;

function isComponent(value: unknown): value is LoadedComponent {
  return typeof value === 'function';
}

function asComponent(value: unknown): LoadedComponent {
  if (!isComponent(value)) throw new TypeError('An activity component module must default-export a component.');
  return value;
}

/** An activity's component that failed to load or did not load in time. The shell offers to try again. */
class ActivityLoadError extends Error {
  override readonly name = 'ActivityLoadError';
  constructor(activityId: string, cause: unknown) {
    super(`Activity ${activityId} did not load: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

/**
 * One lazy component per definition, made on first use and kept, so a render never remakes it. A
 * load that answers after its deadline is dropped. A failed one stays failed, even through the
 * render React repeats after an error, until the child tries again and `forgetComponent` drops it.
 */
const components = new WeakMap<ActivityDefinition, LoadedComponent>();

function componentOf(definition: ActivityDefinition): LoadedComponent {
  const known = components.get(definition);
  if (known !== undefined) return known;
  const loading = withDeadline(
    definition.load(),
    ACTIVITY_LOAD_DEADLINE_MS,
    systemScheduler(),
    `Loading activity ${definition.id}`,
  ).catch((error: unknown) => {
    throw new ActivityLoadError(definition.id, error);
  });
  const made = lazy(() => loading.then((module) => ({ default: asComponent(module.default) })));
  components.set(definition, made);
  return made;
}

/** Drops a failed load, so the next render loads the component afresh. */
function forgetComponent(definition: ActivityDefinition): void {
  components.delete(definition);
}

/**
 * Shows the calm try-again screen, with the way out to the area, when the activity's component did
 * not load. Trying again starts the visit afresh. Any other error is a bug and goes on up.
 */
class LoadBoundary extends Component<
  { definition: ActivityDefinition; children: ReactNode },
  { failed: boolean; attempt: number }
> {
  override state = { failed: false, attempt: 0 };

  static getDerivedStateFromError(error: unknown): { failed: boolean } | null {
    if (!(error instanceof ActivityLoadError)) throw error;
    return { failed: true };
  }

  override render() {
    const { definition, children } = this.props;
    if (this.state.failed) {
      return (
        <ActivityNotOpened
          definition={definition}
          onTryAgain={() => {
            forgetComponent(definition);
            this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }));
          }}
        />
      );
    }
    return <Fragment key={this.state.attempt}>{children}</Fragment>;
  }
}

/** A fresh session seed when no test pinned one. Activities never see Math.random. */
function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** Runs one activity for the active profile: the frame, the instruction, feedback, rounds or steps. */
export function ActivityRun({ definition, band }: { definition: ActivityDefinition; band: Band }) {
  return (
    <WithActivityState definition={definition}>
      {(state) => <ActivityRunWithState definition={definition} band={band} state={state} />}
    </WithActivityState>
  );
}

/** What replay says, and what the instruction line shows. */
interface Instruction {
  readonly spoken: readonly SpokenHandle[];
  readonly shown: readonly StringHandle[];
}

/** What every runner shares: the instruction, feedback marks, and the host the kit talks to. */
interface Player {
  readonly instruction: Instruction;
  readonly marks: readonly FeedbackMark[];
  /** A callback ref for the stage, which feedback marks are placed in. */
  readonly attachStage: (element: HTMLDivElement | null) => void;
  /** Stable for the whole visit. */
  readonly host: KitHost;
  readonly state: KitState<unknown> | null;
  readonly reducedMotion: boolean;
  readonly pictures: KitParts<unknown>['pictures'];
  /** Owns the visit's timers, such as the pause between rounds. */
  readonly visit: Scope;
  readonly replay: () => void;
  /** Puts the instruction back to the definition's first spoken string and speaks it. */
  readonly startInstruction: () => void;
  /**
   * Runs `next` after the calm pause between rounds and after the speech in progress ends, so a
   * round never cuts off what the last one is still saying.
   */
  readonly afterRest: (next: () => void) => void;
}

function ActivityRunWithState({
  definition,
  band,
  state,
}: {
  definition: ActivityDefinition;
  band: Band;
  state: KitState<unknown> | null;
}) {
  const audio = useAudio();
  const reducedMotion = useReducedMotion();
  const pictures = usePictures();
  const visit = useScope();
  const mainInstruction = definition.spoken[0];
  const [instruction, setInstruction] = useState<Instruction>(() => ({
    spoken: [mainInstruction],
    shown: [mainInstruction],
  }));
  const [marks, setMarks] = useState<readonly FeedbackMark[]>([]);
  const stage = useRef<HTMLDivElement | null>(null);
  const attachStage = useCallback((element: HTMLDivElement | null) => {
    stage.current = element;
  }, []);
  const nextMarkId = useRef(1);
  // The newest instruction, for the replay control's handler.
  const live = useRef(instruction);
  useLayoutEffect(() => {
    live.current = instruction;
  });

  const host = useMemo<KitHost>(() => {
    const showMark = (kind: FeedbackMark['kind'], options: FeedbackOptions) => {
      const { x, y } = spotCenter(options.at, stage.current?.getBoundingClientRect());
      const id = nextMarkId.current;
      nextMarkId.current += 1;
      const text = options.say === undefined ? defaultFeedbackText(kind) : t(options.say);
      setMarks((current) => [...current.slice(-4), { id, kind, x, y, text }]);
      visit.setTimeout(() => setMarks((current) => current.filter((mark) => mark.id !== id)), FEEDBACK_MARK_MS);
    };
    return {
      audio,
      clock: kitScheduler,
      activityId: definition.id,
      onInstruction(handles, speak, shown) {
        setInstruction({ spoken: handles, shown });
        if (speak) void audio.speakSequence(handles);
      },
      onFeedback(kind, options) {
        if (options.silent !== true) audio.play(kind === 'correct' ? 'chime' : 'nudge');
        if (options.say !== undefined) void audio.speak(options.say);
        showMark(kind, options);
      },
    };
  }, [audio, definition.id, visit]);

  // Both stay the same for the whole visit, so a round's effect never restarts the round.
  const replay = useCallback(() => void audio.speakSequence(live.current.spoken), [audio]);
  const startInstruction = useCallback(() => {
    setInstruction({ spoken: [mainInstruction], shown: [mainInstruction] });
    void audio.speakSequence([mainInstruction]);
  }, [audio, mainInstruction]);
  const afterRest = useCallback(
    (next: () => void) => {
      const goOn = async (): Promise<void> => {
        await audio.speechSettled();
        if (!visit.disposed) next();
      };
      visit.setTimeout(() => void goOn(), BETWEEN_ROUNDS_MS);
    },
    [audio, visit],
  );
  const player = useMemo<Player>(
    () => ({
      instruction,
      marks,
      attachStage,
      host,
      state,
      reducedMotion,
      pictures,
      visit,
      replay,
      startInstruction,
      afterRest,
    }),
    [afterRest, attachStage, host, instruction, marks, pictures, reducedMotion, replay, startInstruction, state, visit],
  );

  // Leaving the activity stops its voice, even mid-sentence.
  useEffect(() => () => audio.cancelSpeech(), [audio]);

  let runner: ReactNode;
  if (definition.kind === 'rounds') runner = <RoundsRun definition={definition} band={band} player={player} />;
  else if (definition.kind === 'sequence') runner = <SequenceRun definition={definition} band={band} player={player} />;
  else runner = <FreeRun definition={definition} band={band} player={player} />;
  return <LoadBoundary definition={definition}>{runner}</LoadBoundary>;
}

function spotCenter(spot: FeedbackOptions['at'], stage: DOMRect | undefined): { x: number; y: number } {
  const left = stage?.left ?? 0;
  const top = stage?.top ?? 0;
  if (spot === undefined) return { x: (stage?.width ?? 0) / 2, y: (stage?.height ?? 0) / 2 };
  if ('getBoundingClientRect' in spot) {
    const rect = spot.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - left, y: rect.top + rect.height / 2 - top };
  }
  return { x: spot.x - left, y: spot.y - top };
}

/** The frame around a playing round: exit, replay, mute, and the stage the activity fills. */
function Frame({
  definition,
  player,
  resting,
  children,
}: {
  definition: ActivityDefinition;
  player: Player;
  resting: boolean;
  children: ReactNode;
}) {
  const { attachStage } = player;
  return (
    <div className='wk-activity-screen' data-activity={definition.id}>
      <Screen
        exit={<ExitControl to={AREA_PATH(definition.area)} label={strings.exitToArea} />}
        instruction={<InstructionControl instruction={player.instruction.shown} onReplay={player.replay} />}
        end={<MuteControl />}
      >
        <h1 className='wk-visually-hidden'>{t(definition.title)}</h1>
        {/* While resting between rounds the stage takes no input, so a stray click counts for nothing. */}
        <div ref={attachStage} className='wk-activity-stage' inert={resting} data-resting={resting}>
          <Suspense fallback={<p className='wk-visually-hidden'>{t(strings.loading)}</p>}>{children}</Suspense>
          <FeedbackLayer marks={player.marks} />
        </div>
      </Screen>
    </div>
  );
}

/**
 * One round's component with its own scope and kit. Remounted by key for each round, so nothing
 * carries over. The instruction is spoken when the round starts, and the round's speech stops
 * when it ends.
 */
function Round({
  definition,
  band,
  level,
  player,
  onRoundComplete,
  onStepSolved,
  session,
}: {
  definition: ActivityDefinition;
  band: Band;
  level: unknown;
  player: Player;
  onRoundComplete: RoundCompleteHandler;
  onStepSolved?: () => void;
  /** Free play's session checkpoint and hold. Other kinds check between rounds. */
  session?: FreeSession;
}) {
  const scope = useScope();
  const [tally] = useState(createTally);
  const { host, startInstruction, state, reducedMotion, pictures } = player;
  // Stable across renders: a new handler would rebuild the kit, and an activity effect that
  // depends on the kit would run again on every render.
  const stepSolved = useMemo(() => onStepSolved ?? noSteps(definition.id), [onStepSolved, definition.id]);
  const { checkpoint, hold } = useMemo(() => session ?? betweenRoundsOnly(definition.id), [session, definition.id]);
  // Rebuilt when the saved state, motion, or pictures change; the tally keeps the round's counts.
  const kit = useMemo(
    () =>
      createKit({
        scope,
        host,
        tally,
        onRoundComplete,
        onStepSolved: stepSolved,
        onCheckpoint: checkpoint,
        onHoldCheckpoint: hold,
        state,
        reducedMotion,
        pictures,
      }),
    [scope, host, tally, onRoundComplete, stepSolved, checkpoint, hold, state, reducedMotion, pictures],
  );

  useEffect(() => {
    scope.own(() => host.audio.cancelSpeech());
    startInstruction();
  }, [scope, host, startInstruction]);

  return <RoundComponent definition={definition} level={level} band={band} kit={kit} />;
}

/** The stepSolved handler of an activity that is not a sequence. */
function noSteps(activityId: string): () => void {
  return () => {
    throw new Error(`Activity ${activityId} has no steps: stepSolved is for sequence activities.`);
  };
}

/** What free play gives the kit for the session length. */
interface FreeSession {
  readonly checkpoint: () => void;
  readonly hold: () => () => void;
}

/** The session handlers of an activity that ends its session between rounds. */
function betweenRoundsOnly(activityId: string): FreeSession {
  return {
    checkpoint() {
      throw new Error(`Activity ${activityId} is not free play: the kit checks the session length between its rounds.`);
    },
    hold: () => () => undefined,
  };
}

/** Renders the activity's lazy component. */
function RoundComponent({
  definition,
  level,
  band,
  kit,
}: {
  definition: ActivityDefinition;
  level: unknown;
  band: Band;
  kit: ActivityKit<unknown>;
}) {
  return createElement(componentOf(definition), { level, band, kit });
}

/** Runs `next` unless the session limit is reached, in which case it goes to the closing screen. */
function useLimitOrContinue(): (next: () => void) => void {
  const navigate = useNavigate();
  const session = useSessionLength();
  return useCallback(
    (next: () => void) => {
      // The session limit is checked only here, between rounds, never during one.
      if (session.isLimitReached()) void navigate({ to: CLOSING_PATH });
      else next();
    },
    [session, navigate],
  );
}

type RoundsPhase =
  | {
      readonly kind: 'playing';
      readonly round: number;
      readonly difficulty: number;
      /** Set when the round ends; the stage rests until the next round. */
      readonly outcome: { mistakes: number; hintsUsed: number } | null;
    }
  | { readonly kind: 'finished'; readonly round: number; readonly difficulty: number };

function RoundsRun({
  definition,
  band,
  player,
}: {
  definition: Extract<ActivityDefinition, { kind: 'rounds' }>;
  band: Band;
  player: Player;
}) {
  const testInfo = useTestInfo();
  const progress = useProgress();
  const continueOrClose = useLimitOrContinue();
  const range = definition.difficulty[band];
  if (range === undefined) throw new Error(`Activity ${definition.id} has no difficulty for ${band}.`);
  const [sessionSeed] = useState(() => testInfo?.seed ?? freshSeed());
  const [phase, setPhase] = useState<RoundsPhase>(() => ({
    kind: 'playing',
    round: 0,
    difficulty:
      testInfo?.difficulty === undefined
        ? startingDifficulty(progress.progressOf(definition.id), range)
        : clampDifficulty(testInfo.difficulty, range),
    outcome: null,
  }));

  const level = useMemo(
    () => definition.generateLevel(roundSeed(sessionSeed, phase.round), phase.difficulty, band),
    [definition, sessionSeed, phase.round, phase.difficulty, band],
  );

  // Stable, so the round's kit is made once. The effect below does the work.
  const onRoundComplete = useCallback((outcome: { mistakes: number; hintsUsed: number }) => {
    setPhase((current) => (current.kind === 'playing' && current.outcome === null ? { ...current, outcome } : current));
  }, []);

  const ended = phase.kind === 'playing' ? phase.outcome : null;
  useEffect(() => {
    if (phase.kind !== 'playing' || ended === null) return;
    const played = phase.difficulty;
    const history = progress.progressOf(definition.id)?.recentRounds ?? [];
    const next = nextDifficulty(played, [...history, { ...ended, level: played }], range);
    progress.recordRound(definition.id, { ...ended, level: played }, next);
    const roundsDone = phase.round + 1;
    player.afterRest(() => {
      continueOrClose(() => {
        if (roundsDone % definition.roundsPerSession === 0) {
          setPhase({ kind: 'finished', round: roundsDone, difficulty: next });
        } else {
          setPhase({ kind: 'playing', round: roundsDone, difficulty: next, outcome: null });
        }
      });
    });
    // Runs once per finished round: `ended` changes only when a round ends.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [ended]);

  if (phase.kind === 'finished') {
    const playAgain = () =>
      continueOrClose(() =>
        setPhase({ kind: 'playing', round: phase.round, difficulty: phase.difficulty, outcome: null }),
      );
    return <FinishScreen area={definition.area} onPlayAgain={playAgain} />;
  }
  return (
    <Frame definition={definition} player={player} resting={phase.outcome !== null}>
      <Round
        key={phase.round}
        definition={definition}
        band={band}
        level={level}
        player={player}
        onRoundComplete={onRoundComplete}
      />
    </Frame>
  );
}

type SequencePhase =
  | { readonly kind: 'picking' }
  | { readonly kind: 'playing'; readonly step: number; readonly visit: number; readonly ended: boolean };

function SequenceRun({
  definition,
  band,
  player,
}: {
  definition: Extract<ActivityDefinition, { kind: 'sequence' }>;
  band: Band;
  player: Player;
}) {
  const testInfo = useTestInfo();
  const progress = useProgress();
  const continueOrClose = useLimitOrContinue();
  const lastStep = definition.steps.length - 1;
  const furthest = Math.min(progress.progressOf(definition.id)?.furthestStep ?? 0, lastStep);
  const [sessionSeed] = useState(() => testInfo?.seed ?? freshSeed());
  // A child who has only reached the first step goes straight in. Otherwise they pick.
  const [phase, setPhase] = useState<SequencePhase>(() =>
    furthest === 0 ? { kind: 'playing', step: 0, visit: 0, ended: false } : { kind: 'picking' },
  );

  const step = phase.kind === 'playing' ? phase.step : null;
  const level = useMemo(
    () => (step === null ? null : definition.generateLevel(roundSeed(sessionSeed, step), step, band)),
    [definition, sessionSeed, step, band],
  );

  const onRoundComplete = useCallback(() => {
    setPhase((current) => (current.kind === 'playing' && !current.ended ? { ...current, ended: true } : current));
  }, []);
  // Solving opens the next step at once; the record never moves back, so solving an earlier step
  // again changes nothing.
  const onStepSolved = useCallback(() => {
    if (step !== null) progress.recordStep(definition.id, Math.min(step + 1, lastStep));
  }, [definition.id, lastStep, progress, step]);

  const ended = phase.kind === 'playing' && phase.ended;
  useEffect(() => {
    if (phase.kind !== 'playing' || !phase.ended) return;
    const next = Math.min(phase.step + 1, lastStep);
    progress.recordStep(definition.id, next);
    player.afterRest(() => {
      continueOrClose(() => {
        if (phase.step === lastStep) setPhase({ kind: 'picking' });
        else setPhase({ kind: 'playing', step: next, visit: phase.visit + 1, ended: false });
      });
    });
    // Runs once per finished step: `ended` turns true only when a step ends.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [ended]);

  if (phase.kind === 'picking') {
    return (
      <StepPicker
        definition={definition}
        reachable={furthest + 1}
        onPick={(picked) => setPhase({ kind: 'playing', step: picked, visit: 0, ended: false })}
      />
    );
  }
  return (
    <Frame definition={definition} player={player} resting={phase.ended}>
      <Round
        key={`${String(phase.step)}-${String(phase.visit)}`}
        definition={definition}
        band={band}
        level={level}
        player={player}
        onRoundComplete={onRoundComplete}
        onStepSolved={onStepSolved}
      />
    </Frame>
  );
}

function FreeRun({
  definition,
  band,
  player,
}: {
  definition: Extract<ActivityDefinition, { kind: 'free' }>;
  band: Band;
  player: Player;
}) {
  const testInfo = useTestInfo();
  const [sessionSeed] = useState(() => testInfo?.seed ?? freshSeed());
  const level = useMemo(() => definition.generateLevel(sessionSeed, band), [definition, sessionSeed, band]);
  const onRoundComplete = useCallback(() => {
    throw new Error(`Activity ${definition.id} is free play, which has no rounds to complete.`);
  }, [definition.id]);
  const { session, closing } = useFreeSession(player);
  return (
    <Frame definition={definition} player={player} resting={closing}>
      <Round
        definition={definition}
        band={band}
        level={level}
        player={player}
        onRoundComplete={onRoundComplete}
        session={session}
      />
    </Frame>
  );
}

/** Input that shows the child is still playing. */
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;

/**
 * Free play has no rounds to end, so the session length is checked at calm moments: when the
 * activity calls `kit.checkpoint()`, and after IDLE_CHECK_MS with no input, so an activity that
 * forgets to call it still ends on time. A hold, such as a robot run or a carried item, makes the
 * check wait until the last hold lets go. When the limit is reached the stage rests, as between
 * rounds, and the closing screen follows. Leaving unmounts the activity, which saves its state.
 */
function useFreeSession(player: Player): { session: FreeSession; closing: boolean } {
  const navigate = useNavigate();
  const { isLimitReached } = useSessionLength();
  const { visit, afterRest } = player;
  const [closing, setClosing] = useState(false);
  const gate = useRef({ holds: 0, waiting: false, closing: false });

  const checkpoint = useCallback(() => {
    const now = gate.current;
    if (now.closing || visit.disposed) return;
    if (now.holds > 0) {
      now.waiting = true;
      return;
    }
    now.waiting = false;
    if (!isLimitReached()) return;
    now.closing = true;
    setClosing(true);
    afterRest(() => void navigate({ to: CLOSING_PATH }));
  }, [afterRest, isLimitReached, navigate, visit]);

  const hold = useCallback(() => {
    gate.current.holds += 1;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      gate.current.holds -= 1;
      if (gate.current.holds === 0 && gate.current.waiting) checkpoint();
    };
  }, [checkpoint]);

  // The shell's own check after a while with no input. Each input starts the wait again. No
  // clock arithmetic: the page clock reads fractions, and a quiet time measured a hair short of
  // the wait once scheduled a wait of a hair that ran again at the same instant forever.
  useEffect(() => {
    let cancel = (): void => undefined;
    const wait = (): void => {
      cancel();
      cancel = visit.setTimeout(() => {
        checkpoint();
        wait();
      }, IDLE_CHECK_MS);
    };
    const stops = INPUT_EVENTS.map((type) => visit.listen(window, type, wait, { capture: true, passive: true }));
    wait();
    return () => {
      for (const stop of stops) stop();
      cancel();
    };
  }, [checkpoint, visit]);

  const session = useMemo(() => ({ checkpoint, hold }), [checkpoint, hold]);
  return { session, closing };
}
