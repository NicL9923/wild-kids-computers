// Vitest setup file. vite.config.ts sets TZ before the workers start. This check fails
// the run if the worker did not pick it up, so a timezone run can never pass silently in UTC.
const expected = process.env.TZ;
const actual = Intl.DateTimeFormat().resolvedOptions().timeZone;

if (expected === undefined || actual !== expected) {
  throw new Error(`Tests must run in the pinned timezone. Expected TZ=${String(expected)}, got ${actual}.`);
}
