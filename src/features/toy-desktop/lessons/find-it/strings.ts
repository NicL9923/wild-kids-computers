import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('find-it', {
  title: { text: 'Find it' },
  goal: { text: 'Finds a file by typing its name in the search box, then opens it.', silent: 'parent' },
  instruction: { text: 'Find a file with the search box, then open it.' },
  findKitePlan: { text: 'Find the note called Kite plan. Type its name in the search box.' },
  findOwlFacts: { text: 'Find the note called Owl facts. Type its name in the search box.' },
  findCakeRecipe: { text: 'Find the note called Cake recipe. Type its name in the search box.' },
  findFrogSong: { text: 'Find the tune called Frog song. Type its name in the search box.' },
  findMoonDance: { text: 'Find the tune called Moon dance. Type its name in the search box.' },
  findBoatTrip: { text: 'Find the picture called Boat trip. Type its name in the search box.' },
  findRedTractor: { text: 'Find the picture called Red tractor. Type its name in the search box.' },
  findFoxDen: { text: 'Find the picture called Fox den. Type its name in the search box.' },
  openIt: { text: 'There it is. Click it to open it.' },
});
