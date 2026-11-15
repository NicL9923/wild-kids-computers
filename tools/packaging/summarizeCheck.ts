import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Judges one container check from tools/packaging/check-linux.sh. The container scripts write
 * key=value lines: result.txt from the install and network capture, session.txt from the
 * compositor session. A check passes only when every step a person relies on happened.
 *
 *   node tools/packaging/summarizeCheck.ts <result.txt> <session.txt>
 */

export const APP_ID = 'wild-kids-computers';

/** Builds a system package manager installs, which add a command, a desktop entry, and icons. */
const PACKAGE_KINDS = new Set(['pacman', 'deb', 'rpm']);
/** Builds whose files sit on disk where ldd can read them before the first start. */
const LIBRARY_CHECKED_KINDS = new Set(['pacman', 'deb', 'rpm', 'tarball']);
const KINDS = new Set([...PACKAGE_KINDS, 'tarball', 'appimage', 'appimage-extract']);

export function parseKeyValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0) continue;
    values.set(line.slice(0, at), line.slice(at + 1));
  }
  return values;
}

interface WindowInfo {
  appId: unknown;
  shell: unknown;
}

function parseWindow(raw: string | undefined): WindowInfo | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return { appId: Reflect.get(parsed, 'app_id'), shell: Reflect.get(parsed, 'shell') };
  } catch {
    return null;
  }
}

/** Every reason the check failed, empty when it passed. */
export function checkProblems(result: Map<string, string>, session: Map<string, string>): string[] {
  const problems: string[] = [];
  const expect = (values: Map<string, string>, key: string, wanted: string, reason: string) => {
    const actual = values.get(key);
    if (actual !== wanted) problems.push(`${reason} (${key} is ${actual ?? 'missing'}, expected ${wanted})`);
  };

  const error = result.get('error');
  if (error !== undefined) problems.push(`the container script stopped: ${error}`);
  const kind = result.get('kind') ?? '';
  if (!KINDS.has(kind)) {
    problems.push(`unknown build kind "${kind}"`);
    return problems;
  }

  expect(result, 'installed', 'yes', 'the build did not install');
  if (LIBRARY_CHECKED_KINDS.has(kind)) {
    expect(result, 'libraries_resolve', 'yes', 'a library the app links is missing on this system');
    const mode = result.get('sandbox_helper_mode') ?? '';
    if (!/^(4755 root|755 \S+)$/.test(mode)) {
      problems.push(`chrome-sandbox has mode "${mode}", expected 4755 owned by root or 755`);
    }
  }
  if (PACKAGE_KINDS.has(kind)) {
    const icons = Number(result.get('desktop_icon') ?? '0');
    if (!(icons > 0)) problems.push('the package installed no icon under /usr/share/icons/hicolor');
    expect(result, 'command_after_reinstall', 'yes', 'the command was gone after a reinstall, as after an upgrade');
    expect(result, 'removed_cleanly', 'yes', 'removing the package left files behind');
  }
  if (result.has('apparmor_profile_parses')) {
    expect(result, 'apparmor_profile_parses', 'yes', 'the AppArmor profile for the sandbox does not parse');
  }

  expect(result, 'network_packets', '0', 'the app sent network packets');
  // Each later step needs the one before it, so only the first missing step is reported.
  if (session.get('compositor_started') !== 'yes') {
    problems.push('the Wayland compositor did not start');
    return problems;
  }
  if (session.get('window_mapped') !== 'yes') {
    problems.push('no app window appeared');
    return problems;
  }
  const window = parseWindow(session.get('window'));
  if (window === null) problems.push('the window description is not JSON');
  else {
    if (window.appId !== APP_ID) problems.push(`the window's app id is ${String(window.appId)}, expected ${APP_ID}`);
    if (window.shell !== 'xdg_shell') {
      problems.push(`the window uses ${String(window.shell)}, expected a native Wayland xdg_shell window`);
    }
  }
  expect(session, 'screenshot', 'first-screen.png', 'the first screen was not captured');
  expect(session, 'xwayland_running', 'no', 'an X server was running');
  expect(session, 'browser_no_sandbox_switch', 'no', 'the app was started with --no-sandbox');
  expect(session, 'sandbox', 'on', 'a renderer ran outside the sandbox');
  expect(session, 'closed_by_compositor', 'yes', 'closing the window from the compositor did not end the app');
  if (session.get('closed_by_compositor') === 'yes') {
    expect(session, 'app_exit_status', '0', 'the app did not exit cleanly after the close');
  }
  return problems;
}

function readIfPresent(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

if (import.meta.main) {
  const [resultFile, sessionFile] = process.argv.slice(2);
  if (resultFile === undefined || sessionFile === undefined) {
    console.error('Usage: node tools/packaging/summarizeCheck.ts <result.txt> <session.txt>');
    process.exit(2);
  }
  const result = parseKeyValues(readIfPresent(resultFile));
  const problems = checkProblems(result, parseKeyValues(readIfPresent(sessionFile)));
  const name = path.basename(path.dirname(resultFile));
  if (problems.length > 0) {
    console.error(`FAIL ${name}`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`PASS ${name}: ${result.get('image') ?? 'unknown image'}, ${result.get('kind') ?? ''}`);
}
