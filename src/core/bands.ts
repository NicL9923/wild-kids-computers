/**
 * Age bands, youngest first. When two requirements compete, the youngest band wins,
 * so the first entry is also the default before a profile says otherwise.
 */
export const BANDS = ['band-3-5', 'band-6-8', 'band-9-12'] as const;

export type Band = (typeof BANDS)[number];

export const DEFAULT_BAND: Band = BANDS[0];

export function isBand(value: unknown): value is Band {
  return (BANDS as readonly unknown[]).includes(value);
}
