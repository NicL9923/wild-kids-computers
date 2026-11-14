import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('sliders-and-dials', {
  title: { text: 'Sliders and dials' },
  goal: { text: 'Drags a slider or turns a dial to an exact spot.', silent: 'parent' },
  instruction: { text: 'Slide or turn each one until it reaches its flag.' },
  lookForFlag: { text: 'Look for the flag. Stop right at it.' },
  slider: { text: 'Slider', silent: 'decorative' },
  dial: { text: 'Dial', silent: 'decorative' },
});
