import { defineStrings } from '../defineStrings.ts';

/**
 * Letter sounds, a to z: the sound a letter makes at the start of a simple word, not its name.
 *
 * Each speech is Kokoro phonemes between slashes. Spelled as text, "mmm" reaches the model as
 * "em em em". Stop sounds carry a short, light vowel ("buh"), because the model cannot release a
 * stop on its own. Sounds that can be held ("mmm", "sss") are held. Vowels are the short sound,
 * as in apple, egg, itch, octopus, up. C and k share the hard sound; c says "kuh" as in cat.
 * The round trip in docs/voice-round-trip.md checks each one.
 */
export const strings = defineStrings('letter-sounds', {
  a: { text: 'a', speech: '/ˈæ/' },
  b: { text: 'b', speech: '/bə/' },
  c: { text: 'c', speech: '/kə/' },
  d: { text: 'd', speech: '/də/' },
  e: { text: 'e', speech: '/ˈɛ/' },
  f: { text: 'f', speech: '/fːː/' },
  g: { text: 'g', speech: '/ɡə/' },
  h: { text: 'h', speech: '/hə/' },
  i: { text: 'i', speech: '/ˈɪ/' },
  j: { text: 'j', speech: '/dʒə/' },
  k: { text: 'k', speech: '/kə/' },
  l: { text: 'l', speech: '/lːː/' },
  m: { text: 'm', speech: '/mːː/' },
  n: { text: 'n', speech: '/nːː/' },
  o: { text: 'o', speech: '/ˈɑ/' },
  p: { text: 'p', speech: '/pə/' },
  q: { text: 'q', speech: '/kwə/' },
  r: { text: 'r', speech: '/ɹːː/' },
  s: { text: 's', speech: '/sːː/' },
  t: { text: 't', speech: '/tə/' },
  u: { text: 'u', speech: '/ˈʌ/' },
  v: { text: 'v', speech: '/vːː/' },
  w: { text: 'w', speech: '/wə/' },
  x: { text: 'x', speech: '/ks/' },
  y: { text: 'y', speech: '/jə/' },
  z: { text: 'z', speech: '/zːː/' },
});
