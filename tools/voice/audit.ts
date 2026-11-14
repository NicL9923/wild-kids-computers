import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cutAfterLead, DEFAULT_LEAD_CUT, DEFAULT_PROCESS_OPTIONS, processSpeech } from './audioProcessing.ts';
import { loadKokoro, type Synthesizer } from './kokoro.ts';
import { CLIP_DIR, SPOKEN_LIST_PATH, spokenListSchema } from './spokenList.ts';

/**
 * `npm run voice:audit`. Checks every committed clip against what the generator makes now: it
 * synthesizes each speech again, cuts the lead-in, processes it, and compares the length with
 * the committed clip's. A clip that differs by more than the tolerance was cut somewhere else,
 * for example after its first word. Run it after changing the lead-in cut.
 *
 * `--raw <dir>` keeps the raw speech there and reuses it on the next run, because synthesis is
 * the slow part. Delete the clips it lists and run `npm run voice:generate` to make them again.
 */

/**
 * ffprobe reports an Opus clip 6.5 ms longer than the samples encoded. A first word is 150 ms or
 * more, so 20 ms tells a clip cut elsewhere from that offset.
 */
const TOLERANCE_MS = 20;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function committedMs(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
  });
  return Number(out.trim()) * 1000;
}

async function rawSpeech(
  speech: string,
  cacheFile: string | undefined,
  synthesizer: () => Promise<Synthesizer>,
): Promise<Float32Array> {
  if (cacheFile !== undefined && existsSync(cacheFile)) {
    const bytes = readFileSync(cacheFile);
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }
  const { samples, sampleRate } = await (await synthesizer()).synthesize(speech);
  if (sampleRate !== DEFAULT_LEAD_CUT.sampleRate) throw new Error(`Expected 24 kHz speech, got ${String(sampleRate)}.`);
  if (cacheFile !== undefined)
    writeFileSync(cacheFile, new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
  return samples;
}

async function main(): Promise<void> {
  const list = spokenListSchema.parse(JSON.parse(readFileSync(SPOKEN_LIST_PATH, 'utf8')));
  const rawDir = argument('--raw');
  if (rawDir !== undefined) mkdirSync(rawDir, { recursive: true });
  let loaded: Promise<Synthesizer> | undefined;
  const synthesizer = () => (loaded ??= loadKokoro(list.profile));

  const differ: string[] = [];
  const refused: string[] = [];
  const missing: string[] = [];
  for (const [index, clip] of list.clips.entries()) {
    const file = path.join(CLIP_DIR, clip.clip);
    if (!existsSync(file)) {
      missing.push(clip.speech);
      continue;
    }
    const cache = rawDir === undefined ? undefined : path.join(rawDir, clip.clip.replace('.ogg', '.f32'));
    const samples = await rawSpeech(clip.speech, cache, synthesizer);
    let processed: Float32Array;
    try {
      processed = processSpeech(cutAfterLead(samples), DEFAULT_PROCESS_OPTIONS);
    } catch (error) {
      refused.push(`${clip.clip} "${clip.speech}": ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const expectedMs = (processed.length / DEFAULT_PROCESS_OPTIONS.sampleRate) * 1000;
    const actualMs = committedMs(file);
    if (Math.abs(expectedMs - actualMs) > TOLERANCE_MS) {
      differ.push(
        `${clip.clip} "${clip.speech}": committed ${actualMs.toFixed(0)} ms, cut now ${expectedMs.toFixed(0)} ms`,
      );
    }
    if ((index + 1) % 100 === 0) console.log(`${String(index + 1)}/${String(list.clips.length)} audited`);
  }

  console.log(`${String(list.clips.length)} clips audited with a tolerance of ${String(TOLERANCE_MS)} ms.`);
  console.log(`${String(differ.length)} differ from the committed clip:`);
  for (const line of differ) console.log(`  ${line}`);
  console.log(`${String(refused.length)} have no clear pause after the lead-in now:`);
  for (const line of refused) console.log(`  ${line}`);
  if (missing.length > 0) console.log(`${String(missing.length)} have no committed clip; run npm run voice:generate.`);
  if (differ.length > 0 || refused.length > 0) process.exitCode = 1;
}

await main();
