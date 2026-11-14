import type { SfxPlayer } from '../audioEngine.ts';
import type { SfxName } from './sfxNames.ts';
import { noise, tone } from './synth.ts';

/**
 * Every short effect, synthesized. Each one is under half a second, soft, and has one job: to
 * confirm the child's action. None of them celebrates or scolds. `nudge` is the neutral response
 * to a wrong try: a low, gentle two-note sound, never a buzzer.
 */
export const ONE_SHOTS: Readonly<Record<SfxName, SfxPlayer>> = {
  // A seed pod or bubble popping: a fast downward blip.
  pop: (context, out) => tone(context, out, { type: 'sine', from: 900, to: 220, duration: 0.09, peak: 0.25 }),

  // A gentle confirmation: two soft bell partials.
  chime: (context, out) => {
    tone(context, out, { type: 'sine', from: 880, duration: 0.45, peak: 0.14, attack: 0.004 });
    tone(context, out, { type: 'sine', from: 1320, duration: 0.3, peak: 0.07, attack: 0.004, delay: 0.06 });
  },

  // A neutral "not that one": two low, rounded notes that step down a little.
  nudge: (context, out) => {
    tone(context, out, { type: 'triangle', from: 330, duration: 0.12, peak: 0.12, attack: 0.01 });
    tone(context, out, { type: 'triangle', from: 294, duration: 0.16, peak: 0.1, attack: 0.01, delay: 0.13 });
  },

  // Lifting something: a short rising sweep.
  'pick-up': (context, out) => tone(context, out, { type: 'sine', from: 380, to: 620, duration: 0.11, peak: 0.16 }),

  // Setting it down: a short falling sweep with a soft thud.
  'put-down': (context, out) => {
    tone(context, out, { type: 'sine', from: 520, to: 300, duration: 0.12, peak: 0.16 });
    noise(context, out, { filter: 'lowpass', from: 400, duration: 0.06, peak: 0.08 });
  },

  // A light tap on a button or a target.
  tap: (context, out) => tone(context, out, { type: 'sine', from: 1200, to: 900, duration: 0.04, peak: 0.12 }),

  // Something moving away: filtered noise that sweeps up and fades.
  whoosh: (context, out) =>
    noise(context, out, { filter: 'bandpass', from: 300, to: 2400, q: 0.8, duration: 0.28, peak: 0.14, attack: 0.08 }),

  // A little shimmer for paint-on glitter: three quick high notes.
  sparkle: (context, out) => {
    for (const [index, frequency] of [1568, 2093, 2637].entries()) {
      tone(context, out, { type: 'sine', from: frequency, duration: 0.18, peak: 0.06, delay: index * 0.05 });
    }
  },

  // Turning a page in the gallery or a book: a soft, brushed rustle.
  'page-turn': (context, out) =>
    noise(context, out, { filter: 'highpass', from: 1800, to: 3600, duration: 0.18, peak: 0.08, attack: 0.03 }),

  // A keyboard key: a very short click.
  'key-tap': (context, out) =>
    noise(context, out, { filter: 'bandpass', from: 3000, q: 2, duration: 0.03, peak: 0.12 }),

  // A window or folder opening: a quick rising pair.
  open: (context, out) => {
    tone(context, out, { type: 'sine', from: 523, duration: 0.08, peak: 0.12 });
    tone(context, out, { type: 'sine', from: 784, duration: 0.1, peak: 0.12, delay: 0.06 });
  },

  // A window closing: the same pair, falling.
  close: (context, out) => {
    tone(context, out, { type: 'sine', from: 784, duration: 0.08, peak: 0.12 });
    tone(context, out, { type: 'sine', from: 523, duration: 0.1, peak: 0.12, delay: 0.06 });
  },

  // A flower opening under the pointer: a soft upward glide.
  bloom: (context, out) =>
    tone(context, out, { type: 'sine', from: 440, to: 880, duration: 0.25, peak: 0.1, attack: 0.04 }),

  // Placing a stamp: a muted thump.
  stamp: (context, out) => {
    tone(context, out, { type: 'sine', from: 180, to: 90, duration: 0.1, peak: 0.22 });
    noise(context, out, { filter: 'lowpass', from: 900, duration: 0.05, peak: 0.08 });
  },

  // The fill bucket pouring: a short liquid downward sweep.
  fill: (context, out) =>
    noise(context, out, { filter: 'bandpass', from: 1600, to: 400, q: 3, duration: 0.22, peak: 0.12, attack: 0.02 }),

  // A piece snapping into place: a crisp double tick.
  snap: (context, out) => {
    tone(context, out, { type: 'square', from: 1400, duration: 0.025, peak: 0.06 });
    tone(context, out, { type: 'square', from: 1800, duration: 0.025, peak: 0.06, delay: 0.035 });
  },
};
