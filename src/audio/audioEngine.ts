import type { SpokenHandle } from '../core/strings/defineStrings.ts';
import { voiceClipName } from '../core/strings/voice.ts';
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
  /** Speaks one string. Resolves when the clip ends, is cancelled, or cannot play. */
  speak(handle: SpokenHandle): Promise<void>;
  /** Speaks strings one after another, such as "Find the letter" then "b". */
  speakSequence(handles: readonly SpokenHandle[]): Promise<void>;
  /** Stops the voice that is speaking and any sequence in progress. */
  cancelSpeech(): void;
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
    let pending = decoded.get(clip);
    if (pending === undefined) {
      pending = environment
        .fetchClip(url)
        .then((bytes) => target.context.decodeAudioData(bytes))
        .catch(() => {
          // Forget the failure so a later call can try again.
          decoded.delete(clip);
          return null;
        });
      decoded.set(clip, pending);
    }
    return pending;
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

  async function speakOne(handle: SpokenHandle, generation: number): Promise<void> {
    const clip = voiceClipName(handle.speech);
    const url = environment.clipUrl(clip);
    record({ kind: 'voice', name: handle.id, clip, found: url !== undefined });
    if (url === undefined) return;
    const target = ensureGraph();
    if (target === null) return;
    resume(target);
    const buffer = await decode(target, clip, url);
    if (buffer === null || generation !== speechGeneration) return;

    await new Promise<void>((resolve) => {
      const source = target.context.createBufferSource();
      source.buffer = buffer;
      source.connect(target.voice);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
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
      stopCurrent();
      speechGeneration += 1;
      const generation = speechGeneration;
      for (const handle of handles) {
        if (generation !== speechGeneration) return;
        await speakOne(handle, generation);
      }
    },

    cancelSpeech() {
      speechGeneration += 1;
      stopCurrent();
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
