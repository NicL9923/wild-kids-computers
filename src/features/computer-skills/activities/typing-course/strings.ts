import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('typing-course', {
  title: { text: 'Typing course' },
  goal: {
    text: 'Types with all ten fingers from the home row, getting each key right before getting fast.',
    silent: 'parent',
  },
  instruction: { text: 'Rest your fingers on the home row, then type the line.' },
  newKeys: { text: 'Type the line. New keys:' },
  and: { text: 'and' },
  newKeyShift: {
    text: 'Type the line. New key: Shift. Hold it with the little finger of your other hand for a capital letter.',
  },
  practice: { text: 'Type the line with the keys you know.' },
  holdShift: { text: 'Hold Shift with the little finger of your other hand.' },
  capsLock: { text: 'Caps Lock is on. Press Caps Lock to turn it off.' },
  lineDone: { text: 'The whole line is typed.' },
  line: { text: 'The line to type', silent: 'decorative' },
  hands: { text: 'Your hands, with the finger for the next key', silent: 'decorative' },
  finger: { text: 'Finger:', silent: 'decorative' },
  shiftKey: { text: 'Shift' },
  // Keys that are not letters.
  semicolon: { text: 'semicolon' },
  comma: { text: 'comma' },
  period: { text: 'period' },
  slash: { text: 'slash' },
  space: { text: 'space bar' },
  // Fingers.
  leftLittle: { text: 'left little finger' },
  leftRing: { text: 'left ring finger' },
  leftMiddle: { text: 'left middle finger' },
  leftPointer: { text: 'left pointer finger' },
  rightPointer: { text: 'right pointer finger' },
  rightMiddle: { text: 'right middle finger' },
  rightRing: { text: 'right ring finger' },
  rightLittle: { text: 'right little finger' },
  thumb: { text: 'thumb' },
});
