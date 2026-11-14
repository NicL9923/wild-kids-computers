import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAssetDirectories, matchesPattern, readAssetDirectories, type AssetDirectory } from './checkLicenses.ts';

const mit = { source: 'Original work in this repository', author: 'Wild Flowers Tech', license: 'MIT' };

function dir(files: string[], manifest: unknown): AssetDirectory {
  return { dir: 'assets/art', files, manifest: manifest === undefined ? undefined : JSON.stringify(manifest) };
}

describe('matchesPattern', () => {
  it.each([
    ['*.svg', 'fox.svg', true],
    ['*.svg', 'fox.svg.bak', false],
    ['fox.svg', 'fox.svg', true],
    ['fox.svg', 'foxXsvg', false],
    ['clip-?.ogg', 'clip-1.ogg', true],
    ['clip-?.ogg', 'clip-12.ogg', false],
  ])('%s against %s is %s', (pattern, name, expected) => {
    expect(matchesPattern(pattern, name)).toBe(expected);
  });
});

describe('checkAssetDirectories', () => {
  it('passes when every file has an entry and every entry has a file', () => {
    expect(
      checkAssetDirectories([
        dir(
          ['a.svg', 'LICENSE'],
          [
            { ...mit, files: '*.svg' },
            { ...mit, files: 'LICENSE' },
          ],
        ),
      ]),
    ).toEqual([]);
  });

  it('passes a directory that holds only subdirectories', () => {
    expect(checkAssetDirectories([{ dir: 'assets', files: [], manifest: undefined }])).toEqual([]);
  });

  it('fails a directory with files and no manifest', () => {
    expect(checkAssetDirectories([dir(['a.svg'], undefined)])).toEqual([
      { where: 'assets/art', detail: 'has files but no LICENSES.json' },
    ]);
  });

  it('fails a file that matches no entry', () => {
    expect(checkAssetDirectories([dir(['a.svg', 'b.png'], [{ ...mit, files: '*.svg' }])])).toEqual([
      { where: 'assets/art/b.png', detail: 'matches no entry in LICENSES.json' },
    ]);
  });

  it('fails an entry that matches no file', () => {
    expect(
      checkAssetDirectories([
        dir(
          ['a.svg'],
          [
            { ...mit, files: 'a.svg' },
            { ...mit, files: 'gone.svg' },
          ],
        ),
      ]),
    ).toEqual([{ where: 'assets/art/LICENSES.json entry 1', detail: '"gone.svg" matches no file' }]);
  });

  it.each(['GPL-3.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'mit'])('fails the license %s', (license) => {
    expect(checkAssetDirectories([dir(['a.svg'], [{ ...mit, files: 'a.svg', license }])])).toEqual([
      {
        where: 'assets/art/LICENSES.json entry 0',
        detail: `license "${license}" is not one of MIT, Apache-2.0, CC0-1.0, CC-BY-4.0, OFL-1.1`,
      },
    ]);
  });

  it('fails a manifest that is not JSON', () => {
    const [problem] = checkAssetDirectories([{ dir: 'assets/art', files: ['a.svg'], manifest: '{ nope' }]);
    expect(problem?.where).toBe('assets/art/LICENSES.json');
    expect(problem?.detail).toMatch(/^is not valid JSON/);
  });

  it.each([
    ['an empty array', [], 'root'],
    ['an entry without an author', [{ files: 'a.svg', source: 's', license: 'MIT' }], '0.author'],
    ['a blank source', [{ ...mit, files: 'a.svg', source: '  ' }], '0.source'],
    ['a pattern that leaves the directory', [{ ...mit, files: '../a.svg' }], '0.files'],
    ['an unknown field', [{ ...mit, files: 'a.svg', note: 'x' }], '0'],
  ])('fails a manifest with %s and names the field', (_label, manifest, field) => {
    const problems = checkAssetDirectories([dir(['a.svg'], manifest)]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]?.detail.startsWith(`${field}:`)).toBe(true);
  });
});

describe('readAssetDirectories', () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists every directory with its files and manifest, leaving the manifest out of the files', () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'wkc-licenses-'));
    mkdirSync(path.join(root, 'assets', 'emoji'), { recursive: true });
    writeFileSync(path.join(root, 'assets', 'emoji', 'fox.svg'), '<svg/>');
    writeFileSync(path.join(root, 'assets', 'emoji', 'LICENSES.json'), '[]');

    expect(readAssetDirectories(root)).toEqual([
      { dir: 'assets', files: [], manifest: undefined },
      { dir: 'assets/emoji', files: ['fox.svg'], manifest: '[]' },
    ]);
  });
});
