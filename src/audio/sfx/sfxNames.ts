/**
 * The names of the short synthesized effects. `oneShots.ts` must implement every name, so a typo
 * in `play('pop')` is a compile error and a name with no sound cannot exist.
 */
const SFX_NAMES = [
  'pop',
  'chime',
  'nudge',
  'pick-up',
  'put-down',
  'tap',
  'whoosh',
  'sparkle',
  'page-turn',
  'key-tap',
  'open',
  'close',
  'bloom',
  'stamp',
  'fill',
  'snap',
  // The music box's five notes, lowest first: a pentatonic scale, so any mix sounds pleasant.
  'note-1',
  'note-2',
  'note-3',
  'note-4',
  'note-5',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

/** Effects that play until stopped. A brush's pitch and level follow the stroke speed. */
const CONTINUOUS_SFX_NAMES = ['brush', 'eraser'] as const;

export type ContinuousSfxName = (typeof CONTINUOUS_SFX_NAMES)[number];
