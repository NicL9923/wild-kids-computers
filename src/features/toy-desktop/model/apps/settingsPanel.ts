/**
 * The toy settings panel for the "Controls" lesson: one of each common control. The values live
 * on the desktop, so the panel's choices show on the desktop around it. Option ids are not
 * words a child sees; a screen maps each one to a picture and a spoken label.
 */
import { createEditor, type TextEditorState } from '../textEditor.ts';

/** Radio group: the desktop's background picture. */
export const WALLPAPERS = ['meadow', 'pond', 'hills', 'night-sky'] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

/** Dropdown: how big desktop icons are. */
export const ICON_SIZES = ['small', 'medium', 'large'] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** Scrollable list: the sound the toy computer makes for an alert. More than fit at once. */
export const ALERT_SOUNDS = [
  'bell',
  'chirp',
  'drum',
  'pop',
  'whistle',
  'harp',
  'splash',
  'ding',
  'frog',
  'bubbles',
  'chime',
  'wood-block',
] as const;
export type AlertSound = (typeof ALERT_SOUNDS)[number];

/** Rows of the alert sound list that show at once. The rest are reached by scrolling. */
export const LIST_VISIBLE_ROWS = 5;

/** Slider: screen brightness. It never goes dark, so a child cannot lose the screen. */
export const BRIGHTNESS = { min: 20, max: 100, step: 10 } as const;

/** Text field: the toy computer's name. */
export const COMPUTER_NAME_MAX_LENGTH = 24;

export interface ToySettings {
  /** Checkbox: show names under desktop icons. */
  showNames: boolean;
  wallpaper: Wallpaper;
  iconSize: IconSize;
  brightness: number;
  computerName: string;
  alertSound: AlertSound;
}

export function defaultSettings(): ToySettings {
  return {
    showNames: true,
    wallpaper: 'meadow',
    iconSize: 'medium',
    brightness: 100,
    computerName: 'My computer',
    alertSound: 'bell',
  };
}

/** The panel's own state. The values it changes live in `ToySettings`. */
export interface SettingsPanelState {
  kind: 'settings';
  nameField: TextEditorState;
  dropdownOpen: boolean;
  /** Index of the first alert sound row in view. */
  listScroll: number;
}

export function createSettingsPanel(settings: ToySettings): SettingsPanelState {
  return {
    kind: 'settings',
    nameField: createEditor({ text: settings.computerName, maxLength: COMPUTER_NAME_MAX_LENGTH }),
    dropdownOpen: false,
    listScroll: 0,
  };
}

export type SettingsAction =
  | { type: 'set-show-names'; value: boolean }
  | { type: 'set-wallpaper'; value: string }
  | { type: 'open-dropdown' }
  | { type: 'close-dropdown' }
  /** Choosing an icon size also closes the dropdown. */
  | { type: 'set-icon-size'; value: string }
  /** Snaps to the slider's step and clamps to its range. */
  | { type: 'set-brightness'; value: number }
  /** Scrolls the list so this row is first. Clamps so the last row never scrolls past the bottom. */
  | { type: 'scroll-list'; firstRow: number }
  /** Choosing a sound also scrolls it into view, as a keyboard choice does. */
  | { type: 'set-alert-sound'; value: string };

export type SettingsProblem =
  /** The value is not one of the control's options. */
  'not-an-option';

export interface SettingsResult {
  settings: ToySettings;
  panel: SettingsPanelState;
  /** The setting that changed, if one did. */
  changed: { setting: keyof ToySettings; value: string | number | boolean } | null;
}

function isOneOf<T extends string>(options: readonly T[], value: string): value is T {
  return (options as readonly string[]).includes(value);
}

/** The largest first row: the list's last row sits at the bottom of the view. */
const MAX_SCROLL = ALERT_SOUNDS.length - LIST_VISIBLE_ROWS;

function clampScroll(row: number): number {
  return Math.min(Math.max(Math.round(row), 0), MAX_SCROLL);
}

/** Snaps a brightness to the slider's steps and range. */
export function snapBrightness(value: number): number {
  if (!Number.isFinite(value)) return BRIGHTNESS.max;
  const stepped = Math.round(value / BRIGHTNESS.step) * BRIGHTNESS.step;
  return Math.min(Math.max(stepped, BRIGHTNESS.min), BRIGHTNESS.max);
}

function change<K extends keyof ToySettings>(
  settings: ToySettings,
  panel: SettingsPanelState,
  setting: K,
  value: ToySettings[K],
): SettingsResult {
  if (settings[setting] === value) return { settings, panel, changed: null };
  return { settings: { ...settings, [setting]: value }, panel, changed: { setting, value } };
}

export function applySettingsAction(
  settings: ToySettings,
  panel: SettingsPanelState,
  action: SettingsAction,
): SettingsResult | SettingsProblem {
  switch (action.type) {
    case 'set-show-names':
      return change(settings, panel, 'showNames', action.value);
    case 'set-wallpaper':
      return isOneOf(WALLPAPERS, action.value) ? change(settings, panel, 'wallpaper', action.value) : 'not-an-option';
    case 'open-dropdown':
      return { settings, panel: { ...panel, dropdownOpen: true }, changed: null };
    case 'close-dropdown':
      return { settings, panel: { ...panel, dropdownOpen: false }, changed: null };
    case 'set-icon-size':
      return isOneOf(ICON_SIZES, action.value)
        ? change(settings, { ...panel, dropdownOpen: false }, 'iconSize', action.value)
        : 'not-an-option';
    case 'set-brightness':
      return change(settings, panel, 'brightness', snapBrightness(action.value));
    case 'scroll-list':
      return { settings, panel: { ...panel, listScroll: clampScroll(action.firstRow) }, changed: null };
    // 'set-alert-sound', the last case.
    default: {
      if (!isOneOf(ALERT_SOUNDS, action.value)) return 'not-an-option';
      const row = ALERT_SOUNDS.indexOf(action.value);
      const top = Math.min(panel.listScroll, row);
      const listScroll = clampScroll(Math.max(top, row - LIST_VISIBLE_ROWS + 1));
      return change(settings, { ...panel, listScroll }, 'alertSound', action.value);
    }
  }
}
