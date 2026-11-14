import { describe, expect, it } from 'vitest';
import { fnv1a64, normalizeSpeech, VOICE_PROFILE, voiceClipName, type VoiceProfile } from './voice.ts';

describe('fnv1a64', () => {
  // Published FNV-1a 64-bit test vectors. A wrong prime, offset, mask, or byte order breaks them.
  it.each([
    ['', 'cbf29ce484222325'],
    ['a', 'af63dc4c8601ec8c'],
    ['foobar', '85944171f73967e8'],
  ])('hashes %j to the published value', (input, expected) => {
    expect(fnv1a64(input)).toBe(expected);
  });

  it('hashes the UTF-8 bytes, so a non-ASCII text differs from its look-alike', () => {
    expect(fnv1a64('café')).not.toBe(fnv1a64('cafe'));
    expect(fnv1a64('café')).toHaveLength(16);
  });
});

describe('normalizeSpeech', () => {
  it.each([
    ['collapses runs of whitespace and trims', '  Find\tthe \n letter.  ', 'Find the letter.'],
    ['straightens curly single quotes', 'That’s it.', "That's it."],
    ['straightens curly double quotes', '“Hi”', '"Hi"'],
    ['composes to NFC', 'café', 'café'],
  ])('%s', (_label, input, expected) => {
    expect(normalizeSpeech(input)).toBe(expected);
  });
});

describe('voiceClipName', () => {
  // Computed independently in Python. Pinned so a change to the hash input, such as the profile key or separator, is a visible
  // decision: it renames every committed clip.
  it('pins the clip name for a known text and the current profile', () => {
    expect(voiceClipName('You did it.')).toBe(voiceClipName('You did it.', VOICE_PROFILE));
    expect(voiceClipName('You did it.', TEST_PROFILE)).toBe('28fc02dd7e11a311.ogg');
  });

  it('gives texts that differ only by normalization the same clip', () => {
    expect(voiceClipName('That’s  it.\n')).toBe(voiceClipName("That's it."));
  });

  it('gives a different clip for different text', () => {
    expect(voiceClipName('Try another one.')).not.toBe(voiceClipName('Try another one!'));
  });

  it.each([
    ['model', { model: 'other-model' }],
    ['voice', { voice: 'other_voice' }],
    ['speed', { speed: 1 }],
    ['revision', { revision: 99 }],
  ])('renames every clip when the profile %s changes', (_field, change) => {
    expect(voiceClipName('All done.', { ...TEST_PROFILE, ...change })).not.toBe(
      voiceClipName('All done.', TEST_PROFILE),
    );
  });
});

const TEST_PROFILE: VoiceProfile = { model: 'kokoro-82m-v1.0', voice: 'af_test', speed: 0.9, revision: 1 };
