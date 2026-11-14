/**
 * Timezone per Vitest mode. `npm test` runs in UTC. `npm run test:tz` runs with
 * `--mode tz-east` in a zone east of UTC, where a local-clock bug shows up as a
 * date one day off.
 */
const TEST_TIMEZONES: Readonly<Record<string, string>> = {
  test: 'UTC',
  'tz-east': 'Asia/Tokyo',
};

export function timezoneForMode(mode: string): string {
  const timezone = TEST_TIMEZONES[mode];
  if (timezone === undefined) {
    throw new Error(`No test timezone for Vitest mode "${mode}". Add it to tools/test/timezones.ts.`);
  }
  return timezone;
}
