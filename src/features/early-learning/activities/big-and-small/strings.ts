import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('big-and-small', {
  title: { text: 'Big and small' },
  goal: {
    text: 'Compares sizes: finds the bigger or smaller one, then puts things in order of size.',
    silent: 'parent',
  },
  bigger: { text: 'Click the bigger one.' },
  smaller: { text: 'Click the smaller one.' },
  biggest: { text: 'Click the biggest one.' },
  smallest: { text: 'Click the smallest one.' },
  smallToBig: { text: 'Click them from the smallest to the biggest.' },
  bigToSmall: { text: 'Click them from the biggest to the smallest.' },
  pictures: { text: 'Pictures to choose from', silent: 'decorative' },
  line: { text: 'In order of size', silent: 'decorative' },
});
