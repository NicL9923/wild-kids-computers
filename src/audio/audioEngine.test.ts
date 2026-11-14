import { describe, expect, it, vi } from 'vitest';
import { defineStrings } from '../core/strings/defineStrings.ts';
import { voiceClipName } from '../core/strings/voice.ts';
import { createAudioEngine, type AudioEnvironment, type SfxLibrary, type VolumeSettings } from './audioEngine.ts';
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
    expect(context.sources[0]?.output).toBe(context.gains[1]);

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

  it('resumes a suspended context before playing', async () => {
    const { context, environment } = harness();
    context.state = 'suspended';
    const engine = createAudioEngine({ environment, sfx, testLog: false });
    void engine.speak(strings.find);
    await settle();
    expect(context.state).toBe('running');
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

describe('effects', () => {
  it('plays a named effect through the effects bus and logs it', () => {
    const { context, environment } = harness();
    const engine = createAudioEngine({ environment, sfx, testLog: true });
    engine.play('chime');
    expect(context.oscillators.length).toBeGreaterThan(0);
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
