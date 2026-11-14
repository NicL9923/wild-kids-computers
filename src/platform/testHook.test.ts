import { describe, expect, it } from 'vitest';
import { createManualScheduler } from '../core/activityKit/scheduler.ts';
import { createFakeBridge } from '../app/session/testing/fakeBridge.ts';
import { isTestRun, TEST_RUN_DEADLINE_MS } from './testHook.ts';

const location = { search: '' };

describe('isTestRun', () => {
  it('says no when the bridge never says what it is, so the app still starts', async () => {
    const fake = createFakeBridge({ test: {} });
    const late = { answer: (): void => undefined };
    const info = fake.bridge.info.bind(fake.bridge);
    fake.bridge.info = () =>
      new Promise((resolve) => {
        late.answer = () => void info().then(resolve);
      });
    const timers = createManualScheduler({ wall: 0 });
    const asked = isTestRun(fake.bridge, location, timers);
    let result: boolean | null = null;
    void asked.then((value) => (result = value));
    timers.advance(TEST_RUN_DEADLINE_MS - 1);
    await Promise.resolve();
    expect(result).toBeNull();
    timers.advance(1);
    expect(await asked).toBe(false);
    // The late answer, a test run, cannot turn the started app into one.
    late.answer();
    expect(await asked).toBe(false);
  });

  it('says yes for the Electron app under test when the bridge answers in time', async () => {
    const fake = createFakeBridge({ test: {} });
    expect(await isTestRun(fake.bridge, location, createManualScheduler({ wall: 0 }))).toBe(true);
  });
});
