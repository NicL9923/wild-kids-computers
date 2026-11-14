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
 *
 * The packaged app is the one children use, so it never turns test mode on: an environment
 * variable must not open test hooks or move the saved data. End-to-end tests run unpackaged.
 */
export function readTestMode(env: NodeJS.ProcessEnv, isPackaged: boolean): TestMode {
  const enabled = !isPackaged && env.WKC_TEST === '1';
  if (!enabled) return { enabled, userDataDir: undefined, info: undefined };
  const dir = env.WKC_USER_DATA_DIR;
  const userDataDir = dir !== undefined && path.isAbsolute(dir) ? dir : undefined;
  const raw = env.WKC_TEST_INFO;
  const info = raw === undefined || raw === '' ? {} : testInfoSchema.parse(JSON.parse(raw));
  return { enabled, userDataDir, info };
}

/** Chromium switches that open the app to a debugger. Playwright passes them to an unpackaged run. */
const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address'] as const;

interface CommandLine {
  hasSwitch(name: string): boolean;
  removeSwitch(name: string): void;
}

/**
 * Removes the debugging switches from a packaged app's command line, so a shortcut with
 * `--remote-debugging-port` cannot hand the app to another program. It must run before the
 * ready event, which is when Electron reads them. Returns the switches it removed.
 */
export function stripDebugSwitches(commandLine: CommandLine, isPackaged: boolean): string[] {
  if (!isPackaged) return [];
  const removed = DEBUG_SWITCHES.filter((name) => commandLine.hasSwitch(name));
  for (const name of removed) commandLine.removeSwitch(name);
  return removed;
}
