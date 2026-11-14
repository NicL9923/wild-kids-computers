import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('knock-knock', {
  title: { text: 'Knock knock' },
  goal: { text: 'Double-clicks: two quick clicks in the same place.', silent: 'parent' },
  instruction: { text: 'Click a door two times, quickly, to open it.' },
  twoQuick: { text: 'One click knocks. Click two times, quickly, to open the door.' },
  door: { text: 'Door' },
});
