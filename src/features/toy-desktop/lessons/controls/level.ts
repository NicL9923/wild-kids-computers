import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import {
  ALERT_SOUNDS,
  BRIGHTNESS,
  LIST_VISIBLE_ROWS,
  type AlertSound,
  type IconSize,
  type ToySettings,
  type Wallpaper,
} from '../../model/apps/settingsPanel.ts';
import { buildDesktop } from '../../model/build.ts';
import type { DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';

export type ControlKind = 'checkbox' | 'radio' | 'dropdown' | 'slider' | 'text' | 'list';

/** Names a child can type and the card can show. */
const COMPUTER_NAMES = ['Fox', 'Owl', 'Frog', 'Bee'] as const;
export type ComputerName = (typeof COMPUTER_NAMES)[number];

/** One setting to change, and the value to change it to. */
export type ControlTarget =
  | { readonly kind: 'checkbox'; readonly value: boolean }
  | { readonly kind: 'radio'; readonly value: Exclude<Wallpaper, 'meadow'> }
  | { readonly kind: 'dropdown'; readonly value: Exclude<IconSize, 'medium'> }
  | { readonly kind: 'slider'; readonly value: 'lowest' | 'middle' }
  | { readonly kind: 'text'; readonly value: ComputerName }
  | { readonly kind: 'list'; readonly value: AlertSound };

/** The setting each kind of control changes. */
export const SETTING_OF: Readonly<Record<ControlKind, keyof ToySettings>> = {
  checkbox: 'showNames',
  radio: 'wallpaper',
  dropdown: 'iconSize',
  slider: 'brightness',
  text: 'computerName',
  list: 'alertSound',
};

/** The middle of the brightness slider, and how far either side still counts as the middle. */
export const BRIGHTNESS_MIDDLE = 60;
const MIDDLE_ROOM = 10;

/** Alert sounds below the first rows the list shows: the child must scroll to reach them. */
export const SOUNDS_OUT_OF_VIEW: readonly AlertSound[] = ALERT_SOUNDS.slice(LIST_VISIBLE_ROWS);

/**
 * Which controls a round may use and how many, by difficulty. One kind at low difficulty, a mix at
 * high. The scrolling list and the text field come last: one needs scrolling, the other typing.
 */
export const DIFFICULTY: readonly { readonly kinds: readonly ControlKind[]; readonly count: number }[] = [
  { kinds: ['checkbox', 'radio'], count: 1 },
  { kinds: ['checkbox', 'radio', 'dropdown'], count: 1 },
  { kinds: ['dropdown', 'slider', 'list'], count: 1 },
  { kinds: ['checkbox', 'radio', 'dropdown', 'slider'], count: 2 },
  { kinds: ['radio', 'dropdown', 'slider', 'list'], count: 2 },
  { kinds: ['checkbox', 'radio', 'dropdown', 'slider', 'list'], count: 3 },
  { kinds: ['checkbox', 'radio', 'dropdown', 'slider', 'text', 'list'], count: 3 },
  { kinds: ['checkbox', 'radio', 'dropdown', 'slider', 'text', 'list'], count: 4 },
];

export interface ControlsLevel extends LessonLevel {
  /** The settings to change, one step each, in order. */
  readonly targets: readonly ControlTarget[];
}

/** True when the setting already has the value the target asks for. */
export function isMatched(state: DesktopState, target: ControlTarget): boolean {
  const { settings } = state;
  switch (target.kind) {
    case 'checkbox':
      return settings.showNames === target.value;
    case 'radio':
      return settings.wallpaper === target.value;
    case 'dropdown':
      return settings.iconSize === target.value;
    case 'slider':
      return target.value === 'lowest'
        ? settings.brightness === BRIGHTNESS.min
        : Math.abs(settings.brightness - BRIGHTNESS_MIDDLE) <= MIDDLE_ROOM;
    case 'text':
      return settings.computerName.trim().toLocaleLowerCase('en') === target.value.toLocaleLowerCase('en');
    // 'list', the last case.
    default:
      return settings.alertSound === target.value;
  }
}

/** The settings window, on the left, as tall as the lesson desktop allows. The card stands to its right. */
export const PANEL = { x: 24, y: 16, width: 620, height: 608 } as const;
/** The target card, right of the settings window and left of where icons stand. */
export const CARD = { x: 668, y: 16, width: 330, height: 608 } as const;

const PARTS: DesktopParts = {
  // Two icons, so the checkbox and the icon size show what they change.
  icons: [{ app: 'notepad' }, { app: 'music-box' }],
  menuBar: false,
  taskStrip: false,
  launcher: [],
  windowControls: [],
  move: false,
  resize: false,
  openMaximized: false,
  systemSound: false,
};

function targetFor(kind: ControlKind, random: ReturnType<typeof createRandom>, startNames: boolean): ControlTarget {
  switch (kind) {
    case 'checkbox':
      return { kind, value: !startNames };
    case 'radio':
      return { kind, value: random.pick(['pond', 'hills', 'night-sky'] as const) };
    case 'dropdown':
      return { kind, value: random.pick(['small', 'large'] as const) };
    case 'slider':
      return { kind, value: random.pick(['lowest', 'middle'] as const) };
    case 'text':
      return { kind, value: random.pick(COMPUTER_NAMES) };
    // 'list', the last case.
    default:
      return { kind: 'list', value: random.pick(SOUNDS_OUT_OF_VIEW) };
  }
}

/**
 * The settings panel open, and a card beside it that shows each setting to change. Every setting
 * starts away from its target, so each step is a real change.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): ControlsLevel {
  const random = createRandom(seed);
  const row = DIFFICULTY[Math.min(Math.max(difficulty, 1), DIFFICULTY.length) - 1] ?? DIFFICULTY[0];
  if (row === undefined) throw new Error('controls: no difficulty table');
  const startNames = random.pick([true, false]);
  const kinds = random.sample(row.kinds, row.count);
  const targets = kinds.map((kind) => targetFor(kind, random, startNames));
  return {
    targets,
    parts: PARTS,
    desktop: buildDesktop({
      size: LESSON_DESKTOP_SIZE,
      windows: [
        { app: 'settings', at: { x: PANEL.x, y: PANEL.y }, size: { width: PANEL.width, height: PANEL.height } },
      ],
      settings: {
        showNames: startNames,
        wallpaper: 'meadow',
        iconSize: 'medium',
        brightness: BRIGHTNESS.max,
        // An empty name, so the child types a name rather than first deleting one.
        computerName: kinds.includes('text') ? '' : 'My computer',
        alertSound: ALERT_SOUNDS[0],
      },
    }),
  };
}
