import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { ALERT_SOUND_NAMES, ICON_SIZE_NAMES, WALLPAPER_NAMES } from '../../desktop/labels.ts';
import { hasEvent } from '../../model/goals.ts';
import type { LessonStep } from '../harness/lesson.ts';
import { isMatched, SETTING_OF, type ComputerName, type ControlsLevel, type ControlTarget } from './level.ts';
import { strings } from './strings.ts';

export const NAME_HANDLES: Readonly<Record<ComputerName, SpokenHandle>> = {
  Fox: strings.fox,
  Owl: strings.owl,
  Frog: strings.frog,
  Bee: strings.bee,
};

/** What the child hears for one setting: the control to use and the value to choose. */
export function targetInstruction(target: ControlTarget): SpokenHandle[] {
  switch (target.kind) {
    case 'checkbox':
      return [target.value ? strings.namesOn : strings.namesOff];
    case 'radio':
      return [strings.chooseBackground, WALLPAPER_NAMES[target.value]];
    case 'dropdown':
      return [strings.chooseIconSize, ICON_SIZE_NAMES[target.value]];
    case 'slider':
      return [target.value === 'lowest' ? strings.brightnessLowest : strings.brightnessMiddle];
    case 'text':
      return [strings.typeName, NAME_HANDLES[target.value]];
    // 'list', the last case.
    default:
      return [strings.chooseSound, ALERT_SOUND_NAMES[target.value]];
  }
}

/**
 * Controls where choosing another value takes a deliberate click or Enter: a wrong pick. Radio
 * buttons are left out because the arrow keys pass through every option on the way.
 */
const PICKED = new Set(['dropdown', 'list']);

/** One step per setting, each with its own spoken instruction. */
export function controlSteps({ targets }: ControlsLevel): LessonStep[] {
  return targets.map((target) => {
    const setting = SETTING_OF[target.kind];
    return {
      instruction: targetInstruction(target),
      done: (state) => isMatched(state, target),
      // A slider passes through values, a name is typed a letter at a time, and arrow keys move
      // through radio buttons, so only a deliberate pick of another option is a try.
      wrong: ({ state, events }) =>
        PICKED.has(target.kind) &&
        hasEvent(events, 'setting-changed', (event) => event.setting === setting) &&
        !isMatched(state, target),
      nudge: strings.otherChoice,
      hint: () => ({ kind: 'key', key: `setting:${setting}` }),
    };
  });
}
