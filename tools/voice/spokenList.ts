import path from 'node:path';
import { z } from 'zod';

/**
 * The hand-off between the app and the generator. A Vitest task reads the string registry, which
 * only Vite can load, and writes this file. The generator reads it with plain Node.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
// Under node_modules so git ignores it without a new ignore rule.
export const SPOKEN_LIST_PATH = path.join(REPO_ROOT, 'node_modules', '.cache', 'wkc-voice', 'spoken.json');
export const CLIP_DIR = path.join(REPO_ROOT, 'assets', 'voice', 'en');

export const spokenListSchema = z.object({
  profile: z.object({ model: z.string(), voice: z.string(), speed: z.number(), revision: z.number() }),
  clips: z.array(
    z.object({
      /** The clip file name, from voiceClipName. */
      clip: z.string().regex(/^[0-9a-f]{16}\.ogg$/),
      /** The normalized text the model reads. */
      speech: z.string().min(1),
      /** The display text of the first string sharing this clip, used by round-trip checks when speech is phonemes. */
      text: z.string().min(1).optional(),
      /** Every string id that says this, sorted. */
      ids: z.array(z.string()).min(1),
    }),
  ),
});

export type SpokenList = z.infer<typeof spokenListSchema>;
