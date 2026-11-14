import { describe, expect, it } from 'vitest';
import { SAMPLE_PICTURE_IDS } from '../model/sampleContent.ts';
import { buildDesktop, note, picture, tune } from '../model/build.ts';
import { nodeAtPath, TRASH_ID } from '../model/fileSystem.ts';
import { nodePicture, pictureSource, rejectionSentence } from './labels.ts';
import { strings } from './strings.ts';

describe('pictureSource', () => {
  it('maps every sample picture to bundled art', () => {
    for (const id of SAMPLE_PICTURE_IDS) expect(pictureSource(id).kind).toBe('emoji');
  });

  it('reads a gallery painting id after its prefix', () => {
    expect(pictureSource('g-1234abcd')).toEqual({ kind: 'gallery', pictureId: '1234abcd' });
  });

  it('calls an id with no art missing instead of breaking', () => {
    expect(pictureSource('unicorn-party')).toEqual({ kind: 'missing' });
  });
});

describe('rejectionSentence', () => {
  it.each([
    ['empty', strings.nameEmpty],
    ['too-long', strings.nameTooLong],
    ['bad-character', strings.nameMark],
    ['only-dots', strings.nameOnlyDots],
    ['duplicate', strings.nameTaken],
    ['full', strings.computerFull],
    ['too-many-windows', strings.tooManyWindows],
    ['into-itself', strings.cannotHere],
  ] as const)('says something gentle for %s', (reason, sentence) => {
    expect(rejectionSentence(reason)).toBe(sentence);
  });

  it('says nothing for a command shown as unavailable or a move that just goes back', () => {
    expect(rejectionSentence('command-disabled')).toBeNull();
    expect(rejectionSentence('minimized')).toBeNull();
  });
});

describe('nodePicture', () => {
  const state = buildDesktop({
    files: { Fox: picture('fox'), List: note('milk'), Song: tune(), Odd: picture('unknown-id'), Box: {} },
  });
  it.each([
    ['Fox', 'fox'],
    ['List', 'note'],
    ['Song', 'music-note'],
    ['Odd', 'picture'],
    ['Box', 'folder'],
  ])('shows %s as %s', (path, emoji) => {
    const node = nodeAtPath(state.fs, path);
    if (node === undefined) throw new Error(`no ${path}`);
    expect(nodePicture(node)).toBe(emoji);
  });

  it('shows the trash as a trash can', () => {
    const trash = state.fs.nodes[TRASH_ID];
    if (trash === undefined) throw new Error('no trash');
    expect(nodePicture(trash)).toBe('trash-can');
  });
});
