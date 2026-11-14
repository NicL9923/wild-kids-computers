import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('toy-desktop-free-play', {
  title: { text: 'Toy computer' },
  goal: {
    text: 'Explores windows, menus, files, and small apps on a pretend computer, with no goal to reach.',
    silent: 'parent',
  },
  instruction: { text: 'This is a toy computer. Click a picture on its screen to open it.' },
});
