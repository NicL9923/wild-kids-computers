import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildNotices } from './notices.ts';

let root: string;

async function put(relative: string, text: string): Promise<void> {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

const lock = (packages: Record<string, object>) =>
  JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'app' }, ...packages } });

const entry = (files: string, author: string, license = 'MIT') => ({ files, source: 'somewhere', author, license });

/** A small repository whose every shipped package and asset has its notice. */
async function completeRepository(): Promise<void> {
  await put('LICENSE', 'MIT License\n\nCopyright (c) the project');
  await put(
    'package-lock.json',
    lock({
      'node_modules/shipped': { version: '1.0.0', license: 'MIT' },
      'node_modules/shipped/node_modules/nested': { version: '2.0.0', license: 'ISC' },
      'node_modules/tooling': { version: '3.0.0', license: 'MIT', dev: true },
      'node_modules/other-os-only': { version: '1.0.0', license: 'MIT', optional: true },
    }),
  );
  await put('node_modules/shipped/LICENSE', 'Shipped license text');
  await put('node_modules/shipped/node_modules/nested/LICENSE.md', 'Nested license text');
  await put('node_modules/electron/LICENSE', 'Electron license text');
  await put(
    'assets/emoji/LICENSES.json',
    JSON.stringify([entry('*.svg', 'Someone Else'), entry('LICENSE', 'Someone Else')]),
  );
  await put('assets/emoji/LICENSE', 'Emoji license text');
  await put('assets/voice/LICENSES.json', JSON.stringify([entry('NOTICE.txt', 'Model Maker', 'Apache-2.0')]));
  await put('assets/voice/NOTICE.txt', 'Model notice text');
  await put('assets/voice/en/LICENSES.json', JSON.stringify([entry('*.ogg', 'Wild Flowers Tech')]));
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'wkc-notices-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('buildNotices', () => {
  it('collects every shipped license text, every asset credit, and the project license', async () => {
    await completeRepository();
    const { text, problems } = buildNotices(root, {});
    expect(problems).toEqual([]);
    for (const expected of [
      'shipped 1.0.0 (MIT)',
      'Shipped license text',
      'nested 2.0.0 (ISC)',
      'Nested license text',
      'Electron license text',
      'Emoji license text',
      // The notice in assets/voice/ goes with the clips in assets/voice/en/.
      'License text: the Wild Kids - Computers license at the end, assets/voice/NOTICE.txt',
      'Model notice text',
      'Copyright (c) the project',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('tooling');
  });

  it('fails a shipped package with no license text, naming it and its license', async () => {
    await completeRepository();
    await put('package-lock.json', lock({ 'node_modules/bare': { version: '1.0.0', license: 'MIT' } }));
    await put('node_modules/bare/package.json', '{}');
    expect(buildNotices(root, {}).problems).toEqual([
      { where: 'node_modules/bare', detail: 'ships no license text file and has no fallback notice (license: MIT)' },
    ]);
  });

  it('uses a fallback notice for a package with no license file, and fails a fallback nothing uses', async () => {
    await completeRepository();
    await put('package-lock.json', lock({ 'node_modules/bare': { version: '1.0.0', license: 'MIT' } }));
    await put('node_modules/bare/package.json', '{}');
    const { text, problems } = buildNotices(root, {
      bare: { license: 'MIT', holder: 'Bare Author' },
      gone: { license: 'MIT', holder: 'Nobody' },
    });
    expect(text).toContain('Copyright (c) Bare Author');
    expect(problems).toEqual([
      { where: 'tools/notices.ts', detail: 'the fallback notice for gone matches no shipped package' },
    ]);
  });

  it('refuses a fallback whose license no longer matches the package', async () => {
    await completeRepository();
    await put('package-lock.json', lock({ 'node_modules/bare': { version: '1.0.0', license: 'GPL-3.0-only' } }));
    await put('node_modules/bare/package.json', '{}');
    const { problems } = buildNotices(root, { bare: { license: 'MIT', holder: 'Bare Author' } });
    expect(problems.map((problem) => problem.where)).toEqual(['node_modules/bare', 'tools/notices.ts']);
  });

  it('fails a shipped package that is not installed, but not an optional one', async () => {
    await completeRepository();
    await put(
      'package-lock.json',
      lock({
        'node_modules/missing': { version: '1.0.0', license: 'MIT' },
        'node_modules/other-os-only': { version: '1.0.0', license: 'MIT', optional: true },
      }),
    );
    expect(buildNotices(root, {}).problems).toEqual([
      { where: 'node_modules/missing', detail: 'is not installed; run npm ci' },
    ]);
  });

  it('fails an asset by someone else whose folder holds no license text', async () => {
    await completeRepository();
    await put('assets/art/LICENSES.json', JSON.stringify([entry('*.svg', 'Another Artist', 'CC-BY-4.0')]));
    expect(buildNotices(root, {}).problems).toEqual([
      {
        where: 'assets/art/LICENSES.json "*.svg"',
        detail: 'is by Another Artist, and its folder holds no license text file to ship with it',
      },
    ]);
  });

  it('fails a manifest it cannot read', async () => {
    await completeRepository();
    await put('assets/art/LICENSES.json', '{ not json');
    expect(buildNotices(root, {}).problems).toEqual([
      { where: 'assets/art/LICENSES.json', detail: 'is not a valid license manifest; check:licenses says why' },
    ]);
  });

  it('fails when the project license is missing', async () => {
    await completeRepository();
    await rm(path.join(root, 'LICENSE'));
    expect(buildNotices(root, {}).problems).toEqual([{ where: 'LICENSE', detail: 'the project license is missing' }]);
  });
});
