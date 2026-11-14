import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KeyedQueue, writeFileAtomic } from './atomicWrite.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'wkc-atomic-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('creates missing directories and replaces the file', async () => {
    const file = path.join(dir, 'a', 'b', 'doc.json');
    await writeFileAtomic(file, 'one');
    await writeFileAtomic(file, 'two');
    expect(await readFile(file, 'utf8')).toBe('two');
    expect(await readdir(path.dirname(file))).toEqual(['doc.json']);
  });

  it('removes its temporary file when the rename fails, and leaves the target as it was', async () => {
    const target = path.join(dir, 'taken');
    await mkdir(path.join(target, 'child'), { recursive: true });
    await expect(writeFileAtomic(target, 'x')).rejects.toThrow(/EISDIR|EPERM|EEXIST|ENOTEMPTY/);
    expect(await readdir(dir)).toEqual(['taken']);
    expect(await readdir(target)).toEqual(['child']);
  });
});

describe('KeyedQueue', () => {
  it('runs operations on one key in call order, and other keys alongside', async () => {
    const queue = new KeyedQueue();
    const events: string[] = [];
    const gate = Promise.withResolvers<void>();
    const first = queue.run('a', async () => {
      events.push('a1 start');
      await gate.promise;
      events.push('a1 end');
    });
    const second = queue.run('a', async () => void events.push('a2'));
    const other = queue.run('b', async () => void events.push('b1'));
    await other;
    expect(events).toEqual(['a1 start', 'b1']);
    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['a1 start', 'b1', 'a1 end', 'a2']);
  });

  it('runs the next operation after one fails, and the caller still sees the failure', async () => {
    const queue = new KeyedQueue();
    const failing = queue.run('a', async () => {
      throw new Error('disk full');
    });
    const next = queue.run('a', async () => 'ran');
    await expect(failing).rejects.toThrow('disk full');
    expect(await next).toBe('ran');
  });
});
