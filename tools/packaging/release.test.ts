import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatChecksums, installerNames, tagProblem } from './release.ts';

describe('tagProblem', () => {
  it.each(['0.1.0', '1.2.3-rc.1'])('accepts v%s for that version', (version) => {
    expect(tagProblem(`v${version}`, version)).toBeNull();
  });

  it.each([
    ['another version', 'v0.1.1', '0.1.0', 'does not match package.json version 0.1.0'],
    ['no v', '0.1.0', '0.1.0', 'does not start with v'],
    ['a branch name', 'main', '0.1.0', 'does not start with v'],
    ['a tag with a suffix', 'v0.1.0-test', '0.1.0', 'expected v0.1.0'],
    ['a version that is not semantic', 'v1', '1', 'is not a semantic version'],
  ])('rejects %s', (_label, tag, version, reason) => {
    expect(tagProblem(tag, version)).toContain(reason);
  });
});

describe('installerNames', () => {
  it('keeps every installer type, sorted, and leaves out the rest', () => {
    const names = [
      'builder-debug.yml',
      'wild-kids-computers-0.1.0-win-x64.exe',
      'wild-kids-computers-0.1.0-1-x86_64.pkg.tar.zst',
      'wild-kids-computers-0.1.0-linux-x86_64.AppImage',
      'wild-kids-computers-0.1.0-linux-amd64.deb',
      'wild-kids-computers-0.1.0-linux-x86_64.rpm',
      'wild-kids-computers-0.1.0-linux-x64.tar.gz',
      'wild-kids-computers-0.1.0-mac-arm64.dmg',
      'wild-kids-computers-0.1.0-mac-arm64.zip',
      'wild-kids-computers-0.1.0-win-x64.exe.blockmap',
      'latest.yml',
      'SHA256SUMS',
    ];
    expect(installerNames(names)).toEqual([
      'wild-kids-computers-0.1.0-1-x86_64.pkg.tar.zst',
      'wild-kids-computers-0.1.0-linux-amd64.deb',
      'wild-kids-computers-0.1.0-linux-x64.tar.gz',
      'wild-kids-computers-0.1.0-linux-x86_64.AppImage',
      'wild-kids-computers-0.1.0-linux-x86_64.rpm',
      'wild-kids-computers-0.1.0-mac-arm64.dmg',
      'wild-kids-computers-0.1.0-mac-arm64.zip',
      'wild-kids-computers-0.1.0-win-x64.exe',
    ]);
  });

  it('fails when the folder holds no installer', () => {
    expect(() => installerNames(['builder-debug.yml'])).toThrow('No installers');
  });

  it('fails on a name that would break the sums format', () => {
    expect(() => installerNames(['bad\nname.deb'])).toThrow('newline or backslash');
  });
});

describe('formatChecksums', () => {
  it('writes lines that sha256sum --check accepts', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'wkc-sums-'));
    try {
      const body = 'installer bytes';
      writeFileSync(path.join(dir, 'app.deb'), body);
      const sha256 = createHash('sha256').update(body).digest('hex');
      writeFileSync(path.join(dir, 'SHA256SUMS'), formatChecksums([{ name: 'app.deb', sha256 }]));
      expect(execFileSync('sha256sum', ['--check', 'SHA256SUMS'], { cwd: dir, encoding: 'utf8' })).toBe(
        'app.deb: OK\n',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a digest that is not 64 hex digits', () => {
    expect(() => formatChecksums([{ name: 'app.deb', sha256: 'ABC' }])).toThrow('Not a SHA-256');
  });
});
