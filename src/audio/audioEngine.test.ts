import { describe, expect, it, vi } from 'vitest';
import { defineStrings } from '../core/strings/defineStrings.ts';
import { voiceClipName } from '../core/strings/voice.ts';
import {
  CLIP_LOAD_DEADLINE_MS,
  createAudioEngine,
  type AudioEnvironment,
  type SfxLibrary,
  type VolumeSettings,
} from './audioEngine.ts';
import { CONTINUOUS } from './sfx/continuous.ts';
import { ONE_SHOTS } from './sfx/oneShots.ts';
import { FakeAudioContext, type FakeBufferSource } from './testing/fakeAudioContext.ts';

const strings = defineStrings('audio-test', {
  find: { text: 'Find the letter.' },
  b: { text: 'b', speech: 'B.' },
  done: { text: 'All done.' },
  missing: { text: 'No clip for this one.' },
});

const PRESENT = new Set([strings.find, strings.b, strings.done].map((handle) => voiceClipName(handle.speech)));

interface Harness {
  context: FakeAudioContext;
  environment: AudioEnvironment;
  fetched: string[];
}

function harness(overrides: Partial<AudioEnvironment> = {}): Harness {
  const context = new FakeAudioContext();
  const fetched: string[] = [];
  let clock = 1000;
  const environment: AudioEnvironment = {
    createContext: () => context.asAudioContext(),
    clipUrl: (clip) => (PRESENT.has(clip) ? `app://bundle/assets/${clip}` : undefined),
    fetchClip: (url) => {
      fetched.push(url);
      return Promise.resolve(new TextEncoder().encode(url).buffer);
    },
    now: () => (clock += 10),
    ...overrides,
  };
  return { context, environment, fetched };
}

const sfx: SfxLibrary = { oneShots: ONE_SHOTS, continuous: CONTINUOUS };

/** Lets pending fetch and decode promises settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function playingClips(context: FakeAudioContext): string[] {
  return context.sources.filter((source) => source.started && !source.stopped).map((source) => source.bufferLabel);
}

function finish(source: FakeBufferSource | undefined): void {
  if (source === undefined) throw new Error('No source to finish.');
  source.end();
}

describe('speak', () => {
  it('plays the clip named by the string speech through the voice bus', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });

    const done = engine.speak(strings.b);
    await settle();
    expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('B.')}`]);
    const clipGain = context.gains[3];
    expect(context.sources[0]?.output).toBe(clipGain);
    expect(clipGain?.output).toBe(context.gains[1]);

    finish(context.sources[0]);
    await expect(done).resolves.toBeUndefined();
  });

  it('plays nothing for a string with no clip, does not throw, and still logs it', async () => {
    const { context, environment, fetched } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: true });

    await expect(engine.speak(strings.missing)).resolves.toBeUndefined();
    expect(fetched).toEqual([]);
    expect(context.sources).toEqual([]);
    expect(engine.testLog).toEqual([
      { kind: 'voice', name: 'audio-test.missing', clip: voiceClipName('No clip for this one.'), found: false, at: 10 },
    ]);
  });

  it('plays nothing and resolves when the clip fails to load', async () => {
    const { context, environment } = harness({ fetchClip: () => Promise.reject(new Error('404')) });
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    await expect(engine.speak(strings.find)).resolves.toBeUndefined();
    expect(context.sources).toEqual([]);
  });

  it('retries a clip that failed to load once it loads again', async () => {
    let attempts = 0;
    const { context, environment } = harness({
      fetchClip: () => (++attempts === 1 ? Promise.reject(new Error('busy')) : Promise.resolve(new ArrayBuffer(8))),
    });
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    await engine.speak(strings.find);
    void engine.speak(strings.find);
    await settle();
    expect(attempts).toBe(2);
    expect(context.sources).toHaveLength(1);
  });

  it('decodes a clip once and reuses it', async () => {
    const { context, environment, fetched } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    const first = engine.speak(strings.done);
    await settle();
    finish(context.sources[0]);
    await first;
    void engine.speak(strings.done);
    await settle();
    expect(fetched).toEqual([`app://bundle/assets/${voiceClipName('All done.')}`]);
    expect(context.decodeCalls).toBe(1);
  });

  it('stops the clip that is playing when a new one starts, so voices never stack', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    const first = engine.speak(strings.find);
    await settle();
    void engine.speak(strings.done);
    await settle();
    await expect(first).resolves.toBeUndefined();
    expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('All done.')}`]);
  });

  it('plays nothing when the system has no audio', async () => {
    const { environment } = harness({ createContext: () => null });
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    await expect(engine.speak(strings.find)).resolves.toBeUndefined();
    expect(() => engine.play('pop')).not.toThrow();
    expect(engine.testLog?.map((entry) => entry.name)).toEqual(['audio-test.find', 'pop']);
  });

  it('plays nothing when creating the audio context throws', async () => {
    const { environment } = harness({
      createContext: () => {
        throw new Error('No audio device');
      },
    });
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    await expect(engine.speak(strings.find)).resolves.toBeUndefined();
  });

  it('skips a clip while the browser keeps the context suspended, so a sequence never stalls', async () => {
    const { context, environment } = harness();
    context.state = 'suspended';
    context.resume = () => Promise.resolve();
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    await expect(engine.speakSequence([strings.find, strings.b])).resolves.toBeUndefined();
    expect(context.sources).toEqual([]);
    expect(engine.testLog?.map((entry) => entry.name)).toEqual(['audio-test.find', 'audio-test.b']);
  });

  it('settles a clip whose end event never arrives, a second after its length', async () => {
    vi.useFakeTimers();
    try {
      const { context, environment } = harness();
      const engine = createAudioEngine({ environment, sfx, testLog: false });
      let settled = false;
      void engine.speak(strings.find).then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(1999);
      expect(context.sources).toHaveLength(1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes a suspended context before playing', async () => {
    const { context, environment } = harness();
    context.state = 'suspended';
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    void engine.speak(strings.find);
    await settle();
    expect(context.state).toBe('running');
  });

  it('waits briefly for an async resume on a cached clip instead of dropping it', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    const first = engine.speak(strings.done);
    await settle();
    finish(context.sources[0]);
    await first;

    const resumeGate = Promise.withResolvers<void>();
    context.state = 'suspended';
    context.resume = async () => {
      await resumeGate.promise;
      context.state = 'running';
    };

    const second = engine.speak(strings.done);
    await settle();
    expect(playingClips(context)).toEqual([]);
    resumeGate.resolve();
    await settle();
    expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('All done.')}`]);
    finish(context.sources[1]);
    await expect(second).resolves.toBeUndefined();
  });

  it('ramps a cut voice clip down before stopping it to avoid clicks', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    void engine.speak(strings.find);
    await settle();
    const clipGain = context.gains[3];
    engine.cancelSpeech();
    expect(clipGain?.gain.events.some(([kind, value]) => kind === 'linear' && value === 0)).toBe(true);
  });
});

describe('speakSequence', () => {
  it('speaks the strings one after another', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    const done = engine.speakSequence([strings.find, strings.b]);
    await settle();
    expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('Find the letter.')}`]);
    finish(context.sources[0]);
    await settle();
    expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('B.')}`]);
    finish(context.sources[1]);
    await expect(done).resolves.toBeUndefined();
  });

  it('skips a missing clip and goes on to the next string', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    void engine.speakSequence([strings.missing, strings.b]);
    await settle();
    expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('B.')}`]);
    expect(engine.testLog?.map((entry) => [entry.name, entry.found])).toEqual([
      ['audio-test.missing', false],
      ['audio-test.b', true],
    ]);
  });

  it('stops the whole sequence on cancel', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    const done = engine.speakSequence([strings.find, strings.b, strings.done]);
    await settle();
    engine.cancelSpeech();
    await expect(done).resolves.toBeUndefined();
    await settle();
    expect(playingClips(context)).toEqual([]);
    expect(engine.testLog?.map((entry) => entry.name)).toEqual(['audio-test.find']);
  });

  it('does not start a clip whose decode finishes after cancel', async () => {
    const pending = Promise.withResolvers<ArrayBuffer>();
    const { context, environment } = harness({ fetchClip: () => pending.promise });
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    const done = engine.speak(strings.find);
    await settle();
    engine.cancelSpeech();
    pending.resolve(new ArrayBuffer(8));
    await done;
    expect(context.sources).toEqual([]);
  });
});

describe('speechSettled', () => {
  it('resolves at once when nothing is speaking', async () => {
    const { environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    await expect(engine.speechSettled()).resolves.toBeUndefined();
  });

  it('waits for the last clip of a sequence', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    void engine.speakSequence([strings.find, strings.b]);
    let settled = false;
    void engine.speechSettled().then(() => (settled = true));
    await settle();
    finish(context.sources[0]);
    await settle();
    expect(settled).toBe(false);
    finish(context.sources[1]);
    await settle();
    expect(settled).toBe(true);
  });

  it('waits for a sequence that replaced the one playing', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    void engine.speak(strings.find);
    let settled = false;
    void engine.speechSettled().then(() => (settled = true));
    await settle();
    void engine.speak(strings.b);
    await settle();
    expect(settled).toBe(false);
    finish(context.sources[1]);
    await settle();
    expect(settled).toBe(true);
  });

  it('resolves when speech is cancelled', async () => {
    const { environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    void engine.speakSequence([strings.find, strings.b]);
    const settled = engine.speechSettled();
    await settle();
    engine.cancelSpeech();
    await expect(settled).resolves.toBeUndefined();
  });
});

describe('effects', () => {
  it('plays a named effect through the effects bus and logs it', () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    engine.play('chime');
    expect(context.oscillators.length).toBeGreaterThan(0);
    expect(engine.testLog).toEqual([{ kind: 'sfx', name: 'chime', at: 10 }]);
  });

  it('does not schedule one-shot oscillators while the context stays suspended', () => {
    const { context, environment } = harness();
    context.state = 'suspended';
    context.resume = () => Promise.resolve();
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    engine.play('chime');
    expect(context.oscillators).toEqual([]);
    expect(engine.testLog).toEqual([{ kind: 'sfx', name: 'chime', at: 10 }]);
  });

  it('keeps working when an effect fails to build', () => {
    const { environment } = harness();
    const broken: SfxLibrary = {
      oneShots: {
        ...ONE_SHOTS,
        pop: () => {
          throw new Error('bad graph');
        },
      },
      continuous: CONTINUOUS,
    };
    const engine = createAudioEngine({ environment, sfx: broken, testLog: false });
    expect(() => engine.play('pop')).not.toThrow();
  });

  it('builds every named effect on a fresh context without error', () => {
    const context = new FakeAudioContext();
    const audio = context.asAudioContext();
    for (const play of Object.values(ONE_SHOTS)) play(audio, audio.destination);
    expect(context.oscillators.length + context.sources.length).toBeGreaterThan(Object.keys(ONE_SHOTS).length);
  });

  it('drives a continuous sound and stops it on dispose', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    const brush = engine.startContinuous('brush');
    brush.set(0.5);
    const noise = context.sources.at(-1);
    expect(noise?.started).toBe(true);
    await engine.dispose();
    expect(noise?.stopped).toBe(true);
    expect(context.closed).toBe(true);
    expect(engine.testLog).toEqual([{ kind: 'sfx', name: 'brush', at: 10 }]);
  });
});

describe('volume', () => {
  it('applies voice, effects, and mute to separate gains', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({
      environment,
      sfx,
      testLog: false,
      volume: { voice: 0.8, effects: 0.4, muted: false },
    });
    void engine.speak(strings.find);
    await settle();
    const [master, voice, effects] = context.gains;
    expect([master?.gain.value, voice?.gain.value, effects?.gain.value]).toEqual([1, 0.8, 0.4]);

    engine.setVolume({ muted: true });
    expect(master?.gain.value).toBe(0);
    expect(master?.gain.events.at(-1)?.[0]).toBe('target');
    engine.setVolume({ muted: false, voice: 2, effects: -1 });
    expect([master?.gain.value, voice?.gain.value, effects?.gain.value]).toEqual([1, 1, 0]);
  });

  it('notifies listeners until they unsubscribe', () => {
    const { environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    const listener = vi.fn<(volume: VolumeSettings) => void>();
    const unsubscribe = engine.onVolumeChange(listener);
    engine.setVolume({ muted: true });
    expect(listener).toHaveBeenLastCalledWith({ voice: 1, effects: 0.6, muted: true });
    unsubscribe();
    engine.setVolume({ muted: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('test log', () => {
  it('is off unless asked for', () => {
    const { environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    engine.play('pop');
    expect(engine.testLog).toBeUndefined();
  });
});

/** Tracks whether each promise settled. */
function watch(promises: Record<string, Promise<unknown>>) {
  const settled = new Set<string>();
  for (const [name, promise] of Object.entries(promises)) void promise.finally(() => settled.add(name));
  return () => [...settled].toSorted();
}

describe('speech whose clip never loads', () => {
  const findClip = voiceClipName(strings.find.speech);

  /** An engine whose "Find the letter." clip is stuck in fetch or in decode. Other clips load. */
  function stuck(stage: 'fetch' | 'decode') {
    const parts = harness(
      stage === 'fetch'
        ? {
            fetchClip: (url) =>
              url.endsWith(findClip)
                ? new Promise<never>(() => undefined)
                : Promise.resolve(new TextEncoder().encode(url).buffer),
          }
        : {},
    );
    if (stage === 'decode') {
      const decode = parts.context.decodeAudioData.bind(parts.context);
      parts.context.decodeAudioData = (bytes) =>
        new TextDecoder().decode(bytes).endsWith(findClip) ? new Promise<never>(() => undefined) : decode(bytes);
    }
    const engine = createAudioEngine({ environment: parts.environment, sfx, testLog: true });
    return { ...parts, engine };
  }

  const ALL = ['sequence', 'settled', 'speak'];

  it.each(['fetch', 'decode'] as const)(
    'settles speak, speakSequence, and speechSettled at once on each way speech stops, with the clip stuck in %s',
    async (stage) => {
      vi.useFakeTimers();
      try {
        const ways: Record<string, (engine: ReturnType<typeof stuck>['engine']) => void> = {
          'cancel, as leaving a screen does': (engine) => engine.cancelSpeech(),
          'newer speech': (engine) => void engine.speak(strings.missing),
          mute: (engine) => engine.setVolume({ muted: true }),
          'the engine closing': (engine) => void engine.dispose(),
        };
        for (const [way, stop] of Object.entries(ways)) {
          const { engine, context } = stuck(stage);
          const settledNow = watch({
            speak: engine.speak(strings.find),
            sequence: engine.speakSequence([strings.find, strings.b]),
            settled: engine.speechSettled(),
          });
          await settle();
          expect(settledNow(), way).toEqual(['speak']);
          stop(engine);
          await settle();
          expect(settledNow(), way).toEqual(ALL);
          expect(playingClips(context), way).toEqual([]);
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each(['fetch', 'decode'] as const)(
    'counts a clip stuck in %s as missing once the deadline passes, logs it, and goes on',
    async (stage) => {
      vi.useFakeTimers();
      try {
        const { engine, context } = stuck(stage);
        const settledNow = watch({
          sequence: engine.speakSequence([strings.find, strings.b]),
          settled: engine.speechSettled(),
        });
        await settle();
        vi.advanceTimersByTime(CLIP_LOAD_DEADLINE_MS - 1);
        await settle();
        expect(settledNow()).toEqual([]);
        vi.advanceTimersByTime(1);
        await settle();
        // The stuck clip played nothing and the next one plays.
        expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('B.')}`]);
        expect(engine.testLog?.map((entry) => [entry.name, entry.found])).toEqual([
          ['audio-test.find', true],
          ['audio-test.b', true],
        ]);
        finish(context.sources[0]);
        await settle();
        expect(settledNow()).toEqual(['sequence', 'settled']);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('tries a timed-out clip again, and never plays the stuck load if it finishes late', async () => {
    vi.useFakeTimers();
    try {
      const late = Promise.withResolvers<ArrayBuffer>();
      let calls = 0;
      const { context, environment } = harness({
        fetchClip: (url) => (calls++ === 0 ? late.promise : Promise.resolve(new TextEncoder().encode(url).buffer)),
      });
      const engine = createAudioEngine({ environment, sfx, testLog: false });
      const first = engine.speak(strings.find);
      await settle();
      vi.advanceTimersByTime(CLIP_LOAD_DEADLINE_MS);
      await first;
      late.resolve(new TextEncoder().encode('late').buffer);
      await settle();
      expect(context.sources).toEqual([]);
      void engine.speak(strings.find);
      await settle();
      expect(calls).toBe(2);
      expect(playingClips(context)).toEqual([`app://bundle/assets/${findClip}`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('speaks nothing while muted, so nothing waits for a voice no one hears, and logs it', async () => {
    const { context, environment, fetched } = harness();
    const engine = createAudioEngine({
      environment,
      sfx,
      testLog: true,
      volume: { voice: 1, effects: 1, muted: true },
    });
    await expect(engine.speakSequence([strings.find, strings.b])).resolves.toBeUndefined();
    await expect(engine.speechSettled()).resolves.toBeUndefined();
    expect(fetched).toEqual([]);
    expect(context.sources).toEqual([]);
    expect(engine.testLog?.map((entry) => entry.name)).toEqual(['audio-test.find', 'audio-test.b']);
  });

  it('stops a clip that is playing when sound is muted, and keeps speaking after unmute', async () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    const done = engine.speak(strings.find);
    await settle();
    expect(playingClips(context)).toHaveLength(1);
    engine.setVolume({ muted: true });
    await expect(done).resolves.toBeUndefined();
    expect(playingClips(context)).toEqual([]);
    engine.setVolume({ muted: false });
    void engine.speak(strings.b);
    await settle();
    expect(playingClips(context)).toEqual([`app://bundle/assets/${voiceClipName('B.')}`]);
  });
});
