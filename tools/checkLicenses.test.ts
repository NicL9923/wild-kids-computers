import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findLicenseProblems, globToRegExp } from './checkLicenses.ts';

let root = '';
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Writes files into a fresh temporary assets folder. */
function assets(files: Record<string, string>): string {
  root = mkdtempSync(path.join(tmpdir(), 'wkc-assets-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const entry = (files: string, license = 'OFL-1.1') => ({
  files,
  source: 'https://example.org',
  author: 'Someone',
  license,
});

describe('findLicenseProblems', () => {
  it('passes when every file matches an entry and every entry matches a file', () => {
    const dir = assets({
      'fonts/LICENSES.json': JSON.stringify([entry('Face.ttf'), entry('*.glyphs.json')]),
      'fonts/Face.ttf': 'x',
      'fonts/face.glyphs.json': '{}',
      'emoji/LICENSES.json': JSON.stringify([entry('**/*.svg', 'MIT')]),
      'emoji/animals/fox.svg': '<svg/>',
    });
    expect(findLicenseProblems(dir)).toEqual([]);
  });

  it('passes for a missing assets folder', () => {
    expect(findLicenseProblems(path.join(tmpdir(), 'wkc-no-such-assets-folder'))).toEqual([]);
  });

  it.each([
    [
      'a file with no entry',
      { 'fonts/LICENSES.json': JSON.stringify([entry('Face.ttf')]), 'fonts/Face.ttf': 'x', 'fonts/Other.ttf': 'x' },
      'assets/fonts/Other.ttf has no license entry.',
    ],
    ['a folder with no LICENSES.json', { 'art/pic.svg': '<svg/>' }, 'assets/art/pic.svg has no license entry.'],
    [
      'an entry that matches no file',
      { 'fonts/LICENSES.json': JSON.stringify([entry('Face.ttf'), entry('Gone.ttf')]), 'fonts/Face.ttf': 'x' },
      'assets/fonts/LICENSES.json lists "Gone.ttf", which matches no file.',
    ],
    [
      'a license outside the allowed set',
      { 'art/LICENSES.json': JSON.stringify([entry('a.svg', 'CC-BY-SA-4.0')]), 'art/a.svg': '<svg/>' },
      'assets/art/LICENSES.json lists "a.svg" under CC-BY-SA-4.0, which is not an allowed license.',
    ],
    [
      'malformed JSON',
      { 'art/LICENSES.json': '[{', 'art/a.svg': '<svg/>' },
      'assets/art/LICENSES.json is not valid JSON.',
    ],
  ])('reports %s', (_label, files, problem) => {
    expect(findLicenseProblems(assets(files))).toContain(problem);
  });

  it('reports an entry with a missing field, naming the shape it needs', () => {
    const dir = assets({
      'art/LICENSES.json': JSON.stringify([{ files: 'a.svg', source: 'x', license: 'MIT' }]),
      'art/a.svg': '',
    });
    expect(findLicenseProblems(dir)[0]).toMatch(
      /^assets\/art\/LICENSES\.json must be a list of entries with files, source, author, and license/,
    );
  });

  it('lets a parent folder license the files in its subfolders', () => {
    const dir = assets({
      'voice/LICENSES.json': JSON.stringify([entry('en/*.ogg', 'CC0-1.0')]),
      'voice/en/abc.ogg': 'x',
    });
    expect(findLicenseProblems(dir)).toEqual([]);
  });
});

describe('globToRegExp', () => {
  it.each([
    ['*.svg', 'fox.svg', true],
    ['*.svg', 'animals/fox.svg', false],
    ['**/*.svg', 'fox.svg', true],
    ['**/*.svg', 'a/b/fox.svg', true],
    ['icon-?.png', 'icon-1.png', true],
    ['icon-?.png', 'icon-12.png', false],
    ['a.b', 'axb', false],
    ['animals/**', 'animals/x/y.svg', true],
  ])('%s against %s is %s', (glob, file, expected) => {
    expect(globToRegExp(glob).test(file)).toBe(expected);
  });
});
