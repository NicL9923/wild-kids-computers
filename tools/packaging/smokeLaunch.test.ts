import { describe, expect, it } from 'vitest';
import { smokeProblems, type SmokeObservation } from './smokeLaunch.ts';

const RUNNING: SmokeObservation = {
  exitCode: null,
  output: '[123:ERROR:dbus/bus.cc:406] Failed to connect to the bus\n',
  processes: ['/opt/app/wild-kids-computers', '/opt/app/wild-kids-computers --type=renderer --lang=en-US'],
  rendererSeccomp: [2],
};

describe('smokeProblems', () => {
  it('passes a running app with a sandboxed renderer and only ordinary errors in its log', () => {
    expect(smokeProblems(RUNNING)).toEqual([]);
  });

  it.each<[string, Partial<SmokeObservation>, string]>([
    ['the app exited during the wait', { exitCode: 1, processes: [] }, 'exited with code 1'],
    [
      'Chromium logged a fatal error',
      { output: '[1:FATAL:zygote_host_impl_linux.cc(127)] No usable sandbox!\n' },
      'No usable sandbox',
    ],
    [
      'the main process threw',
      { output: 'A JavaScript error occurred in the main process\nUncaught Exception:\n' },
      'main process',
    ],
    ['no renderer started', { processes: ['/opt/app/wild-kids-computers'] }, 'no renderer process'],
    [
      'a process has --no-sandbox',
      { processes: [...RUNNING.processes, '/opt/app/wild-kids-computers --no-sandbox'] },
      'sandbox off',
    ],
    [
      'a process has --disable-gpu-sandbox',
      { processes: [...RUNNING.processes, '/opt/app/wild-kids-computers --disable-gpu-sandbox'] },
      'sandbox off',
    ],
    [
      'a process has --in-process-gpu',
      { processes: [...RUNNING.processes, '/opt/app/wild-kids-computers --in-process-gpu'] },
      'sandbox off',
    ],
    ['a renderer has no seccomp filter', { rendererSeccomp: [2, 0] }, 'not in seccomp filter mode: 2, 0'],
  ])('fails when %s', (_label, change, reason) => {
    expect(smokeProblems({ ...RUNNING, ...change })).toContainEqual(expect.stringContaining(reason));
  });

  it('skips the seccomp check where the system has none to read', () => {
    expect(smokeProblems({ ...RUNNING, rendererSeccomp: null })).toEqual([]);
  });
});
