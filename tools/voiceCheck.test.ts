import { describe, expect, it } from 'vitest';
import { voiceClipName, type VoiceProfile } from '../src/core/strings/voice.ts';
import { checkVoiceClips, planClips } from './voiceCheck.ts';

const profile: VoiceProfile = { model: 'kokoro-82m-v1.0', voice: 'af_test', speed: 0.9, revision: 1 };
const clip = (speech: string) => voiceClipName(speech, profile);

describe('planClips', () => {
  it('shares one clip between strings whose speech normalizes the same', () => {
    const { clips, collisions } = planClips(
      [
        { id: 'a.done', speech: 'All done.' },
        { id: 'b.done', speech: '  All   done. ' },
        { id: 'c.yes', speech: 'Yes.' },
      ],
      profile,
    );
    expect(collisions).toEqual([]);
    expect(clips).toContainEqual({ clip: clip('All done.'), speech: 'All done.', ids: ['a.done', 'b.done'] });
    expect(clips).toHaveLength(2);
  });
});

describe('checkVoiceClips', () => {
  const strings = [
    { id: 'a.done', speech: 'All done.' },
    { id: 'a.yes', speech: 'Yes.' },
  ];

  it('passes when the folder holds exactly the clips the strings need', () => {
    expect(checkVoiceClips(strings, [clip('All done.'), clip('Yes.')], profile)).toEqual([]);
  });

  it('fails a spoken string with no clip and names the string', () => {
    expect(checkVoiceClips(strings, [clip('All done.')], profile)).toEqual([
      { rule: 'missing-clip', detail: `a.yes has no clip ${clip('Yes.')} for "Yes.". Run npm run voice:generate.` },
    ]);
  });

  it('fails a stale clip that matches no string', () => {
    const stale = clip('Old text.');
    expect(checkVoiceClips(strings, [clip('All done.'), clip('Yes.'), stale], profile)).toEqual([
      { rule: 'stale-clip', detail: `${stale} matches no spoken string. Delete it.` },
    ]);
  });

  it('fails a clip whose text changed, as a missing clip plus a stale one', () => {
    const problems = checkVoiceClips([{ id: 'a.yes', speech: 'Yes!' }], [clip('Yes.')], profile);
    expect(problems.map((problem) => problem.rule)).toEqual(['missing-clip', 'stale-clip']);
  });

  it('fails a file that is not a clip', () => {
    expect(checkVoiceClips([], ['notes.txt'], profile)).toEqual([
      { rule: 'not-a-clip', detail: 'notes.txt is not a .ogg clip.' },
    ]);
  });

  it('fails two different texts that hash to one clip name', () => {
    // A real 64-bit collision is impractical to find, so a profile whose hash input ignores the
    // text stands in: every speech then maps to one name, as a collision would.
    const problems = checkVoiceClips(
      [
        { id: 'a.one', speech: 'One.' },
        { id: 'a.two', speech: 'Two.' },
      ],
      [],
      profile,
      () => 'same.ogg',
    );
    expect(problems[0]).toEqual({
      rule: 'hash-collision',
      detail: 'same.ogg names two texts: "One." (a.one) and "Two." (a.two). Change the voice profile revision.',
    });
  });
});
