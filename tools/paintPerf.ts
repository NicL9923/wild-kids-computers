import { readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rgba } from '../src/core/paint/color.ts';
import { createDocument, DOCUMENT_HEIGHT, DOCUMENT_WIDTH } from '../src/core/paint/document.ts';
import { History } from '../src/core/paint/history.ts';
import { cos, sin, TAU } from '../src/core/paint/math.ts';
import { startStroke, type StrokePainter } from '../src/core/paint/session.ts';
import { cloneSurface } from '../src/core/paint/surface.ts';
import round from '../src/core/paint/tips/round.ts';
import soft from '../src/core/paint/tips/soft.ts';
import brush from '../src/core/paint/tools/brush/index.ts';
import fill from '../src/core/paint/tools/fill/index.ts';
import type { BrushTip, PaintEffect, ToolPoint, ToolSettings } from '../src/core/paint/types.ts';

/**
 * Paint engine timings on the full 1600 by 1000 canvas: npm run perf
 * Prints numbers and gates nothing. A child's laptop can be several times slower than a
 * developer machine, so the targets need a wide margin here.
 */

const FRAME_BUDGET_MS = 1000 / 120;

interface Stats {
  median: number;
  p95: number;
  max: number;
}

function stats(samples: number[]): Stats {
  const sorted = samples.toSorted((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { median: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

const ms = (value: number): string => `${value.toFixed(2)} ms`;

function settings(overrides: Partial<ToolSettings>): ToolSettings {
  return { color: rgba(40, 90, 220), size: 12, tip: round, seed: 1, ...overrides };
}

function time(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function measureFill(): Stats {
  const doc = createDocument();
  const history = new History(doc);
  const samples: number[] = [];
  for (let i = 0; i < 12; i++) {
    // Alternate colors so every fill covers the whole canvas.
    const color = i % 2 === 0 ? rgba(250, 200, 40) : rgba(70, 180, 80);
    samples.push(
      time(() => {
        const stroke = startStroke(history, fill, settings({ color }));
        stroke.begin({ x: 800, y: 500 });
        stroke.end();
      }),
    );
  }
  return stats(samples.slice(2));
}

/**
 * Fast scribbles: the pointer travels `speed` pixels per 120 Hz frame along a looping path,
 * reported as four coalesced points per frame. Each sample is one frame's work, undo tiles
 * included.
 */
function measureStroke(tip: BrushTip, size: number, speed: number, painter: StrokePainter = brush): Stats {
  const doc = createDocument();
  const history = new History(doc);
  const samples: number[] = [];
  let angle = 0;
  const pointAt = (a: number): ToolPoint => ({ x: 800 + 650 * cos(a) * cos(a * 0.37), y: 500 + 400 * sin(a * 1.3) });
  for (let strokeIndex = 0; strokeIndex < 6; strokeIndex++) {
    const stroke = startStroke(history, painter, settings({ tip, size }));
    stroke.begin(pointAt(angle));
    for (let frame = 0; frame < 240; frame++) {
      const points: ToolPoint[] = [];
      for (let k = 0; k < 4; k++) {
        angle += speed / 4 / 700;
        points.push(pointAt(angle));
      }
      samples.push(
        time(() => {
          for (const point of points) stroke.move(point);
        }),
      );
    }
    stroke.end();
    angle += TAU / 7;
  }
  return stats(samples.slice(60));
}

async function measureEffects(): Promise<{ id: string; first: number; steady: number }[]> {
  const dir = path.join(process.cwd(), 'src/core/paint/effects');
  const results: { id: string; first: number; steady: number }[] = [];
  for (const id of readdirSync(dir).toSorted()) {
    const module = (await import(pathToFileURL(path.join(dir, id, 'index.ts')).href)) as { default: PaintEffect };
    const effect = module.default;
    if (effect.group !== 'whole-picture') continue;
    const doc = createDocument();
    const source = cloneSurface(doc.paint);
    const target = cloneSurface(doc.paint);
    const first = time(() => effect.apply(source, target));
    const steady = stats(Array.from({ length: 8 }, () => time(() => effect.apply(source, target)))).median;
    results.push({ id, first, steady });
  }
  return results;
}

function measureUndo(): { undo: Stats; redo: Stats } {
  const doc = createDocument();
  const history = new History(doc);
  const stroke = startStroke(history, fill, settings({ color: rgba(250, 200, 40) }));
  stroke.begin({ x: 10, y: 10 });
  stroke.end();
  const undo: number[] = [];
  const redo: number[] = [];
  for (let i = 0; i < 12; i++) {
    undo.push(time(() => history.undo()));
    redo.push(time(() => history.redo()));
  }
  return { undo: stats(undo.slice(2)), redo: stats(redo.slice(2)) };
}

const cpu = cpus()[0]?.model ?? 'unknown CPU';
console.log(`Paint engine on ${DOCUMENT_WIDTH} by ${DOCUMENT_HEIGHT}, Node ${process.versions.node}, ${cpu}`);
console.log('');

const fillStats = measureFill();
console.log(
  `Full-canvas flood fill        median ${ms(fillStats.median)}, max ${ms(fillStats.max)}  (target under 100 ms)`,
);

for (const [label, tip, size] of [
  ['Soft brush 120 px', soft, 120],
  ['Soft brush 200 px', soft, 200],
  ['Round brush 40 px', round, 40],
] as const) {
  const stroke = measureStroke(tip, size, 60);
  console.log(
    `${label.padEnd(30)}per frame median ${ms(stroke.median)}, p95 ${ms(stroke.p95)}, max ${ms(stroke.max)}  (budget ${ms(FRAME_BUDGET_MS)} at 120 Hz)`,
  );
}

for (const effect of await measureEffects()) {
  console.log(
    `Whole picture: ${effect.id.padEnd(15)} first ${ms(effect.first)} (builds its map), then ${ms(effect.steady)}`,
  );
}

const undo = measureUndo();
console.log(`Undo of a full-canvas step     median ${ms(undo.undo.median)}, redo ${ms(undo.redo.median)}`);
