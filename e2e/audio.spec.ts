import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './support/launchApp.ts';

// CI has no sound device. This proves the renderer can still run Web Audio, decode a committed
// Opus clip, and play it to the end, so speech and effects never stall an activity in CI.
const clipDir = path.resolve(import.meta.dirname, '..', 'assets', 'voice', 'en');

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('decodes and plays a voice clip and a synthesized tone with no sound device', async () => {
  const clip = readdirSync(clipDir).find((file) => file.endsWith('.ogg'));
  expect(clip, 'at least one committed voice clip').toBeDefined();
  const base64 = readFileSync(path.join(clipDir, clip ?? '')).toString('base64');

  const result = await launched.page.evaluate(async (clipBase64) => {
    const context = new AudioContext();
    await context.resume();
    const bytes = Uint8Array.from(atob(clipBase64), (char) => char.charCodeAt(0));
    const buffer = await context.decodeAudioData(bytes.buffer);
    const playToEnd = (source: AudioScheduledSourceNode, seconds: number) =>
      new Promise<boolean>((resolve) => {
        source.addEventListener('ended', () => resolve(true), { once: true });
        window.setTimeout(() => resolve(false), (seconds + 2) * 1000);
        source.start();
        if (source instanceof OscillatorNode) source.stop(context.currentTime + seconds);
      });

    const voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.connect(context.destination);
    const voiceEnded = await playToEnd(voice, buffer.duration);

    const tone = context.createOscillator();
    tone.connect(context.destination);
    const toneEnded = await playToEnd(tone, 0.1);

    const state = context.state;
    await context.close();
    return { state, channels: buffer.numberOfChannels, duration: buffer.duration, voiceEnded, toneEnded };
  }, base64);

  expect(result).toMatchObject({ state: 'running', channels: 1, voiceEnded: true, toneEnded: true });
  expect(result.duration).toBeGreaterThan(0.1);
});
