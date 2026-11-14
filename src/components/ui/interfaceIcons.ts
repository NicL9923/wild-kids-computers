import exit from '../../../assets/art/interface/exit.svg';
import meadow from '../../../assets/art/interface/meadow.svg';
import parentCorner from '../../../assets/art/interface/parent-corner.svg';
import playAgain from '../../../assets/art/interface/play-again.svg';
import redo from '../../../assets/art/interface/redo.svg';
import replay from '../../../assets/art/interface/replay.svg';
import soundOff from '../../../assets/art/interface/sound-off.svg';
import soundOn from '../../../assets/art/interface/sound-on.svg';
import undo from '../../../assets/art/interface/undo.svg';

export const INTERFACE_ICON_NAMES = [
  'exit',
  'replay',
  'sound-on',
  'sound-off',
  'play-again',
  'meadow',
  'undo',
  'redo',
  'parent-corner',
] as const;

export type InterfaceIconName = (typeof INTERFACE_ICON_NAMES)[number];

/** The friendly pictures for controls a young child uses. Adults' controls use Lucide icons. */
export const INTERFACE_ICONS: Record<InterfaceIconName, string> = {
  exit,
  replay,
  'sound-on': soundOn,
  'sound-off': soundOff,
  'play-again': playAgain,
  meadow,
  undo,
  redo,
  'parent-corner': parentCorner,
};
