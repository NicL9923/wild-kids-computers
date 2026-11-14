import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { colors, emojiNames, numberHandle } from '../../../core/strings/shared/index.ts';
import type { EmojiId } from '../../../core/strings/shared/emoji.ts';
import type { Hint } from '../engine/puzzle.ts';
import type { BlockDraft, DefinitionName, PenColor, TurnAngle } from '../engine/program.ts';
import { strings } from '../strings.ts';

/**
 * What the robot painter says: each block's spoken name, and the words for each hint. Pure, so
 * the tests check every case without a screen.
 */

const ANGLES: Readonly<Record<TurnAngle, SpokenHandle>> = {
  30: strings.angle30,
  45: strings.angle45,
  60: strings.angle60,
  72: strings.angle72,
  90: strings.angle90,
  120: strings.angle120,
  135: strings.angle135,
  144: strings.angle144,
  150: strings.angle150,
  180: strings.angle180,
};

/** The picture of each name a child can give a block. */
export const NAME_PICTURES: Readonly<Record<DefinitionName, EmojiId>> = {
  box: 'box',
  house: 'house',
  petal: 'cherry-blossom',
  flower: 'sunflower',
  tree: 'tree',
  leaf: 'leaf',
  sun: 'sun',
  moon: 'moon',
};

/** The spoken name of a block name. Most are emoji names; a petal has its own word. */
export function nameSpeech(name: DefinitionName): SpokenHandle {
  if (name === 'petal') return strings.petal;
  if (name === 'flower') return emojiNames.flower;
  return emojiNames[NAME_PICTURES[name]];
}

/** The shape drawn on each pen color, so a color is never told by its hue alone. */
export const COLOR_SHAPES: Readonly<
  Record<PenColor, 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'cross'>
> = {
  blue: 'circle',
  red: 'square',
  green: 'triangle',
  orange: 'diamond',
  purple: 'hexagon',
  black: 'cross',
};

export function colorSpeech(color: PenColor): SpokenHandle {
  return colors[color];
}

/** What a block says when the pointer comes onto it or it gets focus, such as "forward, four". */
export function blockSpeech(block: BlockDraft): readonly SpokenHandle[] {
  switch (block.kind) {
    case 'move':
      return [strings[block.direction]];
    case 'forward':
      return [strings.forward, numberHandle(block.distance)];
    case 'turn':
      return [block.direction === 'left' ? strings.turnLeft : strings.turnRight, ANGLES[block.angle]];
    case 'repeat':
      return [strings.repeat, numberHandle(block.count)];
    case 'pen-up':
      return [strings.penUp];
    case 'pen-down':
      return [strings.penDown];
    case 'color':
      return [colorSpeech(block.color)];
    default:
      return [nameSpeech(block.name)];
  }
}

/** The neutral words for a hint. */
export function hintSpeech(hint: Hint): SpokenHandle {
  switch (hint.kind) {
    case 'step-limit':
      return strings.hintStepLimit;
    case 'bumped':
      return strings.hintBumped;
    case 'not-there-yet':
      return strings.hintNotThereYet;
    case 'nothing-drawn':
      return strings.hintNothingDrawn;
    case 'wrong-color':
      return strings.hintWrongColor;
    case 'missing-line':
      return strings.hintMissingLine;
    case 'extra-line':
      return strings.hintExtraLine;
    default:
      return strings.hintWrongEnd;
  }
}
