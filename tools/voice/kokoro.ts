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
  generate_from_ids(ids: unknown, options: { voice: string; speed: number }): Promise<RawAudioLike>;
  tokenizer(text: string, options: { truncation: boolean }): { input_ids: unknown };
}

interface KokoroModule {
  KokoroTTS: {
    from_pretrained(repository: string, options: { dtype: string; device: string }): Promise<KokoroLike>;
  };
}

interface PhonemizerModule {
  phonemize(text: string, language: string): Promise<string[]>;
}

function isPhonemizer(value: unknown): value is PhonemizerModule {
  return typeof value === 'object' && value !== null && 'phonemize' in value && typeof value.phonemize === 'function';
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
 * Said before every clip and cut off afterwards by cutAfterLead. See there for why. Before a word,
 * a question gave the longest and steadiest pause of the leads tried: at least 210 ms in every
 * test clip. Before a bare sound, "Say." and an empty sentence gave cleaner onsets: the phoneme
 * recognizer heard f, g, v, z, and the short vowels start right after it, and not after "Ready?".
 */
const LEAD_BEFORE_WORDS = 'ɹˈɛdi? ';
const LEAD_BEFORE_SOUNDS = 'sˈeɪ. . ';

/** Turns English text into espeak-ng phonemes, one string per input. */
export type Phonemize = (text: string) => Promise<string>;

const PUNCTUATION = /((?:\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+)/u;

/**
 * Kokoro v1.0 was trained on misaki phonemes, which write each diphthong and affricate as one
 * symbol. kokoro-js passes espeak's two-symbol forms through, and the model then reads "boy" as
 * "bye" and "eighty" as "eirei". This applies the same espeak-to-misaki mapping that Kokoro's own
 * Python pipeline uses for its espeak fallback, which fixed those words in the round trip.
 */
export function toKokoroPhonemes(espeak: string): string {
  return espeak
    .replaceAll('ʲ', 'j')
    .replaceAll('r', 'ɹ')
    .replaceAll('x', 'k')
    .replaceAll('ɬ', 'l')
    .replaceAll('aɪ', 'I')
    .replaceAll('aʊ', 'W')
    .replaceAll('eɪ', 'A')
    .replaceAll('oʊ', 'O')
    .replaceAll('ɔɪ', 'Y')
    .replaceAll('dʒ', 'ʤ')
    .replaceAll('tʃ', 'ʧ')
    .replaceAll('ɐ', 'ə')
    .replaceAll('ː', '');
}

/**
 * The phonemes Kokoro reads for a speech, lead-in included. Text is phonemized piece by piece
 * with its punctuation kept, as kokoro-js does, then mapped to Kokoro's alphabet. A speech in
 * slashes is already phonemes and is used as written. A speech without end punctuation gets a
 * period: without one Kokoro clips the last sound of a short word, and a recognizer hears "bed"
 * as "bad" and "worm" as "wham". None of this changes the clip name; bump the profile revision.
 */
export async function synthesisInput(speech: string, phonemize: Phonemize): Promise<string> {
  const given = phonemesOf(speech);
  let body: string;
  if (given === undefined) {
    const pieces = speech.trim().split(PUNCTUATION);
    const converted = await Promise.all(
      pieces.map(async (piece, index) =>
        index % 2 === 1 || piece.trim() === '' ? piece : toKokoroPhonemes((await phonemize(piece)).trim()),
      ),
    );
    body = converted.join('').trim();
  } else {
    body = given.trim();
  }
  const ended = /[.!?…]$/u.test(body) ? body : `${body}.`;
  return `${given === undefined ? LEAD_BEFORE_WORDS : LEAD_BEFORE_SOUNDS}${ended}`;
}

export async function loadKokoro(profile: { model: string; voice: string; speed: number }): Promise<Synthesizer> {
  const repository = MODEL_REPOSITORIES[profile.model];
  if (repository === undefined) throw new Error(`No Kokoro repository for voice model "${profile.model}".`);

  const transformersName = '@huggingface/transformers';
  const kokoroName = 'kokoro-js';
  const phonemizerName = 'phonemizer';
  let transformers: unknown;
  let kokoro: unknown;
  let phonemizer: unknown;
  try {
    transformers = await import(transformersName);
    kokoro = await import(kokoroName);
    phonemizer = await import(phonemizerName);
  } catch {
    throw new Error('Run `npm ci --prefix tools/voice` first. It installs the speech model runtime.');
  }
  if (!isTransformers(transformers) || !isKokoro(kokoro) || !isPhonemizer(phonemizer)) {
    throw new Error('tools/voice has a kokoro-js, phonemizer, or transformers.js with an unexpected API.');
  }
  const toPhonemes: Phonemize = async (text) => (await phonemizer.phonemize(text, 'en-us')).join(' ');
  transformers.env.cacheDir = MODEL_CACHE_DIR;
  const { KokoroTTS } = kokoro;
  const tts = await KokoroTTS.from_pretrained(repository, { dtype: 'fp32', device: 'cpu' });
  const options = { voice: profile.voice, speed: profile.speed };

  return {
    async synthesize(speech) {
      const input = await synthesisInput(speech, toPhonemes);
      const audio = await tts.generate_from_ids(tts.tokenizer(input, { truncation: true }).input_ids, options);
      return { samples: audio.audio, sampleRate: audio.sampling_rate };
    },
  };
}
