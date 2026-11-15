import { describe, expect, it } from 'vitest';
import { checkProblems, parseKeyValues } from './summarizeCheck.ts';

const PASSING_RESULT = `image=Arch Linux
kind=pacman
artifact=wild-kids-computers-0.1.0-1-x86_64.pkg.tar.zst
installed=yes
libraries_resolve=yes
sandbox_helper_mode=755 root
desktop_icon=8
network_packets=0
session_status=0
removed_cleanly=yes
command_after_reinstall=yes
`;

const PASSING_SESSION = `compositor=sway
compositor_started=yes
window_mapped=yes
window={"app_id":"wild-kids-computers","shell":"xdg_shell","width":1920,"height":1080,"fullscreen":0}
screenshot=first-screen.png
browser_no_sandbox_switch=no
sandbox=on
closed_by_compositor=yes
app_exit_status=0
xwayland_running=no
`;

function apply(base: string, changes: Record<string, string | null>) {
  const values = parseKeyValues(base);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) values.delete(key);
    else values.set(key, value);
  }
  return values;
}

/** The passing files with some lines replaced or, given null, removed. */
function check(result: Record<string, string | null> = {}, session: Record<string, string | null> = {}) {
  return checkProblems(apply(PASSING_RESULT, result), apply(PASSING_SESSION, session));
}

describe('parseKeyValues', () => {
  it('keeps everything after the first equals sign, so JSON values survive', () => {
    expect(parseKeyValues('window={"a":"b=c"}\n').get('window')).toBe('{"a":"b=c"}');
  });

  it('skips lines without a key', () => {
    expect([...parseKeyValues('=value\nplain line\n\nkey=1').keys()]).toEqual(['key']);
  });
});

describe('checkProblems', () => {
  it('passes a check where every step happened', () => {
    expect(check()).toEqual([]);
  });

  it.each<[string, Record<string, string | null>, Record<string, string | null>, string]>([
    ['the container script stopped', { error: 'pacman -U failed' }, {}, 'stopped: pacman -U failed'],
    ['the kind is unknown', { kind: 'snap' }, {}, 'unknown build kind "snap"'],
    ['the install failed', { installed: null }, {}, 'did not install'],
    ['a library is missing', { libraries_resolve: 'no' }, {}, 'library the app links is missing'],
    [
      'the sandbox helper has a loose mode',
      { sandbox_helper_mode: '4755 kid' },
      {},
      'chrome-sandbox has mode "4755 kid"',
    ],
    ['the package has no icon', { desktop_icon: '0' }, {}, 'no icon'],
    ['removal left files', { removed_cleanly: 'no: /opt/x' }, {}, 'left files behind'],
    ['a reinstall lost the command', { command_after_reinstall: 'no' }, {}, 'gone after a reinstall'],
    ['the app sent a packet', { network_packets: '1' }, {}, 'sent network packets'],
    ['the AppArmor profile does not parse', { apparmor_profile_parses: 'no' }, {}, 'AppArmor profile'],
    ['the compositor did not start', {}, { compositor_started: 'no' }, 'compositor did not start'],
    ['no window appeared', {}, { window_mapped: 'no' }, 'no app window appeared'],
    ['the window is described badly', {}, { window: 'not json' }, 'not JSON'],
    ['the app id is wrong', {}, { window: '{"app_id":"electron","shell":"xdg_shell"}' }, 'app id is electron'],
    [
      'the window is an X window',
      {},
      { window: '{"app_id":"wild-kids-computers","shell":"xwayland"}' },
      'uses xwayland',
    ],
    ['there is no screenshot', {}, { screenshot: null }, 'first screen was not captured'],
    ['an X server ran', {}, { xwayland_running: 'yes' }, 'X server was running'],
    ['the app got --no-sandbox', {}, { browser_no_sandbox_switch: 'yes' }, 'started with --no-sandbox'],
    ['a renderer was unsandboxed', {}, { sandbox: 'off' }, 'outside the sandbox'],
    ['the close did nothing', {}, { closed_by_compositor: 'no' }, 'did not end the app'],
    ['the app crashed on close', {}, { app_exit_status: '1' }, 'did not exit cleanly'],
  ])('fails when %s', (_label, result, session, reason) => {
    expect(check(result, session)).toContainEqual(expect.stringContaining(reason));
  });

  it('reports only the missing window, not the steps that needed it', () => {
    expect(check({}, { window_mapped: 'no', sandbox: null, closed_by_compositor: null })).toEqual([
      'no app window appeared',
    ]);
  });

  it.each(['appimage', 'appimage-extract'])(
    'does not ask an %s build for the library, icon, or removal steps it does not have',
    (kind) => {
      expect(
        check({
          kind,
          libraries_resolve: null,
          sandbox_helper_mode: null,
          desktop_icon: null,
          removed_cleanly: null,
          command_after_reinstall: null,
        }),
      ).toEqual([]);
    },
  );

  it('asks a tarball for its libraries and sandbox helper but not for removal', () => {
    expect(
      check({ kind: 'tarball', desktop_icon: null, removed_cleanly: null, command_after_reinstall: null }),
    ).toEqual([]);
    expect(check({ kind: 'tarball', libraries_resolve: 'no' })).toContainEqual(
      expect.stringContaining('library the app links is missing'),
    );
  });
});
