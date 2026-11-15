import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INSTALL_HELP_URL, sandboxOffSwitch, sandboxRefusal } from './sandboxGuard.ts';

function commandLine(...switches: string[]) {
  return { hasSwitch: (name: string) => switches.includes(name) };
}

describe('sandboxOffSwitch', () => {
  it.each([
    ['--no-sandbox', ['no-sandbox'], 'no-sandbox'],
    ['--disable-seccomp-filter-sandbox', ['disable-seccomp-filter-sandbox'], 'disable-seccomp-filter-sandbox'],
    // The GPU process handles pixels from the pages. Without its sandbox it keeps the right to
    // gain privileges, and in-process it runs inside the browser process, which has no sandbox.
    ['--disable-gpu-sandbox', ['disable-gpu-sandbox'], 'disable-gpu-sandbox'],
    ['--in-process-gpu', ['in-process-gpu'], 'in-process-gpu'],
    ['both, naming the first', ['disable-seccomp-filter-sandbox', 'no-sandbox'], 'no-sandbox'],
  ])('refuses a start with %s', (_label, switches, expected) => {
    expect(sandboxOffSwitch(commandLine(...switches))).toBe(expected);
  });

  it('lets a start with other switches through', () => {
    // The setuid helper and the namespace sandbox can each stand in for the other, so turning one
    // off still leaves the renderers sandboxed.
    expect(sandboxOffSwitch(commandLine('disable-setuid-sandbox', 'ozone-platform'))).toBeNull();
  });
});

describe('sandboxRefusal', () => {
  it('names the switch it refused and where to get help', () => {
    const { message } = sandboxRefusal('no-sandbox');
    expect(message).toContain('--no-sandbox');
    expect(message).toContain(INSTALL_HELP_URL);
  });

  it('points at the install section of the homepage in package.json', () => {
    const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
    const homepage = typeof pkg === 'object' && pkg !== null ? Reflect.get(pkg, 'homepage') : undefined;
    expect(INSTALL_HELP_URL).toBe(`${String(homepage)}#install`);
  });
});
