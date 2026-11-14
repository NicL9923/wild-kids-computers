import { defineStrings } from '../../core/strings/defineStrings.ts';

/**
 * The parent gate. Every string is silent: the app never speaks the gate, so a child who cannot
 * read never hears the answer.
 */
export const strings = defineStrings('parent-gate', {
  'title-parent-corner': { text: 'Open the parent corner', silent: 'parent' },
  'title-export': { text: 'Save a picture to the computer', silent: 'parent' },
  'title-print': { text: 'Print a picture', silent: 'parent' },
  'title-quit': { text: 'Close the app', silent: 'parent' },
  'title-closing': { text: 'Grown-up choices', silent: 'parent' },
  wordPrompt: { text: 'Grown-ups only. Type these numbers as digits.', silent: 'parent' },
  wordLabel: { text: 'The numbers, as digits', silent: 'parent' },
  pinPrompt: { text: 'Grown-ups only. Type the parent PIN.', silent: 'parent' },
  pinLabel: { text: 'Parent PIN', silent: 'parent' },
  noMatch: { text: 'That does not match. Try again.', silent: 'parent' },
  waiting: { text: 'That does not match. Wait a moment, then try again.', silent: 'parent' },
  checking: { text: 'Checking', silent: 'parent' },
  pinUnusable: { text: 'The saved PIN could not be checked. Type these numbers as digits instead.', silent: 'parent' },
  cancel: { text: 'Cancel', silent: 'parent' },
  close: { text: 'Close', silent: 'parent' },
  continue: { text: 'Continue', silent: 'parent' },
  forgotPin: { text: 'Forgot the PIN?', silent: 'parent' },
  forgotPinSteps: {
    text: "Close the app, from the computer's task manager if kiosk lock keeps it open. Then delete the file app.json in the folder below. Profiles, settings, and pictures stay. The app opens with the word gate and asks about sound and kiosk lock again.",
    silent: 'parent',
  },
  'folder-linux': { text: '~/.config/Wild Kids - Computers/data', silent: 'parent' },
  'folder-mac': { text: '~/Library/Application Support/Wild Kids - Computers/data', silent: 'parent' },
  'folder-windows': { text: String.raw`%APPDATA%\Wild Kids - Computers\data`, silent: 'parent' },
  forgotPinBrowser: {
    text: "In the browser version, clear this site's data in the browser settings. That also removes profiles and pictures.",
    silent: 'parent',
  },
  'digit-0': { text: 'zero', silent: 'parent' },
  'digit-1': { text: 'one', silent: 'parent' },
  'digit-2': { text: 'two', silent: 'parent' },
  'digit-3': { text: 'three', silent: 'parent' },
  'digit-4': { text: 'four', silent: 'parent' },
  'digit-5': { text: 'five', silent: 'parent' },
  'digit-6': { text: 'six', silent: 'parent' },
  'digit-7': { text: 'seven', silent: 'parent' },
  'digit-8': { text: 'eight', silent: 'parent' },
  'digit-9': { text: 'nine', silent: 'parent' },
});
