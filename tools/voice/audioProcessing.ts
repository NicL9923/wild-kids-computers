/**
 * Post-processing for generated speech, done in plain TypeScript so it is deterministic and
 * unit-tested. The generator trims silence, evens out loudness, and fades the edges before ffmpeg
 * encodes the clip.
 */

export interface ProcessOptions {
  readonly sampleRate: number;
  /** A sample quieter than this, in dBFS, counts as silence when trimming. */
  readonly silenceThresholdDb: number;
  /** Silence kept before the first and after the last loud sample, in ms. */
  readonly padStartMs: number;
  readonly padEndMs: number;
  /** Target RMS level of the voiced part, in dBFS. */
  readonly targetRmsDb: number;
  /** The loudest sample after gain, in dBFS. Gain stops short of this. */
  readonly peakCeilingDb: number;
  /** Linear fade at each edge, in ms, so a clip never starts or stops with a click. */
  readonly fadeMs: number;
}

export const DEFAULT_PROCESS_OPTIONS: ProcessOptions = {
  sampleRate: 24_000,
  silenceThresholdDb: -45,
  padStartMs: 40,
  padEndMs: 80,
  targetRmsDb: -20,
  peakCeilingDb: -1.5,
  fadeMs: 8,
};

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/**
 * Cuts leading and trailing silence and keeps a short pad of the original audio on each side.
 * Returns an empty array when nothing is louder than the threshold, so a silent result is caught.
 */
export function trimSilence(samples: Float32Array, options: ProcessOptions): Float32Array {
  const threshold = dbToGain(options.silenceThresholdDb);
  let first = -1;
  let last = -1;
  for (let index = 0; index < samples.length; index += 1) {
    if (Math.abs(samples[index] ?? 0) > threshold) {
      if (first === -1) first = index;
      last = index;
    }
  }
  if (first === -1) return new Float32Array(0);
  const start = Math.max(0, first - Math.round((options.padStartMs / 1000) * options.sampleRate));
  const end = Math.min(samples.length, last + 1 + Math.round((options.padEndMs / 1000) * options.sampleRate));
  return samples.slice(start, end);
}

/**
 * RMS over the voiced part only: 20 ms frames whose own RMS is within 30 dB of the loudest frame.
 * Pauses between words would otherwise make a slow sentence sound quieter than a fast one.
 */
export function voicedRms(samples: Float32Array, sampleRate: number): number {
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  const frames: number[] = [];
  for (let start = 0; start < samples.length; start += frame) {
    let sum = 0;
    const end = Math.min(samples.length, start + frame);
    for (let index = start; index < end; index += 1) sum += (samples[index] ?? 0) ** 2;
    frames.push(sum / (end - start));
  }
  const loudest = Math.max(0, ...frames);
  if (loudest === 0) return 0;
  const gate = loudest * dbToGain(-30) ** 2;
  const voiced = frames.filter((meanSquare) => meanSquare >= gate);
  return Math.sqrt(voiced.reduce((sum, value) => sum + value, 0) / voiced.length);
}

/** Scales the clip to the target voiced RMS, but never past the peak ceiling. */
export function normalizeLoudness(samples: Float32Array, options: ProcessOptions): Float32Array {
  const rms = voicedRms(samples, options.sampleRate);
  if (rms === 0) return samples.slice();
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = Math.min(dbToGain(options.targetRmsDb) / rms, dbToGain(options.peakCeilingDb) / peak);
  return samples.map((sample) => sample * gain);
}

export function fadeEdges(samples: Float32Array, options: ProcessOptions): Float32Array {
  const out = samples.slice();
  const length = Math.min(Math.round((options.fadeMs / 1000) * options.sampleRate), Math.floor(out.length / 2));
  for (let index = 0; index < length; index += 1) {
    const gain = index / length;
    out[index] = (out[index] ?? 0) * gain;
    const fromEnd = out.length - 1 - index;
    out[fromEnd] = (out[fromEnd] ?? 0) * gain;
  }
  return out;
}

export interface LeadCutOptions {
  readonly sampleRate: number;
  /** A 10 ms frame quieter than this, in dBFS, counts as part of a pause. */
  readonly silenceThresholdDb: number;
  /**
   * A pause at least this long, in ms, is surely the break after the lead-in when it is the first
   * one in the window. A shorter first pause is taken only when no other pause follows it there.
   */
  readonly minPauseMs: number;
  /**
   * Shorter quiet gaps are part of speech, such as the closure before a stop, never the break.
   * A sound shorter than this between two pauses is a click, and the pauses count as one.
   */
  readonly shortestPauseMs: number;
  /** The pause must start inside this window, in ms from the start. */
  readonly earliestPauseMs: number;
  readonly latestPauseMs: number;
  /** Audio kept before the first sound after the pause, in ms. */
  readonly keepBeforeMs: number;
}

export const DEFAULT_LEAD_CUT: LeadCutOptions = {
  sampleRate: 24_000,
  silenceThresholdDb: -40,
  minPauseMs: 120,
  shortestPauseMs: 30,
  earliestPauseMs: 400,
  latestPauseMs: 1_600,
  keepBeforeMs: 30,
};

/** A quiet stretch between two sounds. */
export interface Pause {
  /** When the quiet starts, in ms from the start of the audio. */
  readonly startMs: number;
  readonly lengthMs: number;
  /** The sample where sound comes back. */
  readonly resumeAt: number;
}

/**
 * Every quiet stretch between two sounds, in 10 ms frames, in order. Silence before the first
 * sound and after the last one is not a pause.
 */
export function findPauses(
  samples: Float32Array,
  options: Pick<LeadCutOptions, 'sampleRate' | 'silenceThresholdDb'>,
): Pause[] {
  const frame = Math.max(1, Math.round(options.sampleRate * 0.01));
  const threshold = dbToGain(options.silenceThresholdDb);
  const pauses: Pause[] = [];
  let heardSound = false;
  let quietFrames = 0;
  for (let start = 0, index = 0; start < samples.length; start += frame, index += 1) {
    let peak = 0;
    for (let at = start; at < Math.min(samples.length, start + frame); at += 1)
      peak = Math.max(peak, Math.abs(samples[at] ?? 0));
    if (peak <= threshold) {
      if (heardSound) quietFrames += 1;
      continue;
    }
    if (heardSound && quietFrames > 0) {
      pauses.push({ startMs: (index - quietFrames) * 10, lengthMs: quietFrames * 10, resumeAt: start });
    }
    heardSound = true;
    quietFrames = 0;
  }
  return pauses;
}

/**
 * Joins a short pause to the next one when only a click lies between them: a sound shorter than
 * `shortestPauseMs`. The letter sound "/ks/" ends its lead-in with a 30 ms dip, a 20 ms click,
 * and then the 370 ms break. A pause of `minPauseMs` or more is never joined to what follows,
 * because a word can start with a burst that short, such as the "h" of "horse".
 */
function mergeClicks(pauses: readonly Pause[], options: LeadCutOptions): Pause[] {
  const merged: Pause[] = [];
  for (const pause of pauses) {
    const previous = merged.at(-1);
    const soundMs = previous === undefined ? Infinity : pause.startMs - (previous.startMs + previous.lengthMs);
    if (previous !== undefined && previous.lengthMs < options.minPauseMs && soundMs < options.shortestPauseMs) {
      merged[merged.length - 1] = {
        startMs: previous.startMs,
        lengthMs: pause.startMs + pause.lengthMs - previous.startMs,
        resumeAt: pause.resumeAt,
      };
    } else {
      merged.push(pause);
    }
  }
  return merged;
}

/**
 * The pause after the lead-in: the earliest pause of at least `shortestPauseMs` that starts
 * inside the window. A later pause is never taken for it, because cutting there would drop the
 * first words. Throws when there is no such pause, and when the cut is ambiguous: the earliest
 * pause is shorter than `minPauseMs` and a longer one follows it in the window, so the longer one
 * could as well be the break. In every clip generated so far the break started 810 to 1300 ms in;
 * a later, shorter gap is the closure of a stop inside the speech, which is no rival.
 */
function leadPause(samples: Float32Array, options: LeadCutOptions = DEFAULT_LEAD_CUT): Pause {
  const inWindow = mergeClicks(findPauses(samples, options), options).filter(
    (pause) =>
      pause.lengthMs >= options.shortestPauseMs &&
      pause.startMs >= options.earliestPauseMs &&
      pause.startMs <= options.latestPauseMs,
  );
  const [first, ...later] = inWindow;
  if (first === undefined) {
    throw new Error(
      `No pause of ${String(options.shortestPauseMs)} ms or more starts between ${String(options.earliestPauseMs)} and ${String(options.latestPauseMs)} ms, after the lead-in.`,
    );
  }
  const rival =
    first.lengthMs < options.minPauseMs ? later.find((pause) => pause.lengthMs > first.lengthMs) : undefined;
  if (rival !== undefined) {
    throw new Error(
      `The pause after the lead-in is ambiguous: the first one, at ${String(first.startMs)} ms, lasts only ${String(first.lengthMs)} ms, and one of ${String(rival.lengthMs)} ms follows at ${String(rival.startMs)} ms.`,
    );
  }
  return first;
}

/**
 * Removes the lead-in phrase the generator puts before every clip. Kokoro adds a false consonant
 * to the start of a short utterance that begins with a vowel ("egg" comes out "lag"), so the
 * generator says "Ready? egg" and keeps only what follows the pause after the lead-in.
 *
 * Throws when that pause is missing or ambiguous; see leadPause. A clip that kept its lead-in, or
 * lost its first word, must never be written.
 */
export function cutAfterLead(samples: Float32Array, options: LeadCutOptions = DEFAULT_LEAD_CUT): Float32Array {
  const pause = leadPause(samples, options);
  const keep = Math.round((options.keepBeforeMs / 1000) * options.sampleRate);
  return samples.slice(Math.max(0, pause.resumeAt - keep));
}

/** Trim, then even out loudness, then fade. Throws when the model produced only silence. */
export function processSpeech(samples: Float32Array, options: ProcessOptions = DEFAULT_PROCESS_OPTIONS): Float32Array {
  const trimmed = trimSilence(samples, options);
  if (trimmed.length === 0) throw new Error('The speech model returned silence.');
  return fadeEdges(normalizeLoudness(trimmed, options), options);
}
