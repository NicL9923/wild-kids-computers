/**
 * Voice clip naming. The generator and the runtime share `voiceClipName`, so a clip file name is
 * a pure function of the voice profile and the spoken text. A changed string has no clip until
 * someone generates one, and two strings with the same speech share one clip.
 */

export interface VoiceProfile {
  /** The speech model and its version. */
  readonly model: string;
  /** The model's voice id. */
  readonly voice: string;
  /** Speaking rate, where 1 is the model's normal pace. */
  readonly speed: number;
  /**
   * Bump to regenerate every clip after a change to post-processing, such as trimming or
   * loudness, that the other fields do not capture.
   */
  readonly revision: number;
}

/**
 * The one voice the app speaks with. Changing any field renames every clip, which forces a full
 * regeneration. docs/decisions.md records why this voice and speed.
 */
export const VOICE_PROFILE: VoiceProfile = Object.freeze({
  model: 'kokoro-82m-v1.0',
  voice: 'af_bella',
  speed: 0.9,
  revision: 1,
});

export const VOICE_CLIP_EXTENSION = '.ogg';

/**
 * The canonical form of spoken text: Unicode NFC, curly quotes made straight, every run of
 * whitespace collapsed to one space, and no leading or trailing space. Two texts that differ only
 * in these ways sound the same and share a clip.
 */
export function normalizeSpeech(text: string): string {
  return text
    .normalize('NFC')
    .replaceAll(/[‘’‚‛′ʼ]/g, "'")
    .replaceAll(/[“”„‟″]/g, '"')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** 64-bit FNV-1a over the UTF-8 bytes of `text`, as 16 lower-case hex digits. */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET_64;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

function profileKey(profile: VoiceProfile): string {
  return `${profile.model}|${profile.voice}|${String(profile.speed)}|${String(profile.revision)}`;
}

/** The file name, such as `3f2a9c0d1b7e4a56.ogg`, of the clip that says `speech`. */
export function voiceClipName(speech: string, profile: VoiceProfile = VOICE_PROFILE): string {
  return `${fnv1a64(`${profileKey(profile)}\n${normalizeSpeech(speech)}`)}${VOICE_CLIP_EXTENSION}`;
}
