import os from 'node:os';
import path from 'node:path';

/**
 * The Kokoro-82M v1.0 speech model through kokoro-js, on the CPU.
 *
 * kokoro-js and its model runtime live only in tools/voice/node_modules. The imports below use a
 * variable specifier so the app's type check and dependency checks never resolve them; the small
 * interfaces here describe the part of the API the generator uses.
 */

/** Where every run on this machine caches downloaded models, so later runs reuse them. */
const MODEL_CACHE_DIR = path.join(os.homedir(), '.cache', 'wkc', 'transformers');

const MODEL_REPOSITORIES: Readonly<Record<string, string>> = {
  'kokoro-82m-v1.0': 'onnx-community/Kokoro-82M-v1.0-ONNX',
};

interface RawAudioLike {
  readonly audio: Float32Array;
  readonly sampling_rate: number;
}

interface KokoroLike {
  generate(text: string, options: { voice: string; speed: number }): Promise<RawAudioLike>;
  generate_from_ids(ids: unknown, options: { voice: string; speed: number }): Promise<RawAudioLike>;
  tokenizer(text: string, options: { truncation: boolean }): { input_ids: unknown };
}

interface KokoroModule {
  KokoroTTS: {
    from_pretrained(repository: string, options: { dtype: string; device: string }): Promise<KokoroLike>;
  };
}

interface TransformersModule {
  env: { cacheDir: string };
}

function isTransformers(value: unknown): value is TransformersModule {
  return (
    typeof value === 'object' && value !== null && 'env' in value && typeof value.env === 'object' && value.env !== null
  );
}

function isKokoro(value: unknown): value is KokoroModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'KokoroTTS' in value &&
    typeof value.KokoroTTS === 'function' &&
    'from_pretrained' in value.KokoroTTS &&
    typeof value.KokoroTTS.from_pretrained === 'function'
  );
}

export interface Synthesizer {
  /** Mono PCM samples and their rate, still starting with the lead-in. */
  synthesize(speech: string): Promise<{ samples: Float32Array; sampleRate: number }>;
}

/**
 * A speech text wrapped in slashes, such as `/bə/`, is read as Kokoro phonemes and skips the
 * text-to-phoneme step. Letter sounds use it, because a word like "buh" is spelled for a reader,
 * not for the phonemizer.
 */
export function phonemesOf(speech: string): string | undefined {
  const match = /^\/(.+)\/$/u.exec(speech.trim());
  return match?.[1];
}

/**
 * Said before every clip and cut off afterwards by cutAfterLead. See there for why. A question
 * gives the longest and steadiest pause of the leads tried: at least 210 ms in every test clip.
 */
const LEAD_IN_TEXT = 'Ready? ';
const LEAD_IN_PHONEMES = 'ɹˈɛdi? ';

export async function loadKokoro(profile: { model: string; voice: string; speed: number }): Promise<Synthesizer> {
  const repository = MODEL_REPOSITORIES[profile.model];
  if (repository === undefined) throw new Error(`No Kokoro repository for voice model "${profile.model}".`);

  const transformersName = '@huggingface/transformers';
  const kokoroName = 'kokoro-js';
  let transformers: unknown;
  let kokoro: unknown;
  try {
    transformers = await import(transformersName);
    kokoro = await import(kokoroName);
  } catch {
    throw new Error('Run `npm ci --prefix tools/voice` first. It installs the speech model runtime.');
  }
  if (!isTransformers(transformers) || !isKokoro(kokoro)) {
    throw new Error('tools/voice has a kokoro-js or transformers.js with an unexpected API.');
  }
  transformers.env.cacheDir = MODEL_CACHE_DIR;
  const { KokoroTTS } = kokoro;
  const tts = await KokoroTTS.from_pretrained(repository, { dtype: 'fp32', device: 'cpu' });
  const options = { voice: profile.voice, speed: profile.speed };

  return {
    async synthesize(speech) {
      const phonemes = phonemesOf(speech);
      const audio =
        phonemes === undefined
          ? await tts.generate(`${LEAD_IN_TEXT}${speech}`, options)
          : await tts.generate_from_ids(
              tts.tokenizer(`${LEAD_IN_PHONEMES}${phonemes}`, { truncation: true }).input_ids,
              options,
            );
      return { samples: audio.audio, sampleRate: audio.sampling_rate };
    },
  };
}
