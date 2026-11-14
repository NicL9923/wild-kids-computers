import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { letterNames } from '../../../../core/strings/shared/index.ts';
import { isLetter } from '../../shared/keyboardLayout.ts';
import type { ShiftItem, ShiftWord } from './level.ts';
import { strings } from './strings.ts';

/** What the voice says for each sign. */
const SIGN_NAMES: Readonly<Record<string, SpokenHandle>> = {
  '!': strings.exclamation,
  '@': strings.at,
  '#': strings.hash,
  $: strings.dollar,
  '%': strings.percent,
  '&': strings.and,
  '*': strings.asterisk,
  '(': strings.openBracket,
  ')': strings.closeBracket,
  '?': strings.question,
  ':': strings.colon,
  '"': strings.quote,
  '+': strings.plusSign,
  _: strings.underscore,
  '<': strings.lessThan,
  '>': strings.greaterThan,
};

const WORD_NAMES: Readonly<Record<ShiftWord, SpokenHandle>> = {
  'Hi!': strings.hi,
  'Go!': strings.go,
  'OK?': strings.ok,
  'Yes!': strings.yes,
  'Who?': strings.who,
  'Up!': strings.up,
  'Me?': strings.me,
  'No!': strings.no,
};

function isShiftWord(text: string): text is ShiftWord {
  return Object.hasOwn(WORD_NAMES, text);
}

/** How the voice names one character: "capital" and the letter, a small letter, or a sign. */
export function charSpeech(char: string): SpokenHandle[] {
  const lower = char.toLowerCase();
  if (isLetter(lower)) return char === lower ? [letterNames[lower]] : [strings.capital, letterNames[lower]];
  const sign = SIGN_NAMES[char];
  if (sign === undefined) throw new RangeError(`Big letters has no name for "${char}".`);
  return [sign];
}

/** How the voice names an item: the word as a word, otherwise its one character. */
export function itemSpeech(item: Pick<ShiftItem, 'kind' | 'text'>): SpokenHandle[] {
  if (item.kind !== 'word') return charSpeech(item.text);
  if (!isShiftWord(item.text)) throw new RangeError(`Big letters has no word "${item.text}".`);
  return [WORD_NAMES[item.text]];
}
