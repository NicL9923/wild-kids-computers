import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('two-buttons', {
  title: { text: 'Two buttons' },
  goal: { text: 'Clicks with the right mouse button, and tells it from a left click.', silent: 'parent' },
  instruction: { text: 'Each thing shows a mouse. Click it with the button that is lit.' },
  trackpad: { text: 'On a trackpad, tap with two fingers to right-click.' },
  useLeft: { text: 'Use the left button.' },
  useRight: { text: 'Use the right button. On a trackpad, tap with two fingers.' },
  left: { text: 'Left', silent: 'decorative' },
  right: { text: 'Right', silent: 'decorative' },
});
