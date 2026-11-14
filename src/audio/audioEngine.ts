import type { SpokenHandle } from '../core/strings/defineStrings.ts';
import { voiceClipName } from '../core/strings/voice.ts';
import { withDeadline } from '../core/activityKit/deadline.ts';
import { systemScheduler } from '../core/activityKit/scheduler.ts';
import type { ContinuousSfxName, SfxName } from './sfx/sfxNames.ts';

/**
 * The audio layer: one Web Audio graph with a voice bus and an effects bus under a master gain.
 *
 *   voice sources -> voiceGain --\
 *                                 +-> masterGain (mute) -> destination
 *   effect voices -> sfxGain ----/
 *
 * Voice clips play one at a time. A new `speak` cancels the clip that is playing, so a replay
 * button pressed twice never stacks voices. Effects overlap freely.
 *
 * Nothing here throws on a missing clip, a decode failure, or a missing sound device. A missing
 * clip plays nothing and is still recorded in the test log.
 *
 * Every speech promise ends. Cancelling, newer speech, muting, and dispose settle what is waiting
 * at once, even a clip still loading, and a clip that takes longer than CLIP_LOAD_DEADLINE_MS to
 * load counts as missing. Activities wait for speech before the next round, so a stuck clip must
 * never hold a child on a finished round.
 */

export interface AudioLogEntry {
  readonly kind: 'voice' | 'sfx';
  /** The string id for voice, or the effect name. */
  readonly name: string;
  /** For voice: the clip file name. */
  readonly clip?: string;
  /** For voice: false when no clip file exists for the string. */
  readonly found?: boolean;
  /** Milliseconds since the engine started, from the injected clock. */
  readonly at: number;
}

/** What the engine needs from the outside world. Tests replace each part at the I/O edge. */
export interface AudioEnvironment {
  /** Creates the Web Audio context on first use. Return null when audio is unavailable. */
  createContext: () => AudioContext | null;
  /** The URL of a bundled clip by file name, or undefined when no such clip exists. */
  clipUrl: (clip: string) => string | undefined;
  /** Reads a clip's bytes. */
  fetchClip: (url: string) => Promise<ArrayBuffer>;
  /** Monotonic milliseconds, for the test log. */
  now: () => number;
}

export interface VolumeSettings {
  /** 0 to 1. */
  readonly voice: number;
  /** 0 to 1. */
  readonly effects: number;
  readonly muted: boolean;
}

const DEFAULT_VOLUME: VolumeSettings = Object.freeze({ voice: 1, effects: 0.6, muted: false });

/** A handle to a sound that plays until it is stopped, such as a brush stroke. */
export interface ContinuousSound {
  /** 0 to 1, how hard the action drives the sound. A brush passes its speed. */
  set(intensity: number): void;
  stop(): void;
}

/** Builds a synthesized effect on a context. See src/audio/sfx/. */
export type SfxPlayer = (context: AudioContext, output: AudioNode) => void;
export type ContinuousSfxFactory = (context: AudioContext, output: AudioNode) => ContinuousSound;

export interface SfxLibrary {
  readonly oneShots: Readonly<Record<SfxName, SfxPlayer>>;
  readonly continuous: Readonly<Record<ContinuousSfxName, ContinuousSfxFactory>>;
}

export interface AudioEngineOptions {
  readonly environment: AudioEnvironment;
  readonly sfx: SfxLibrary;
  /** Record a log of everything spoken and played. Turn on only when the app runs under test. */
  readonly testLog: boolean;
  readonly volume?: VolumeSettings;
}

export interface AudioEngine {
  /** Speaks one string. Resolves when the clip ends, is cancelled or muted, or cannot play. */
  speak(handle: SpokenHandle): Promise<void>;
  /** Speaks strings one after another, such as "Find the letter" then "b". */
  speakSequence(handles: readonly SpokenHandle[]): Promise<void>;
  /** Stops the voice that is speaking and any sequence in progress, a clip still loading included. */
  cancelSpeech(): void;
  /**
   * Resolves once no speech is in progress: the newest sequence ended, was cancelled, or could
   * not play. A sequence that starts while waiting is waited for too.
   */
  speechSettled(): Promise<void>;
  /** Plays a short synthesized effect. */
  play(name: SfxName): void;
  /** Starts a continuous effect. The caller stops it; dispose stops any left running. */
  startContinuous(name: ContinuousSfxName): ContinuousSound;
  setVolume(volume: Partial<VolumeSettings>): void;
  readonly volume: VolumeSettings;
  /** Calls `listener` whenever the volume or mute changes. Returns an unsubscribe function. */
  onVolumeChange(listener: (volume: VolumeSettings) => void): () => void;
  /** Everything spoken and played, or undefined when the test log is off. */
  readonly testLog: readonly AudioLogEntry[] | undefined;
  /** Stops all sound and releases the audio context. */
  dispose(): Promise<void>;
}

/** How long after a clip's length to stop waiting for its end event. */
const END_MARGIN_SECONDS = 1;

/**
 * How long fetching and decoding one clip may take before it counts as missing. A clip is a few
 * kilobytes of Opus read from the app's own files, which takes milliseconds even on a slow laptop.
 */
export const CLIP_LOAD_DEADLINE_MS = 5_000;

/** Real time for the load deadline: loading runs in real time even when a test pins the kit clock. */
const realTime = systemScheduler();

const NOTHING = (): void => undefined;

const SILENT_CONTINUOUS: ContinuousSound = Object.freeze({ set: () => undefined, stop: () => undefined });

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly voice: GainNode;
  readonly effects: GainNode;
}

export function createAudioEngine(options: AudioEngineOptions): AudioEngine {
  const { environment, sfx } = options;
  const startedAt = environment.now();
  const log: AudioLogEntry[] | undefined = options.testLog ? [] : undefined;
  const listeners = new Set<(volume: VolumeSettings) => void>();
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  let volume: VolumeSettings = { ...DEFAULT_VOLUME, ...options.volume };
  let graph: Graph | null | undefined;
  let current: { source: AudioBufferSourceNode; finish: () => void } | undefined;
  const running = new Set<ContinuousSound>();
  // Bumped by every speak and cancel, so a sequence or a slow decode knows it was superseded.
  let speechGeneration = 0;
  /** Ends the newest sequence's wait at once, whatever its clip is doing. */
  let abortSpeech: () => void = NOTHING;
  /** The newest sequence while it runs, so speechSettled can wait for it. */
  let speaking: Promise<void> | null = null;

  function record(entry: Omit<AudioLogEntry, 'at'>): void {
    log?.push({ ...entry, at: environment.now() - startedAt });
  }

  function ensureGraph(): Graph | null {
    if (graph !== undefined) return graph;
    let context: AudioContext | null = null;
    try {
      context = environment.createContext();
    } catch {
      context = null;
    }
    if (context === null) {
      graph = null;
      return graph;
    }
    const master = context.createGain();
    const voice = context.createGain();
    const effects = context.createGain();
    voice.connect(master);
    effects.connect(master);
    master.connect(context.destination);
    graph = { context, master, voice, effects };
    applyVolume(graph);
    return graph;
  }

  function applyVolume(target: Graph): void {
    target.master.gain.value = volume.muted ? 0 : 1;
    target.voice.gain.value = clamp01(volume.voice);
    target.effects.gain.value = clamp01(volume.effects);
  }

  function resume(target: Graph): void {
    // Chromium may start a context suspended until the first user gesture. Every play call comes
    // from one, so resuming here is enough. A rejected resume leaves the sound silent, not broken.
    if (target.context.state === 'suspended') target.context.resume().catch(() => undefined);
  }

  function decode(target: Graph, clip: string, url: string): Promise<AudioBuffer | null> {
    const cached = decoded.get(clip);
    if (cached !== undefined) return cached;
    const loading: Promise<AudioBuffer | null> = withDeadline(
      Promise.resolve(url)
        .then((from) => environment.fetchClip(from))
        .then((bytes) => target.context.decodeAudioData(bytes)),
      CLIP_LOAD_DEADLINE_MS,
      realTime,
      `Loading the clip ${clip}`,
    ).catch(() => {
      // Forget the failure so a later call can try again. A load that timed out may still finish;
      // nothing waits for it, and the next call starts its own.
      decoded.delete(clip);
      return null;
    });
    decoded.set(clip, loading);
    return loading;
  }

  function stopCurrent(): void {
    const playing = current;
    current = undefined;
    if (playing === undefined) return;
    try {
      playing.source.stop();
    } catch {
      // Already stopped.
    }
    playing.finish();
  }

  /** Ends the speech in progress: the clip playing, the clip loading, and the rest of the sequence. */
  function silence(): void {
    speechGeneration += 1;
    stopCurrent();
    abortSpeech();
  }

  async function speakOne(handle: SpokenHandle, generation: number): Promise<void> {
    const clip = voiceClipName(handle.speech);
    const url = environment.clipUrl(clip);
    record({ kind: 'voice', name: handle.id, clip, found: url !== undefined });
    // A muted voice has nothing to wait for: no one would hear it.
    if (url === undefined || volume.muted) return;
    const target = ensureGraph();
    if (target === null) return;
    resume(target);
    const buffer = await decode(target, clip, url);
    if (buffer === null || generation !== speechGeneration) return;
    // A context the browser keeps suspended, such as before the first click in the browser build,
    // would hold the clip forever. Skip it so a sequence never stalls.
    if (target.context.state !== 'running') return;

    await new Promise<void>((resolve) => {
      const source = target.context.createBufferSource();
      source.buffer = buffer;
      source.connect(target.voice);
      let finished = false;
      // If the end event never arrives, for example because the system suspended audio mid-clip,
      // settle anyway a little after the clip's length.
      const fallback = setTimeout(() => finish(), (buffer.duration + END_MARGIN_SECONDS) * 1000);
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(fallback);
        if (current?.source === source) current = undefined;
        source.disconnect();
        resolve();
      };
      source.addEventListener('ended', finish, { once: true });
      current = { source, finish };
      source.start();
    });
  }

  const engine: AudioEngine = {
    speak(handle) {
      return engine.speakSequence([handle]);
    },

    async speakSequence(handles) {
      silence();
      const generation = speechGeneration;
      const aborted = new Promise<void>((resolve) => {
        abortSpeech = resolve;
      });
      const run = (async () => {
        for (const handle of handles) {
          if (generation !== speechGeneration) return;
          // A clip still loading when speech stops is left to finish on its own; it sees the newer
          // generation and plays nothing.
          await Promise.race([speakOne(handle, generation), aborted]);
        }
      })();
      speaking = run;
      try {
        await run;
      } finally {
        if (speaking === run) speaking = null;
      }
    },

    async speechSettled() {
      while (speaking !== null) {
        const waiting = speaking;
        // speakOne never rejects, so neither does a sequence; the catch keeps the loop safe.
        await waiting.catch(() => undefined);
        if (speaking === waiting) speaking = null;
      }
    },

    cancelSpeech() {
      silence();
    },

    play(name) {
      record({ kind: 'sfx', name });
      const target = ensureGraph();
      if (target === null) return;
      resume(target);
      try {
        sfx.oneShots[name](target.context, target.effects);
      } catch {
        // An effect that fails to build must never break the activity.
      }
    },

    startContinuous(name) {
      record({ kind: 'sfx', name });
      const target = ensureGraph();
      if (target === null) return SILENT_CONTINUOUS;
      resume(target);
      let sound: ContinuousSound;
      try {
        sound = sfx.continuous[name](target.context, target.effects);
      } catch {
        return SILENT_CONTINUOUS;
      }
      running.add(sound);
      return {
        set: (intensity) => sound.set(intensity),
        stop: () => {
          running.delete(sound);
          sound.stop();
        },
      };
    },

    setVolume(change) {
      volume = { ...volume, ...change };
      // Muting ends speech in progress. Speech asked for while muted plays nothing; see speakOne.
      if (volume.muted) silence();
      if (graph) applyVolume(graph);
      for (const listener of listeners) listener(volume);
    },

    get volume() {
      return volume;
    },

    onVolumeChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    get testLog() {
      return log;
    },

    async dispose() {
      engine.cancelSpeech();
      for (const sound of running) sound.stop();
      running.clear();
      listeners.clear();
      const closing = graph;
      graph = null;
      if (closing) await closing.context.close().catch(() => undefined);
    },
  };
  return engine;
}
