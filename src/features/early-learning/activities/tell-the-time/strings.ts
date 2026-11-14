import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('tell-the-time', {
  title: { text: 'Tell the time' },
  goal: { text: 'Reads the time on a clock with hands, and sets the hands to a time.', silent: 'parent' },
  whatTime: { text: 'What time does the clock show?' },
  setTo: { text: 'Turn the hands to show' },
  setShown: { text: 'Turn the hands to show this time.', silent: 'decorative' },
  oclock: { text: "o'clock", speech: 'oh clock' },
  halfPast: { text: 'half past' },
  quarterPast: { text: 'quarter past' },
  quarterTo: { text: 'quarter to' },
  oh: { text: 'oh' },
  hourBack: { text: 'Hour hand back' },
  hourForward: { text: 'Hour hand forward' },
  minuteBack: { text: 'Minute hand back' },
  minuteForward: { text: 'Minute hand forward' },
  check: { text: 'This is the time' },
  times: { text: 'Times to choose from', silent: 'decorative' },
});
