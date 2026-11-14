import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import type { PartId, PartsLevel } from './level.ts';
import { strings } from './strings.ts';

/** Each part's name, said when a child picks it and read by a screen reader. */
export const PART_NAMES: Readonly<Record<PartId, SpokenHandle>> = {
  screen: strings.screen,
  keyboard: strings.keyboard,
  mouse: strings.mouse,
  trackpad: strings.trackpad,
  speaker: strings.speaker,
  camera: strings.camera,
};

const FIND: Readonly<Record<PartId, SpokenHandle>> = {
  screen: strings.findScreen,
  keyboard: strings.findKeyboard,
  mouse: strings.findMouse,
  trackpad: strings.findTrackpad,
  speaker: strings.findSpeaker,
  camera: strings.findCamera,
};

const CLUE: Readonly<Record<PartId, SpokenHandle>> = {
  screen: strings.clueScreen,
  keyboard: strings.clueKeyboard,
  mouse: strings.clueMouse,
  trackpad: strings.clueTrackpad,
  speaker: strings.clueSpeaker,
  camera: strings.clueCamera,
};

/** What the child hears for the round: the part's name, or what it does. */
export function promptFor({ target, mode }: PartsLevel): SpokenHandle {
  return mode === 'name' ? FIND[target] : CLUE[target];
}
