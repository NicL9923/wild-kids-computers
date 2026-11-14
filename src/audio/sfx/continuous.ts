import type { ContinuousSfxFactory, ContinuousSound } from '../audioEngine.ts';
import type { ContinuousSfxName } from './sfxNames.ts';
import { MAX_PEAK, noiseBuffer } from './synth.ts';

interface SweepOptions {
  readonly filter: BiquadFilterType;
  /** Filter frequency at intensity 0 and at intensity 1, in Hz. */
  readonly lowHz: number;
  readonly highHz: number;
  readonly q: number;
  /** Level at full intensity, capped at MAX_PEAK. */
  readonly peak: number;
}

/** Seconds for the sound to follow a change, so a jittery pointer does not crackle. */
const SMOOTHING = 0.04;

/**
 * Looping filtered noise whose level and brightness follow `set(intensity)`. Intensity 0 is
 * silent, so a brush held still makes no sound, and a faster stroke sounds brighter.
 */
function noiseSweep(options: SweepOptions): ContinuousSfxFactory {
  return (context, output): ContinuousSound => {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = options.filter;
    filter.Q.value = options.q;
    filter.frequency.value = options.lowHz;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start();
    let stopped = false;

    return {
      set(intensity) {
        if (stopped) return;
        const amount = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
        const now = context.currentTime;
        gain.gain.setTargetAtTime(Math.min(options.peak, MAX_PEAK) * amount, now, SMOOTHING);
        filter.frequency.setTargetAtTime(options.lowHz + (options.highHz - options.lowHz) * amount, now, SMOOTHING);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        const now = context.currentTime;
        gain.gain.setTargetAtTime(0, now, SMOOTHING);
        source.stop(now + SMOOTHING * 5);
        source.addEventListener('ended', () => gain.disconnect(), { once: true });
      },
    };
  };
}

export const CONTINUOUS: Readonly<Record<ContinuousSfxName, ContinuousSfxFactory>> = {
  // A soft bristle swish. Faster strokes sound brighter.
  brush: noiseSweep({ filter: 'bandpass', lowHz: 500, highHz: 2600, q: 1.2, peak: 0.12 }),
  // A duller rub, lower than the brush, so the two are easy to tell apart.
  eraser: noiseSweep({ filter: 'lowpass', lowHz: 300, highHz: 1100, q: 0.7, peak: 0.1 }),
};
