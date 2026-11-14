import path from 'node:path';

export interface TestMode {
  /** True only when WKC_TEST is exactly "1". Test hooks depend on it. */
  enabled: boolean;
  /** A fresh user data directory for this run, set by e2e/support/launchApp.ts. */
  userDataDir: string | undefined;
}

export function readTestMode(env: NodeJS.ProcessEnv): TestMode {
  const enabled = env.WKC_TEST === '1';
  const dir = env.WKC_USER_DATA_DIR;
  const userDataDir = enabled && dir !== undefined && path.isAbsolute(dir) ? dir : undefined;
  return { enabled, userDataDir };
}
