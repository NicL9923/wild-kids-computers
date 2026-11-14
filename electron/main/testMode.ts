import path from 'node:path';
import { testInfoSchema, type TestInfo } from '../../src/core/platform/testInfo.ts';

export interface TestMode {
  /** True only when WKC_TEST is exactly "1". Test hooks depend on it. */
  enabled: boolean;
  /** A fresh user data directory for this run, set by e2e/support/launchApp.ts. */
  userDataDir: string | undefined;
  /** What the test passed in WKC_TEST_INFO. The bridge's info() returns it. */
  info: TestInfo | undefined;
}

/**
 * Reads the test switches from the environment. A malformed WKC_TEST_INFO throws, so a test
 * that passes a bad option fails at launch instead of running with defaults.
 */
export function readTestMode(env: NodeJS.ProcessEnv): TestMode {
  const enabled = env.WKC_TEST === '1';
  if (!enabled) return { enabled, userDataDir: undefined, info: undefined };
  const dir = env.WKC_USER_DATA_DIR;
  const userDataDir = dir !== undefined && path.isAbsolute(dir) ? dir : undefined;
  const raw = env.WKC_TEST_INFO;
  const info = raw === undefined || raw === '' ? {} : testInfoSchema.parse(JSON.parse(raw));
  return { enabled, userDataDir, info };
}
