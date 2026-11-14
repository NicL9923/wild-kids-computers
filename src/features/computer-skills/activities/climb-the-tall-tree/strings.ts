import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('climb-the-tall-tree', {
  title: { text: 'Climb the tall tree' },
  goal: {
    text: 'Scrolls to see more of a page: with the wheel, the trackpad, the scroll bar, or the keys.',
    silent: 'parent',
  },
  instruction: { text: 'Scroll up the tree. Find the animal in the picture.' },
  find: { text: 'Scroll and find the' },
  higher: { text: 'It is higher up. Scroll up.' },
  lower: { text: 'It is lower down. Scroll down.' },
  lookFor: { text: 'Find', silent: 'decorative' },
  tree: { text: 'The tall tree', silent: 'decorative' },
});
