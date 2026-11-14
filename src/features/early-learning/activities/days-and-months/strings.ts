import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('days-and-months', {
  title: { text: 'Days and months' },
  goal: {
    text: 'Knows the order of the days of the week and the months of the year.',
    silent: 'parent',
  },
  dayAfter: { text: 'What day comes after' },
  dayBefore: { text: 'What day comes before' },
  monthAfter: { text: 'What month comes after' },
  monthBefore: { text: 'What month comes before' },
  orderDays: { text: 'Put the days in order.' },
  orderMonths: { text: 'Put the months in order.' },
  sequence: { text: 'In order', silent: 'decorative' },
  choices: { text: 'Answers to choose from', silent: 'decorative' },
  tiles: { text: 'Names to put in order', silent: 'decorative' },
});
