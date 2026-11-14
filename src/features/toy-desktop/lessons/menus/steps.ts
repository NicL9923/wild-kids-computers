import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { COMMAND_NAMES, MENU_NAMES } from '../../desktop/labels.ts';
import { hasEvent } from '../../model/goals.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { MenusLevel, MenuTask } from './level.ts';
import { strings } from './strings.ts';

/** What the child hears for a command: the menu and the command, or only the command. */
export function taskInstruction(task: MenuTask, named: boolean, first: boolean): SpokenHandle[] {
  if (named)
    return [
      first ? strings.inMenu : strings.nowInMenu,
      MENU_NAMES[task.menu],
      strings.choose,
      COMMAND_NAMES[task.command],
    ];
  return [first ? strings.findCommand : strings.nowFind, COMMAND_NAMES[task.command]];
}

/** One step per command: done when it runs, a try when another command runs instead. */
export function menuSteps({ tasks, named }: MenusLevel): LessonStep[] {
  return tasks.map((task, index) => ({
    instruction: taskInstruction(task, named, index === 0),
    done: (_state, events) => hasEvent(events, 'command-run', (event) => event.command === task.command),
    wrong: ({ events }) => hasEvent(events, 'command-run', (event) => event.command !== task.command),
    nudge: strings.otherCommand,
    hint: () => ({ kind: 'menu', menu: task.menu }),
  }));
}
