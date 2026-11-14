import { describe, expect, it } from 'vitest';
import {
  ALERT_SOUNDS,
  applySettingsAction,
  BRIGHTNESS,
  createSettingsPanel,
  defaultSettings,
  LIST_VISIBLE_ROWS,
  snapBrightness,
  type SettingsAction,
  type SettingsResult,
} from './settingsPanel.ts';

function apply(action: SettingsAction, panel = createSettingsPanel(defaultSettings())): SettingsResult {
  const result = applySettingsAction(defaultSettings(), panel, action);
  if (typeof result === 'string') throw new Error(`refused: ${result}`);
  return result;
}

const LAST_SCROLL = ALERT_SOUNDS.length - LIST_VISIBLE_ROWS;

describe('the settings panel', () => {
  it('starts with the name field holding the computer name', () => {
    expect(createSettingsPanel({ ...defaultSettings(), computerName: 'Rocket' }).nameField.text).toBe('Rocket');
  });

  it.each([
    ['the checkbox', { type: 'set-show-names', value: false }, 'showNames', false],
    ['a radio button', { type: 'set-wallpaper', value: 'night-sky' }, 'wallpaper', 'night-sky'],
    ['a dropdown choice', { type: 'set-icon-size', value: 'large' }, 'iconSize', 'large'],
    ['the slider', { type: 'set-brightness', value: 60 }, 'brightness', 60],
    ['the list', { type: 'set-alert-sound', value: 'frog' }, 'alertSound', 'frog'],
  ] as const)('changes a setting with %s and reports it', (_label, action, setting, value) => {
    const result = apply(action);
    expect(result.settings[setting]).toBe(value);
    expect(result.changed).toEqual({ setting, value });
  });

  it('reports no change when a control is set to the value it has', () => {
    expect(apply({ type: 'set-wallpaper', value: defaultSettings().wallpaper }).changed).toBeNull();
  });

  it.each([
    ['a wallpaper', { type: 'set-wallpaper', value: 'beach' }],
    ['an icon size', { type: 'set-icon-size', value: 'huge' }],
    ['an alert sound', { type: 'set-alert-sound', value: 'siren' }],
  ] as const)('refuses %s that is not an option', (_label, action) => {
    expect(applySettingsAction(defaultSettings(), createSettingsPanel(defaultSettings()), action)).toBe(
      'not-an-option',
    );
  });

  it('opens the dropdown, and choosing closes it', () => {
    const opened = apply({ type: 'open-dropdown' });
    expect(opened.panel.dropdownOpen).toBe(true);
    expect(apply({ type: 'set-icon-size', value: 'small' }, opened.panel).panel.dropdownOpen).toBe(false);
    expect(apply({ type: 'close-dropdown' }, opened.panel).panel.dropdownOpen).toBe(false);
  });

  it('closes the dropdown even when the choice is the current size', () => {
    const opened = apply({ type: 'open-dropdown' });
    const result = apply({ type: 'set-icon-size', value: defaultSettings().iconSize }, opened.panel);
    expect(result).toMatchObject({ changed: null, panel: { dropdownOpen: false } });
  });

  it.each([
    [55, 60],
    [54, 50],
    [0, BRIGHTNESS.min],
    [500, BRIGHTNESS.max],
    [Number.NaN, BRIGHTNESS.max],
  ])('snaps a brightness of %d to %d', (value, snapped) => {
    expect(snapBrightness(value)).toBe(snapped);
  });

  it.each([
    [3, 3],
    [-2, 0],
    [99, LAST_SCROLL],
    [2.6, 3],
  ])('scrolls the list to row %d as %d', (row, scroll) => {
    expect(apply({ type: 'scroll-list', firstRow: row }).panel.listScroll).toBe(scroll);
  });

  it('scrolls a chosen sound into view from above and from below', () => {
    const last = ALERT_SOUNDS.length - 1;
    const down = apply({ type: 'set-alert-sound', value: ALERT_SOUNDS[last] ?? 'bell' });
    expect(down.panel.listScroll).toBe(LAST_SCROLL);
    const up = apply({ type: 'set-alert-sound', value: ALERT_SOUNDS[1] ?? 'bell' }, down.panel);
    expect(up.panel.listScroll).toBe(1);
  });

  it('leaves the scroll alone when the chosen sound is already in view', () => {
    const scrolled = apply({ type: 'scroll-list', firstRow: 2 });
    const chosen = apply({ type: 'set-alert-sound', value: ALERT_SOUNDS[4] ?? 'bell' }, scrolled.panel);
    expect(chosen.panel.listScroll).toBe(2);
  });
});
