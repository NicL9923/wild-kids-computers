import { z } from 'zod';

/** What color match keeps per profile: whether each color also shows its own pattern. */
export interface ColorMatchState {
  readonly patterns: boolean;
}

export const colorMatchStateSchema: z.ZodType<ColorMatchState> = z.object({ patterns: z.boolean() });

/** Patterns start off, so the colors read plainly. A parent or child turns them on once. */
export const colorMatchDefaults = (): ColorMatchState => ({ patterns: false });
