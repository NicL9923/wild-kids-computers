import { z } from 'zod';
import { BANDS } from '../bands.ts';
import { isSafeId } from './names.ts';

/**
 * What an end-to-end test passes to the app. e2e/support/launchApp.ts writes it as JSON into
 * WKC_TEST_INFO, and the main process returns it from `info()` only when WKC_TEST=1. Unknown
 * keys fail, so a test cannot pass an option the app silently ignores.
 */
export const testInfoSchema = z
  .object({
    band: z.enum(BANDS).optional(),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 32 - 1)
      .optional(),
    difficulty: z.number().int().min(1).max(10).optional(),
    activity: z.string().refine(isSafeId, 'activity must be a kebab-case id').optional(),
  })
  .strict();

export type TestInfo = z.infer<typeof testInfoSchema>;
