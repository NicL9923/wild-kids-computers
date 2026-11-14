import { existsSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { VOICE_PROFILE } from '../../src/core/strings/voice.ts';
import { spokenStrings } from '../../src/registry/strings.ts';
import { CLIP_DIR } from '../voice/spokenList.ts';
import { checkVoiceClips } from '../voiceCheck.ts';

// `npm run check:voice`: every spoken string has a clip, every clip belongs to a string, and no
// two texts share a clip name. tools/voiceCheck.test.ts proves each failure.
it('has exactly one clip for every spoken string', () => {
  const files = existsSync(CLIP_DIR) ? readdirSync(CLIP_DIR).filter((file) => file !== 'LICENSES.json') : [];
  const problems = checkVoiceClips(spokenStrings, files, VOICE_PROFILE);
  expect(problems.map((problem) => `[${problem.rule}] ${problem.detail}`)).toEqual([]);
});
