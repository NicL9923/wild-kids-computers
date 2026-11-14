import type { OsFamily } from '../../../../core/platform/bridge.ts';
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import type { EditKey, FixLevel, SentenceId } from './level.ts';
import { strings } from './strings.ts';

/** The spoken sentence, as it should be. */
export const SENTENCE_SPEECH: Readonly<Record<SentenceId, SpokenHandle>> = {
  catNaps: strings.catNaps,
  frogJumps: strings.frogJumps,
  busPark: strings.busPark,
  kiteColors: strings.kiteColors,
  foxLog: strings.foxLog,
  milkBowl: strings.milkBowl,
  shipSails: strings.shipSails,
  snowTent: strings.snowTent,
  birdSings: strings.birdSings,
  dadReads: strings.dadReads,
  plantSeeds: strings.plantSeeds,
  owlSleeps: strings.owlSleeps,
  frogsPond: strings.frogsPond,
  grandmaCake: strings.grandmaCake,
};

/**
 * The tip for a level: which keys fix this kind of slip, named as the child's own keyboard
 * names them. A level that could hold any slip gets the general tip.
 */
export function tipFor(level: Pick<FixLevel, 'kind' | 'caretStart' | 'mixed'>, os: OsFamily): SpokenHandle {
  const mac = os === 'mac';
  if (level.mixed) return strings.tipFind;
  switch (level.kind) {
    case 'extra-letter':
      if (level.caretStart === 'after') return mac ? strings.tipBackspaceMac : strings.tipBackspace;
      if (level.caretStart === 'before') return mac ? strings.tipDeleteMac : strings.tipDelete;
      return strings.tipExtraLetter;
    case 'missing-letter':
      return strings.tipMissing;
    case 'changed-letter':
      return strings.tipChangedLetter;
    case 'extra-word':
      return strings.tipExtraWord;
    // 'changed-word', the last case.
    default:
      return strings.tipChangedWord;
  }
}

/** The label on a key cap, as the child's own keyboard prints it. */
export function capLabel(key: EditKey, os: OsFamily) {
  const mac = os === 'mac';
  switch (key) {
    case 'left':
      return strings.capLeft;
    case 'right':
      return strings.capRight;
    case 'shift':
      return strings.capShift;
    case 'backspace':
      return mac ? strings.capBackspaceMac : strings.capBackspace;
    // 'delete', the last case.
    default:
      return mac ? strings.capDeleteMac : strings.capDelete;
  }
}

/** The `KeyboardEvent.key` values that light each cap when pressed. */
export const CAP_KEYS: Readonly<Record<EditKey, string>> = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  shift: 'Shift',
  backspace: 'Backspace',
  delete: 'Delete',
};
