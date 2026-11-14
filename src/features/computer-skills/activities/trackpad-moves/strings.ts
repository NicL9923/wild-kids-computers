import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('trackpad-moves', {
  title: { text: 'Trackpad moves' },
  goal: { text: 'Scrolls with two fingers on a trackpad, or the mouse wheel, and taps to click.', silent: 'parent' },
  instruction: { text: 'Slide two fingers on the trackpad to look around. Find the hidden things and tap them.' },
  scrollDown: { text: 'Scroll down to find the' },
  scrollUp: { text: 'Scroll up to find the' },
  scrollRight: { text: 'Scroll to the right to find the' },
  scrollLeft: { text: 'Scroll to the left to find the' },
  tapIt: { text: 'There it is. Tap it with one finger, or click it.' },
  twoFingers: { text: 'Two fingers slide to scroll', silent: 'decorative' },
  oneTap: { text: 'One finger taps to click', silent: 'decorative' },
  scene: { text: 'The scene. Scroll to look around.', silent: 'decorative' },
});
