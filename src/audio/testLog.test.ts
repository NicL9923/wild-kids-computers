import { describe, expect, it } from 'vitest';
import { createAudioEngine } from './audioEngine.ts';
import { CONTINUOUS } from './sfx/continuous.ts';
import { ONE_SHOTS } from './sfx/oneShots.ts';
import { AUDIO_LOG_GLOBAL, exposeAudioTestLog } from './testLog.ts';

function engineWith(testLog: boolean) {
  return createAudioEngine({
    environment: {
      createContext: () => null,
      clipUrl: () => undefined,
      fetchClip: () => Promise.reject(new Error('No clips in this test.')),
      now: () => 0,
    },
    sfx: { oneShots: ONE_SHOTS, continuous: CONTINUOUS },
    testLog,
  });
}

describe('exposeAudioTestLog', () => {
  it('puts a live copy of the log on the target', () => {
    const engine = engineWith(true);
    const target = {};
    exposeAudioTestLog(engine, target);
    engine.play('tap');
    expect(Reflect.get(target, AUDIO_LOG_GLOBAL)).toEqual([{ kind: 'sfx', name: 'tap', at: 0 }]);
  });

  it('refuses an engine that was not created with the log on', () => {
    expect(() => exposeAudioTestLog(engineWith(false), {})).toThrow(/testLog on/);
  });
});
