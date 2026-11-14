import { defineStrings } from '../defineStrings.ts';

/**
 * Letter names, a to z. The text is the lower-case letter. The speech is the capital letter, which
 * the voice model reads as the letter name ("bee"), the way a teacher names it.
 */
export const strings = defineStrings('letter-names', {
  a: { text: 'a', speech: 'A.' },
  b: { text: 'b', speech: 'B.' },
  c: { text: 'c', speech: 'C.' },
  d: { text: 'd', speech: 'D.' },
  e: { text: 'e', speech: 'E.' },
  f: { text: 'f', speech: 'F.' },
  g: { text: 'g', speech: 'G.' },
  h: { text: 'h', speech: 'H.' },
  i: { text: 'i', speech: 'I.' },
  j: { text: 'j', speech: 'J.' },
  k: { text: 'k', speech: 'K.' },
  l: { text: 'l', speech: 'L.' },
  m: { text: 'm', speech: 'M.' },
  n: { text: 'n', speech: 'N.' },
  o: { text: 'o', speech: 'O.' },
  p: { text: 'p', speech: 'P.' },
  q: { text: 'q', speech: 'Q.' },
  r: { text: 'r', speech: 'R.' },
  s: { text: 's', speech: 'S.' },
  t: { text: 't', speech: 'T.' },
  u: { text: 'u', speech: 'U.' },
  v: { text: 'v', speech: 'V.' },
  w: { text: 'w', speech: 'W.' },
  x: { text: 'x', speech: 'X.' },
  y: { text: 'y', speech: 'Y.' },
  z: { text: 'z', speech: 'Z.' },
});
