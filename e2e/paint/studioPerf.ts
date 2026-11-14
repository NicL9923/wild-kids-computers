import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { PAINT_STUDIO_PATH } from '../../src/features/paint-studio/paths.ts';

/**
 * Paint studio timings in the real Electron app at 1920 by 1080: npm run perf, after the engine
 * benchmark. It lives with the end-to-end tests because it drives the app the same way.
 *
 * - Frame pacing while a long, fast brush stroke runs.
 * - Time from a fill click to the filled pixels being on the canvas.
 * - Renderer and total memory each minute of continuous strokes, for WKC_PERF_MINUTES (default 5).
 * - Time from process start to the studio being ready.
 *
 * It prints numbers and the machine, and gates nothing. Run `npm run build` first; `npm run perf`
 * does. Without a display it restarts itself under Xvfb.
 */

const SIZE = { width: 1920, height: 1080 };

const MINUTES = Number(process.env.WKC_PERF_MINUTES ?? '5');
const projectRoot = path.resolve(import.meta.dirname, '..', '..');

if (process.env.DISPLAY === undefined && platform() === 'linux') {
  const result = spawnSync(
    'xvfb-run',
    // A screen larger than the window, so the window can take its full size.
    ['-a', '-s', '-screen 0 2560x1600x24', process.execPath, ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, WKC_PERF_XVFB: '1' } },
  );
  process.exit(result.status ?? 1);
}

if (!existsSync(path.join(projectRoot, 'dist/electron/main.cjs'))) {
  console.error('No build found. Run npm run build first.');
  process.exit(1);
}

interface Stats {
  median: number;
  p95: number;
  max: number;
}

function stats(samples: readonly number[]): Stats {
  const sorted = samples.toSorted((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { median: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

const ms = (value: number): string => `${value.toFixed(1)} ms`;
const mb = (kilobytes: number): string => `${(kilobytes / 1024).toFixed(0)} MB`;

/** Sizes the window's content area, and returns the size it reached. */
async function resize(launched: LaunchedApp): Promise<string> {
  await launched.app.evaluate(({ BrowserWindow }, size) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
  }, SIZE);
  for (let i = 0; i < 50; i++) {
    const [width, height] = await launched.page.evaluate(() => [window.innerWidth, window.innerHeight]);
    if (width === SIZE.width && height === SIZE.height) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return launched.page.evaluate(() => `${window.innerWidth} by ${window.innerHeight}`);
}

async function openStudio(page: Page): Promise<void> {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, `#${PAINT_STUDIO_PATH}`);
  await page.locator('.wk-paint-screen[data-ready="true"]').waitFor({ timeout: 30_000 });
}

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('canvas[data-layer="paint"]').boundingBox();
  if (box === null) throw new Error('The paint canvas is not on screen.');
  return box;
}

/** Starts recording the time between animation frames in the page. */
async function startFrameRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const deltas: number[] = [];
    let last = 0;
    let running = true;
    const tick = (time: number): void => {
      if (last !== 0) deltas.push(time - last);
      last = time;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    Reflect.set(window, 'wkcPerfFrames', {
      stop: () => {
        running = false;
        return deltas;
      },
    });
  });
}

async function stopFrameRecorder(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const recorder: unknown = Reflect.get(window, 'wkcPerfFrames');
    if (
      typeof recorder !== 'object' ||
      recorder === null ||
      !('stop' in recorder) ||
      typeof recorder.stop !== 'function'
    )
      return [];
    const result: unknown = recorder.stop();
    return Array.isArray(result) ? result.filter((value): value is number => typeof value === 'number') : [];
  });
}

/** A long zigzag across the picture, as fast as input arrives. */
async function fastStroke(page: Page, moves: number): Promise<void> {
  const box = await canvasBox(page);
  const at = (i: number) => {
    const t = i / moves;
    const across = (t * 8) % 2;
    return {
      x: box.x + box.width * (0.05 + 0.9 * (across < 1 ? across : 2 - across)),
      y: box.y + box.height * (0.1 + 0.8 * t),
    };
  };
  const first = at(0);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i <= moves; i++) {
    const point = at(i);
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
}

async function measureFramePacing(
  page: Page,
): Promise<{ idle: Stats; stroke: Stats; dropped: number; frames: number }> {
  await startFrameRecorder(page);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const idle = stats(await stopFrameRecorder(page));
  await startFrameRecorder(page);
  await fastStroke(page, 1500);
  const deltas = await stopFrameRecorder(page);
  const interval = idle.median > 0 ? idle.median : 1000 / 60;
  // A frame that took longer than one and a half refresh intervals missed at least one refresh.
  const dropped = deltas.reduce((sum, delta) => sum + Math.max(0, Math.round(delta / interval) - 1), 0);
  return { idle, stroke: stats(deltas), dropped, frames: deltas.length };
}

/** From the pointer press to the filled pixel on the canvas, timed inside the page. */
async function measureFill(page: Page): Promise<Stats> {
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Fill', exact: true }).click();
  const samples: number[] = [];
  const colors = ['blue', 'yellow'];
  const box = await canvasBox(page);
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: colors[i % 2], exact: true }).click();
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="paint"]');
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      if (canvas === null || canvas === undefined || ctx === null || ctx === undefined) return;
      const before = [...ctx.getImageData(800, 500, 1, 1).data].join();
      const result: { done: Promise<number> | null } = { done: null };
      canvas.parentElement?.addEventListener(
        'pointerdown',
        () => {
          const start = performance.now();
          result.done = new Promise((resolve) => {
            const check = (): void => {
              if ([...ctx.getImageData(800, 500, 1, 1).data].join() !== before) resolve(performance.now() - start);
              else requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          });
        },
        { capture: true, once: true },
      );
      Reflect.set(window, 'wkcPerfFill', result);
    });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const elapsed = await page.evaluate(async () => {
      const result: unknown = Reflect.get(window, 'wkcPerfFill');
      if (typeof result !== 'object' || result === null || !('done' in result)) return Number.NaN;
      const done: unknown = result.done;
      return done instanceof Promise ? Number(await done) : Number.NaN;
    });
    samples.push(elapsed);
  }
  return stats(samples);
}

interface MemorySample {
  minute: number;
  rendererKb: number;
  totalKb: number;
  heapMb: number;
}

async function memorySample(launched: LaunchedApp, minute: number): Promise<MemorySample> {
  const metrics = await launched.app.evaluate(({ app }) =>
    app.getAppMetrics().map((metric) => ({ type: metric.type, kb: metric.memory.workingSetSize })),
  );
  const heapMb = await launched.page.evaluate(() => {
    const memory: unknown = Reflect.get(performance, 'memory');
    if (typeof memory !== 'object' || memory === null || !('usedJSHeapSize' in memory)) return Number.NaN;
    return Number(memory.usedJSHeapSize) / 1024 / 1024;
  });
  return {
    minute,
    rendererKb: metrics.filter((metric) => metric.type === 'Tab').reduce((sum, metric) => sum + metric.kb, 0),
    totalKb: metrics.reduce((sum, metric) => sum + metric.kb, 0),
    heapMb,
  };
}

async function measureMemory(launched: LaunchedApp): Promise<MemorySample[]> {
  const { page } = launched;
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Paint brush', exact: true }).click();
  const samples = [await memorySample(launched, 0)];
  const start = Date.now();
  for (let minute = 1; minute <= MINUTES; minute++) {
    while (Date.now() - start < minute * 60_000) await fastStroke(page, 200);
    samples.push(await memorySample(launched, minute));
  }
  return samples;
}

const started = performance.now();
const launched = await launchApp({ band: 'band-6-8' });
try {
  const firstWindow = performance.now() - started;
  await openStudio(launched.page);
  const studioReady = performance.now() - started;
  const reached = await resize(launched);
  const { page } = launched;
  const electronVersion = await launched.app.evaluate(() => process.versions.electron);

  console.log(`Paint studio in the Electron app, window content ${reached} (asked for 1920 by 1080)`);
  console.log(`Machine: ${cpus()[0]?.model ?? 'unknown CPU'}, ${cpus().length} threads, ${mb(totalmem() / 1024)} RAM`);
  console.log(`System: ${platform()} ${release()}, Electron ${electronVersion}, Node ${process.versions.node}`);
  if (process.env.WKC_PERF_XVFB === '1' || platform() === 'linux') {
    console.log('Note: under Xvfb there is no GPU and no real display refresh. Frame timing follows a software');
    console.log('timer, so it shows whether painting keeps up, not what a real screen would show.');
  }
  console.log('');
  console.log(`Start to first window: ${ms(firstWindow)}`);
  console.log(`Start to studio ready (studio open, effect worker warm): ${ms(studioReady)}`);

  const pacing = await measureFramePacing(page);
  console.log('');
  console.log(`Idle frame interval: median ${ms(pacing.idle.median)}, p95 ${ms(pacing.idle.p95)}`);
  console.log(
    `Fast brush stroke, ${pacing.frames} frames: median ${ms(pacing.stroke.median)}, p95 ${ms(pacing.stroke.p95)}, ` +
      `max ${ms(pacing.stroke.max)}, dropped ${pacing.dropped}`,
  );

  const fill = await measureFill(page);
  console.log(
    `Fill click to pixels on screen, 10 full-canvas fills: median ${ms(fill.median)}, p95 ${ms(fill.p95)}, max ${ms(fill.max)}`,
  );

  console.log('');
  console.log(`Memory during ${MINUTES} minutes of continuous strokes:`);
  console.log('minute  renderer  all processes  JS heap');
  for (const sample of await measureMemory(launched)) {
    console.log(
      `${String(sample.minute).padStart(6)}  ${mb(sample.rendererKb).padStart(8)}  ${mb(sample.totalKb).padStart(13)}  ` +
        `${sample.heapMb.toFixed(0)} MB`.padStart(7),
    );
  }
} finally {
  await launched.close();
}
