/**
 * Small building blocks for synthesized effects. Every sound is an oscillator or a burst of noise
 * through a gain envelope, so it is original, adds no files, and stays soft and brief.
 */

/** No effect gets louder than this before the effects volume. Keeps every sound soft. */
export const MAX_PEAK = 0.3;

export interface ToneOptions {
  readonly type?: OscillatorType;
  /** Start frequency in Hz. */
  readonly from: number;
  /** End frequency in Hz. Defaults to `from`. */
  readonly to?: number;
  /** Seconds from start to silence. */
  readonly duration: number;
  /** Seconds after the context time to start. */
  readonly delay?: number;
  /** Peak level, 0 to 1, capped at MAX_PEAK. */
  readonly peak: number;
  /** Seconds to reach the peak. */
  readonly attack?: number;
}

/** Shapes `gain` as a quick rise to `peak` then an exponential fall to silence. */
function envelope(gain: AudioParam, start: number, options: { peak: number; attack: number; duration: number }) {
  const peak = Math.min(options.peak, MAX_PEAK);
  gain.setValueAtTime(0, start);
  gain.linearRampToValueAtTime(peak, start + options.attack);
  // Exponential ramps cannot reach zero, so fall to a level well below hearing, then stop.
  gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
}

export function tone(context: AudioContext, output: AudioNode, options: ToneOptions): void {
  const start = context.currentTime + (options.delay ?? 0);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.setValueAtTime(options.from, start);
  if (options.to !== undefined && options.to !== options.from) {
    oscillator.frequency.exponentialRampToValueAtTime(options.to, start + options.duration);
  }
  envelope(gain.gain, start, { peak: options.peak, attack: options.attack ?? 0.005, duration: options.duration });
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + options.duration + 0.02);
  oscillator.addEventListener('ended', () => gain.disconnect(), { once: true });
}

/**
 * Deterministic white noise. Effects need no real randomness, and a fixed sequence keeps the
 * module free of Math.random. A 32-bit xorshift is plenty for a hiss.
 */
function noiseSamples(length: number, seed = 0x2545f491): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  let state = seed >>> 0 || 1;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    samples[index] = (state / 0xffffffff) * 2 - 1;
  }
  return samples;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of noise per context, reused by every noise effect. */
export function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(context);
  if (buffer === undefined) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    buffer.copyToChannel(noiseSamples(context.sampleRate), 0);
    noiseBuffers.set(context, buffer);
  }
  return buffer;
}

export interface NoiseOptions {
  readonly filter: BiquadFilterType;
  /** Filter frequency at the start, in Hz. */
  readonly from: number;
  /** Filter frequency at the end, in Hz. Defaults to `from`. */
  readonly to?: number;
  readonly q?: number;
  readonly duration: number;
  readonly delay?: number;
  readonly peak: number;
  readonly attack?: number;
}

export function noise(context: AudioContext, output: AudioNode, options: NoiseOptions): void {
  const start = context.currentTime + (options.delay ?? 0);
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context);
  const filter = context.createBiquadFilter();
  filter.type = options.filter;
  filter.Q.value = options.q ?? 1;
  filter.frequency.setValueAtTime(options.from, start);
  if (options.to !== undefined && options.to !== options.from) {
    filter.frequency.exponentialRampToValueAtTime(options.to, start + options.duration);
  }
  const gain = context.createGain();
  envelope(gain.gain, start, { peak: options.peak, attack: options.attack ?? 0.005, duration: options.duration });
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(start);
  source.stop(start + options.duration + 0.02);
  source.addEventListener('ended', () => gain.disconnect(), { once: true });
}
