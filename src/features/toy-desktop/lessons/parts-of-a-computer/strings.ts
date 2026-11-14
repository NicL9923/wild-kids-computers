import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('parts-of-a-computer', {
  title: { text: 'Parts of a computer' },
  goal: {
    text: 'Names the screen, keyboard, mouse, trackpad, speaker, and camera, and says what each one does.',
    silent: 'parent',
  },
  instruction: { text: 'Find the part of the computer you hear.' },
  scene: { text: 'A computer on a desk', silent: 'decorative' },
  screen: { text: 'Screen' },
  keyboard: { text: 'Keyboard' },
  mouse: { text: 'Mouse' },
  trackpad: { text: 'Trackpad' },
  speaker: { text: 'Speaker' },
  camera: { text: 'Camera' },
  findScreen: { text: 'Find the screen.' },
  findKeyboard: { text: 'Find the keyboard.' },
  findMouse: { text: 'Find the mouse.' },
  findTrackpad: { text: 'Find the trackpad.' },
  findSpeaker: { text: 'Find the speaker.' },
  findCamera: { text: 'Find the camera.' },
  clueScreen: { text: 'Find the part that shows you pictures and words.' },
  clueKeyboard: { text: 'Find the part with letters you press to type.' },
  clueMouse: { text: 'Find the part you hold in your hand to move the pointer.' },
  clueTrackpad: { text: 'Find the flat part you slide your finger on to move the pointer.' },
  clueSpeaker: { text: 'Find the part that plays sounds.' },
  clueCamera: { text: 'Find the part that can see you for a video call.' },
});
