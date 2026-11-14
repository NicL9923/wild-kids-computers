import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Short sentences to build from word tiles, three to six words each, with a picture of what the
 * sentence says. Plain words a young reader meets often, one clause, a capital at the start and a
 * period at the end. The id names the sentence's string.
 */
export interface Sentence {
  readonly id: string;
  readonly picture: EmojiId;
  readonly text: string;
}

export const SENTENCES = [
  // Three words
  { id: 'dogs-can-run', picture: 'dog', text: 'Dogs can run.' },
  { id: 'fish-can-swim', picture: 'fish', text: 'Fish can swim.' },
  { id: 'birds-can-fly', picture: 'bird', text: 'Birds can fly.' },
  { id: 'frogs-can-jump', picture: 'frog', text: 'Frogs can jump.' },
  { id: 'i-like-apples', picture: 'apple', text: 'I like apples.' },
  { id: 'we-love-pizza', picture: 'pizza', text: 'We love pizza.' },
  { id: 'cats-like-milk', picture: 'milk', text: 'Cats like milk.' },
  // Four words
  { id: 'the-sun-is-hot', picture: 'sun', text: 'The sun is hot.' },
  { id: 'i-see-a-bee', picture: 'bee', text: 'I see a bee.' },
  { id: 'the-snow-is-cold', picture: 'snowflake', text: 'The snow is cold.' },
  { id: 'a-duck-can-swim', picture: 'duck', text: 'A duck can swim.' },
  { id: 'look-at-the-rainbow', picture: 'rainbow', text: 'Look at the rainbow.' },
  { id: 'i-brush-my-teeth', picture: 'toothbrush', text: 'I brush my teeth.' },
  { id: 'the-rocket-goes-up', picture: 'rocket', text: 'The rocket goes up.' },
  { id: 'the-bee-makes-honey', picture: 'honey', text: 'The bee makes honey.' },
  // Five words
  { id: 'i-like-to-read-books', picture: 'books', text: 'I like to read books.' },
  { id: 'the-bus-goes-to-school', picture: 'bus', text: 'The bus goes to school.' },
  { id: 'we-play-in-the-park', picture: 'park', text: 'We play in the park.' },
  { id: 'my-dog-likes-to-dig', picture: 'bone', text: 'My dog likes to dig.' },
  { id: 'i-wear-a-warm-coat', picture: 'coat', text: 'I wear a warm coat.' },
  { id: 'a-snail-is-very-slow', picture: 'snail', text: 'A snail is very slow.' },
  { id: 'i-can-ride-my-bike', picture: 'bike', text: 'I can ride my bike.' },
  { id: 'the-owl-sleeps-all-day', picture: 'owl', text: 'The owl sleeps all day.' },
  { id: 'we-made-a-big-snowman', picture: 'snowman', text: 'We made a big snowman.' },
  // Six words
  { id: 'the-frog-sits-on-a-log', picture: 'frog', text: 'The frog sits on a log.' },
  { id: 'the-fish-swims-in-the-sea', picture: 'tropical-fish', text: 'The fish swims in the sea.' },
  { id: 'the-moon-comes-out-at-night', picture: 'moon', text: 'The moon comes out at night.' },
  { id: 'the-cat-naps-on-the-bed', picture: 'cat', text: 'The cat naps on the bed.' },
  { id: 'i-put-on-my-rain-boots', picture: 'rain-boot', text: 'I put on my rain boots.' },
  { id: 'the-bird-sings-in-the-tree', picture: 'bird', text: 'The bird sings in the tree.' },
  { id: 'we-plant-seeds-in-the-garden', picture: 'seedling', text: 'We plant seeds in the garden.' },
] as const satisfies readonly Sentence[];

export type SentenceId = (typeof SENTENCES)[number]['id'];

/** The sentence's words without the period, as the tiles show them. */
export function wordsOf(sentence: Sentence): string[] {
  return sentence.text.replace(/\.$/, '').split(' ');
}
