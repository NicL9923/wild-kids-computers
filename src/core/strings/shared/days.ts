import { defineStrings } from '../defineStrings.ts';

/** Days of the week, Monday first. */
export const strings = defineStrings('days', {
  monday: { text: 'Monday' },
  tuesday: { text: 'Tuesday' },
  wednesday: { text: 'Wednesday' },
  thursday: { text: 'Thursday' },
  friday: { text: 'Friday' },
  saturday: { text: 'Saturday' },
  sunday: { text: 'Sunday' },
});
