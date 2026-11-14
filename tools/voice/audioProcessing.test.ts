import { describe, expect, it } from 'vitest';
import {
  cutAfterLead,
  DEFAULT_LEAD_CUT,
  DEFAULT_PROCESS_OPTIONS,
  dbToGain,
  fadeEdges,
  findPauses,
  normalizeLoudness,
  processSpeech,
  trimSilence,
  voicedRms,
} from './audioProcessing.ts';
import { phonemesOf, synthesisInput, toKokoroPhonemes } from './kokoro.ts';

const RATE = 1000;
const options = { ...DEFAULT_PROCESS_OPTIONS, sampleRate: RATE, padStartMs: 10, padEndMs: 20, fadeMs: 5 };

/** `ms` of a square wave at `level`, or of silence at level 0. */
function segment(ms: number, level: number): number[] {
  // Silence is +0 throughout; a square wave of level 0 would alternate with -0.
  return Array.from({ length: ms }, (_, index) => (level === 0 || index % 2 === 0 ? level : -level));
}

const samples = (...parts: number[][]) => Float32Array.from(parts.flat());

describe('trimSilence', () => {
  it('keeps the loud part plus the start and end pads', () => {
    const trimmed = trimSilence(samples(segment(100, 0), segment(50, 0.5), segment(100, 0)), options);
    expect(trimmed.length).toBe(10 + 50 + 20);
    expect(trimmed[10]).toBe(0.5);
  });

  it('never pads past the ends of the clip', () => {
    expect(trimSilence(samples(segment(30, 0.5)), options).length).toBe(30);
  });

  it('treats a sound below the threshold as silence', () => {
    const whisper = dbToGain(DEFAULT_PROCESS_OPTIONS.silenceThresholdDb) * 0.9;
    expect(trimSilence(samples(segment(50, whisper)), options).length).toBe(0);
  });
});

describe('normalizeLoudness', () => {
  it('brings quiet and loud speech to the same voiced level', () => {
    const quiet = normalizeLoudness(samples(segment(200, 0.02)), { ...options, peakCeilingDb: 0 });
    const loud = normalizeLoudness(samples(segment(200, 0.6)), { ...options, peakCeilingDb: 0 });
    expect(voicedRms(quiet, RATE)).toBeCloseTo(dbToGain(options.targetRmsDb), 6);
    expect(voicedRms(loud, RATE)).toBeCloseTo(dbToGain(options.targetRmsDb), 6);
  });

  it('measures only the voiced part, so pauses do not make a clip louder', () => {
    const withPause = samples(segment(100, 0.1), segment(300, 0), segment(100, 0.1));
    expect(voicedRms(withPause, RATE)).toBeCloseTo(0.1, 6);
  });

  it('stops short of the peak ceiling on a spiky clip', () => {
    const body = segment(200, 0.05);
    body[100] = 0.9;
    const spiky = samples(body);
    const out = normalizeLoudness(spiky, options);
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(dbToGain(options.peakCeilingDb), 6);
  });

  it('leaves silence silent', () => {
    expect([...normalizeLoudness(samples(segment(10, 0)), options)]).toEqual(Array.from({ length: 10 }, () => 0));
  });
});

describe('fadeEdges', () => {
  it('starts and ends at zero and leaves the middle alone', () => {
    const out = fadeEdges(samples(segment(40, 0.5)), options);
    expect(out[0]).toBe(0);
    expect(out[39]).toBeCloseTo(0, 6);
    expect(out[20]).toBe(0.5);
  });
});

describe('processSpeech', () => {
  it('fails on a clip with no sound', () => {
    expect(() => processSpeech(samples(segment(100, 0)), options)).toThrow(/returned silence/);
  });
});

describe('cutAfterLead', () => {
  const lead = { ...DEFAULT_LEAD_CUT, sampleRate: RATE };

  it('keeps what follows the pause after the lead-in, with a short run-up', () => {
    const clip = samples(segment(700, 0.5), segment(200, 0), segment(300, 0.4));
    const out = cutAfterLead(clip, lead);
    expect(out.length).toBe(300 + lead.keepBeforeMs);
    expect(out.at(-1)).toBeCloseTo(-0.4, 6);
  });

  it('ignores a gap before the window or too short to be the break, such as a stop consonant', () => {
    const clip = samples(
      segment(300, 0.5),
      segment(60, 0),
      segment(300, 0.5),
      segment(20, 0),
      segment(100, 0.5),
      segment(200, 0),
      segment(100, 0.4),
    );
    expect(cutAfterLead(clip, lead).length).toBe(100 + lead.keepBeforeMs);
  });

  it('cuts at the earliest pause even when a longer pause between words follows it', () => {
    // The break after "Ready?" is 200 ms; the 300 ms pause between two later words must not win.
    const clip = samples(segment(800, 0.5), segment(200, 0), segment(250, 0.4), segment(300, 0), segment(250, 0.3));
    expect(cutAfterLead(clip, lead).length).toBe(250 + 300 + 250 + lead.keepBeforeMs);
  });

  it('takes a break shorter than 120 ms when only shorter gaps follow it', () => {
    // As in "What number comes next? Click it.": a 110 ms break, then a 30 ms stop closure.
    const clip = samples(segment(860, 0.5), segment(110, 0), segment(270, 0.4), segment(30, 0), segment(300, 0.3));
    expect(cutAfterLead(clip, lead).length).toBe(270 + 30 + 300 + lead.keepBeforeMs);
  });

  it.each([
    ['there is no pause at all', samples(segment(1500, 0.5))],
    ['the pause comes too early', samples(segment(100, 0.5), segment(300, 0), segment(500, 0.5))],
    ['the pause comes too late', samples(segment(2000, 0.5), segment(300, 0), segment(300, 0.5))],
  ])('refuses to write a clip when %s', (_label, clip) => {
    expect(() => cutAfterLead(clip, lead)).toThrow(/No pause of 30 ms or more starts between 400 and 1600 ms/);
  });

  it('refuses a short first pause with a pause as long after it, rather than guess and lose a word', () => {
    // A 90 ms break after the lead-in, then a 150 ms pause after the first word. Trying 120 ms
    // first used to cut at the second pause and drop the first word without a sound.
    const clip = samples(segment(800, 0.5), segment(90, 0), segment(300, 0.4), segment(150, 0), segment(300, 0.3));
    expect(() => cutAfterLead(clip, lead)).toThrow(
      /ambiguous: the first one, at 800 ms, lasts only 90 ms, and one of 150 ms follows at 1190 ms/,
    );
  });
});

describe('findPauses', () => {
  it('lists each quiet stretch between sounds, but not the silence before the first or after the last', () => {
    const clip = samples(segment(50, 0), segment(100, 0.5), segment(40, 0), segment(100, 0.5), segment(80, 0));
    expect(findPauses(clip, { sampleRate: RATE, silenceThresholdDb: -40 })).toEqual([
      { startMs: 150, lengthMs: 40, resumeAt: 190 },
    ]);
  });
});

describe('phonemesOf', () => {
  it.each([
    ['/bə/', 'bə'],
    [' /mːː/ ', 'mːː'],
    ['buh', undefined],
    ['/', undefined],
    ['a/b/', undefined],
  ])('reads %j as %j', (speech, expected) => {
    expect(phonemesOf(speech)).toBe(expected);
  });
});

describe('toKokoroPhonemes', () => {
  it.each([
    ['bˈɔɪ', 'bˈY'],
    ['tʃˈɛɹ', 'ʧˈɛɹ'],
    ['ˈeɪɾi', 'ˈAɾi'],
    ['hˈɪpoʊ', 'hˈɪpO'],
    ['mˈaʊθ', 'mˈWθ'],
    ['ˈaɪs', 'ˈIs'],
    ['dʒˈuːs', 'ʤˈus'],
    ['ɐbˈaʊt', 'əbˈWt'],
    ['ɡrˈiːn', 'ɡɹˈin'],
    ['ʃˈɜːt', 'ʃˈɜɹt'],
    ['bˈɜːɹd', 'bˈɜɹd'],
  ])('maps %j to %j', (espeak, kokoro) => {
    expect(toKokoroPhonemes(espeak)).toBe(kokoro);
  });
});

describe('synthesisInput', () => {
  // A fake of the espeak phonemizer, the external system. It knows only the words these cases use.
  const espeak: Record<string, string> = {
    bed: 'bˈɛd',
    'All done': 'ˈɔːl dˈʌn',
    Yes: 'jˈɛs',
    'Find the boy': 'fˈaɪnd ðə bˈɔɪ',
  };
  const phonemize = (text: string) => {
    const phonemes = espeak[text];
    if (phonemes === undefined) throw new Error(`The fake phonemizer was not given "${text}".`);
    return Promise.resolve(phonemes);
  };

  it.each([
    ['bed', 'ɹˈɛdi? bˈɛd.'],
    ['All done.', 'ɹˈɛdi? ˈɔl dˈʌn.'],
    ['Yes!', 'ɹˈɛdi? jˈɛs!'],
    ['Find the boy, Yes?', 'ɹˈɛdi? fˈInd ðə bˈY, jˈɛs?'],
    ['/mːː/', 'sˈeɪ. . mːː.'],
  ])('reads %j after the lead-in, in Kokoro phonemes, with end punctuation', async (speech, expected) => {
    await expect(synthesisInput(speech, phonemize)).resolves.toBe(expected);
  });
});
