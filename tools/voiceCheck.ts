import { normalizeSpeech, VOICE_CLIP_EXTENSION, voiceClipName, type VoiceProfile } from '../src/core/strings/voice.ts';

/**
 * The logic behind `npm run check:voice` and the generator's to-do list. Pure, so every failure
 * mode has a unit test. tools/tasks/checkVoice.task.ts feeds it the real registry and folder.
 */

export interface SpokenString {
  readonly id: string;
  readonly speech: string;
}

export interface ClipPlan {
  readonly clip: string;
  readonly speech: string;
  readonly ids: readonly string[];
}

export interface VoiceProblem {
  readonly rule: 'missing-clip' | 'stale-clip' | 'hash-collision' | 'not-a-clip';
  readonly detail: string;
}

/**
 * Groups strings by the clip that says them. Two strings with the same normalized speech share a
 * clip. Two different speeches that hash to one name are a collision, reported separately.
 */
export function planClips(
  strings: readonly SpokenString[],
  profile: VoiceProfile,
  nameClip: (speech: string, profile: VoiceProfile) => string = voiceClipName,
): { clips: ClipPlan[]; collisions: VoiceProblem[] } {
  const byClip = new Map<string, { speech: string; ids: string[] }>();
  const collisions: VoiceProblem[] = [];
  for (const { id, speech } of strings) {
    const normalized = normalizeSpeech(speech);
    const clip = nameClip(normalized, profile);
    const entry = byClip.get(clip);
    if (entry === undefined) byClip.set(clip, { speech: normalized, ids: [id] });
    else if (entry.speech === normalized) entry.ids.push(id);
    else {
      collisions.push({
        rule: 'hash-collision',
        detail: `${clip} names two texts: "${entry.speech}" (${entry.ids.join(', ')}) and "${normalized}" (${id}). Change the voice profile revision.`,
      });
    }
  }
  const clips = [...byClip].map(([clip, { speech, ids }]) => ({ clip, speech, ids: ids.toSorted() }));
  return { clips: clips.toSorted((a, b) => a.clip.localeCompare(b.clip)), collisions };
}

/** Everything wrong with the clip folder for these strings. An empty result means it passes. */
export function checkVoiceClips(
  strings: readonly SpokenString[],
  files: readonly string[],
  profile: VoiceProfile,
  nameClip?: (speech: string, profile: VoiceProfile) => string,
): VoiceProblem[] {
  const { clips, collisions } = planClips(strings, profile, nameClip);
  const present = new Set(files);
  const expected = new Set(clips.map((plan) => plan.clip));
  const problems: VoiceProblem[] = [...collisions];

  for (const plan of clips) {
    if (!present.has(plan.clip)) {
      problems.push({
        rule: 'missing-clip',
        detail: `${plan.ids.join(', ')} has no clip ${plan.clip} for "${plan.speech}". Run npm run voice:generate.`,
      });
    }
  }
  for (const file of files.toSorted()) {
    if (expected.has(file)) continue;
    problems.push(
      file.endsWith(VOICE_CLIP_EXTENSION)
        ? { rule: 'stale-clip', detail: `${file} matches no spoken string. Delete it.` }
        : { rule: 'not-a-clip', detail: `${file} is not a ${VOICE_CLIP_EXTENSION} clip.` },
    );
  }
  return problems;
}
