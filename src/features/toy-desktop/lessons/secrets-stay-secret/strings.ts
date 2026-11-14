import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('secrets-stay-secret', {
  title: { text: 'Secrets stay secret' },
  goal: {
    text: 'Keeps private things private: makes a long, mixed toy password, and sorts private facts from ones that are fine to share.',
    silent: 'parent',
  },
  instruction: {
    text: 'Make a pretend password. Never put a real password here. Click the pieces to make it long and strong.',
  },
  sort: {
    text: 'Now sort the cards. Private things go in the locked box. Things that are fine to share go in the open box.',
  },
  password: { text: 'Pretend password' },
  pieces: { text: 'Pieces' },
  takeOff: { text: 'Take off the last piece' },
  strength: { text: 'How strong it is' },
  empty: { text: 'Nothing yet', silent: 'decorative' },
  weak: { text: 'Weak. Add more pieces.' },
  okay: { text: 'Okay. Longer is stronger.' },
  strong: { text: 'Strong. Long and mixed.' },
  keepPrivate: { text: 'Keep private' },
  fineToShare: { text: 'Fine to share' },
  cards: { text: 'Cards to sort' },
  isPrivate: { text: 'That one is private. It goes in the locked box.' },
  isFine: { text: 'That one is fine to share. It goes in the open box.' },
  homeAddress: { text: 'Your home address' },
  fullNameBirthday: { text: 'Your full name and birthday' },
  phoneNumber: { text: 'Your phone number' },
  yourPassword: { text: 'Your password' },
  favoriteColor: { text: 'Your favorite color' },
  favoriteAnimal: { text: 'Your favorite animal' },
  favoriteFood: { text: 'Your favorite food' },
  favoriteSong: { text: 'Your favorite song' },
});
