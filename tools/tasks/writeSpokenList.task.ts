import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { VOICE_PROFILE } from '../../src/core/strings/voice.ts';
import { spokenStrings } from '../../src/registry/strings.ts';
import { SPOKEN_LIST_PATH, type SpokenList } from '../voice/spokenList.ts';
import { planClips } from '../voiceCheck.ts';

// Run by `npm run voice:generate` before the generator. Writes every spoken string, grouped by
// clip, for tools/voice/generate.ts to read with plain Node.
it('writes the spoken string list for the voice generator', () => {
  const { clips, collisions } = planClips(spokenStrings, VOICE_PROFILE);
  expect(collisions).toEqual([]);
  const textById = new Map(spokenStrings.map((handle) => [handle.id, handle.text]));
  const list: SpokenList = {
    profile: VOICE_PROFILE,
    clips: clips.map((plan) => {
      const firstId = plan.ids[0];
      const text = firstId === undefined ? undefined : textById.get(firstId);
      return { ...plan, ids: [...plan.ids], ...(text === undefined ? {} : { text }) };
    }),
  };
  mkdirSync(path.dirname(SPOKEN_LIST_PATH), { recursive: true });
  writeFileSync(SPOKEN_LIST_PATH, `${JSON.stringify(list, null, 2)}\n`);
  console.log(`Wrote ${String(clips.length)} clips for ${String(spokenStrings.length)} spoken strings.`);
});
