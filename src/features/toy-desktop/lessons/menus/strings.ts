import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('menus', {
  title: { text: 'Menus' },
  goal: { text: 'Opens a menu in the menu bar and chooses the command it names.', silent: 'parent' },
  instruction: { text: 'Find the command you hear in a menu, and click it.' },
  inMenu: { text: 'Open the menu' },
  choose: { text: 'and choose' },
  findCommand: { text: 'Find this in a menu and click it:' },
  nowInMenu: { text: 'Now open the menu' },
  nowFind: { text: 'Now find this in a menu:' },
  otherCommand: { text: 'That did something else. Look for the name you heard.' },
});
