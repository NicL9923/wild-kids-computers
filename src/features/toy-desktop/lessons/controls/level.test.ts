import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { BRIGHTNESS, LIST_VISIBLE_ROWS, type SettingsAction } from '../../model/apps/settingsPanel.ts';
import { reduce, reduceAll, type DesktopAction } from '../../model/desktop.ts';
import type { DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import activity from './activity.ts';
import {
  CARD,
  DIFFICULTY,
  generateLevel,
  isMatched,
  PANEL,
  SOUNDS_OUT_OF_VIEW,
  type ControlsLevel,
  type ControlTarget,
} from './level.ts';
import { controlSteps, targetInstruction } from './steps.ts';
import { strings } from './strings.ts';

/** The values each control may be asked for: never the value it starts at. */
const VALUES: Readonly<Record<ControlTarget['kind'], readonly string[]>> = {
  checkbox: ['true', 'false'],
  radio: ['pond', 'hills', 'night-sky'],
  dropdown: ['small', 'large'],
  slider: ['lowest', 'middle'],
  text: ['Fox', 'Owl', 'Frog', 'Bee'],
  list: ['harp', 'splash', 'ding', 'frog', 'bubbles', 'chime', 'wood-block'],
};

const targetOf = (level: ControlsLevel, kind: ControlTarget['kind']) =>
  level.targets.find((each) => each.kind === kind);

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const env = () => ({ clipboard: createToyClipboard() });

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('controls is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

const settings = (action: SettingsAction): DesktopAction => ({ type: 'settings', windowId: 'w1', action });

/** The actions a child takes to set one control to its target. */
function solve(target: ControlTarget): DesktopAction[] {
  switch (target.kind) {
    case 'checkbox':
      return [settings({ type: 'set-show-names', value: target.value })];
    case 'radio':
      return [settings({ type: 'set-wallpaper', value: target.value })];
    case 'dropdown':
      return [settings({ type: 'open-dropdown' }), settings({ type: 'set-icon-size', value: target.value })];
    case 'slider':
      return [settings({ type: 'set-brightness', value: target.value === 'lowest' ? 0 : 60 })];
    case 'text':
      return target.value.split('').map((letter) => ({
        type: 'text',
        windowId: 'w1',
        field: 'computer-name',
        op: { type: 'insert', text: letter },
      }));
    default:
      return [
        settings({ type: 'scroll-list', firstRow: LIST_VISIBLE_ROWS }),
        settings({ type: 'set-alert-sound', value: target.value }),
      ];
  }
}

/** What makes a round fair: one step per distinct control, none matched at the start, the panel in view. */
function problems(level: ControlsLevel): string[] {
  const found: string[] = [];
  const kinds = level.targets.map((target) => target.kind);
  for (const target of level.targets) {
    if (!VALUES[target.kind].includes(String(target.value)))
      found.push(`${target.kind} asks for ${String(target.value)}`);
  }
  if (targetOf(level, 'checkbox')?.value === level.desktop.settings.showNames) found.push('the box already shows that');
  if (new Set(kinds).size !== kinds.length) found.push('a control repeats');
  for (const target of level.targets) {
    if (isMatched(level.desktop, target)) found.push(`${target.kind} already matches`);
  }
  const panel = level.desktop.windows[0];
  if (level.desktop.windows.length !== 1 || panel?.app.kind !== 'settings')
    return [...found, 'not one settings window'];
  if (panel.rect.x !== PANEL.x || panel.rect.y !== PANEL.y || panel.rect.height !== PANEL.height) {
    found.push('the panel moved');
  }
  return found;
}

describe.each(['band-6-8', 'band-9-12'] as const)('controls for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable step by step at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const steps = controlSteps(level);
      let state: DesktopState = level.desktop;
      level.targets.forEach((target, index) => {
        const transition = reduceAll(state, solve(target), env());
        state = transition.state;
        expect(steps[index]?.done(state, transition.events), `seed ${seed} ${target.kind}`).toBe(true);
      });
    }
  });
});

describe('controls layout', () => {
  it('keeps the panel and the card side by side inside the lesson desktop', () => {
    expect(PANEL.x + PANEL.width).toBeLessThan(CARD.x);
    expect(CARD.x + CARD.width).toBeLessThanOrEqual(LESSON_DESKTOP_SIZE.width);
    expect(PANEL.y + PANEL.height).toBeLessThanOrEqual(LESSON_DESKTOP_SIZE.height);
    expect(CARD.y + CARD.height).toBeLessThanOrEqual(LESSON_DESKTOP_SIZE.height);
  });
});

describe('controls difficulty', () => {
  it('uses one kind of control at first and a mix later, with the list and the text field last', () => {
    expect(DIFFICULTY.map((row) => `${String(row.count)}: ${row.kinds.join(' ')}`)).toEqual([
      '1: checkbox radio',
      '1: checkbox radio dropdown',
      '1: dropdown slider list',
      '2: checkbox radio dropdown slider',
      '2: radio dropdown slider list',
      '3: checkbox radio dropdown slider list',
      '3: checkbox radio dropdown slider text list',
      '4: checkbox radio dropdown slider text list',
    ]);
  });

  it('reaches every kind of its row across seeds, the given number at a time', () => {
    DIFFICULTY.forEach((row, index) => {
      const levels = SEEDS.map((seed) => generateLevel(seed, index + 1, 'band-9-12'));
      const kinds = new Set(levels.flatMap((level) => level.targets.map((target) => target.kind)));
      expect(kinds).toEqual(new Set(row.kinds));
      expect(levels.every((level) => level.targets.length === row.count)).toBe(true);
    });
  });

  it('asks for a sound the list does not show until it scrolls', () => {
    const sounds = SEEDS.flatMap((seed) =>
      generateLevel(seed, 5, 'band-9-12').targets.flatMap((target) => (target.kind === 'list' ? [target.value] : [])),
    );
    expect(sounds.filter((sound) => !SOUNDS_OUT_OF_VIEW.includes(sound))).toEqual([]);
    expect(new Set(sounds).size).toBe(SOUNDS_OUT_OF_VIEW.length);
    expect(SOUNDS_OUT_OF_VIEW).toHaveLength(7);
  });

  it('starts the name empty only when the round asks for one, so the child types rather than deletes', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const level = generateLevel(seed, 8, 'band-9-12');
      const typing = level.targets.some((target) => target.kind === 'text');
      expect(level.desktop.settings.computerName).toBe(typing ? '' : 'My computer');
    }
  });
});

const base = generateLevel(1, 1, 'band-6-8').desktop;
const named = (computerName: string) => ({ ...base, settings: { ...base.settings, computerName } });
const changed = (patch: Partial<DesktopState['settings']>) => ({ ...base, settings: { ...base.settings, ...patch } });

const withBrightness = (brightness: number) => ({ ...base, settings: { ...base.settings, brightness } });

describe('isMatched', () => {
  it('takes the lowest brightness only at the bottom, and the middle within one slider step', () => {
    expect(isMatched(withBrightness(BRIGHTNESS.min), { kind: 'slider', value: 'lowest' })).toBe(true);
    expect(isMatched(withBrightness(BRIGHTNESS.min + 10), { kind: 'slider', value: 'lowest' })).toBe(false);
    for (const [value, expected] of [
      [40, false],
      [50, true],
      [60, true],
      [70, true],
      [80, false],
    ] as const) {
      expect(isMatched(withBrightness(value), { kind: 'slider', value: 'middle' }), String(value)).toBe(expected);
    }
  });

  it('takes a typed name in any case with spaces around it, and nothing else', () => {
    expect(isMatched(named(' fOX '), { kind: 'text', value: 'Fox' })).toBe(true);
    expect(isMatched(named('Fo'), { kind: 'text', value: 'Fox' })).toBe(false);
    expect(isMatched(named('Foxy'), { kind: 'text', value: 'Fox' })).toBe(false);
  });

  it('compares each other control with its own setting', () => {
    expect(isMatched(changed({ showNames: false }), { kind: 'checkbox', value: false })).toBe(true);
    expect(isMatched(changed({ showNames: true }), { kind: 'checkbox', value: false })).toBe(false);
    expect(isMatched(changed({ wallpaper: 'pond' }), { kind: 'radio', value: 'pond' })).toBe(true);
    expect(isMatched(changed({ wallpaper: 'hills' }), { kind: 'radio', value: 'pond' })).toBe(false);
    expect(isMatched(changed({ iconSize: 'large' }), { kind: 'dropdown', value: 'large' })).toBe(true);
    expect(isMatched(changed({ iconSize: 'small' }), { kind: 'dropdown', value: 'large' })).toBe(false);
    expect(isMatched(changed({ alertSound: 'frog' }), { kind: 'list', value: 'frog' })).toBe(true);
    expect(isMatched(changed({ alertSound: 'harp' }), { kind: 'list', value: 'frog' })).toBe(false);
  });
});

describe('controls steps', () => {
  it('says the control and the value for each kind', () => {
    expect(targetInstruction({ kind: 'checkbox', value: true })).toEqual([strings.namesOn]);
    expect(targetInstruction({ kind: 'checkbox', value: false })).toEqual([strings.namesOff]);
    expect(targetInstruction({ kind: 'radio', value: 'pond' }).map((handle) => handle.id)).toEqual([
      strings.chooseBackground.id,
      'toy-desktop.pond',
    ]);
    expect(targetInstruction({ kind: 'dropdown', value: 'large' })[0]).toBe(strings.chooseIconSize);
    expect(targetInstruction({ kind: 'slider', value: 'lowest' })).toEqual([strings.brightnessLowest]);
    expect(targetInstruction({ kind: 'slider', value: 'middle' })).toEqual([strings.brightnessMiddle]);
    expect(targetInstruction({ kind: 'text', value: 'Owl' })).toEqual([strings.typeName, strings.owl]);
    expect(targetInstruction({ kind: 'list', value: 'frog' }).map((handle) => handle.id)).toEqual([
      strings.chooseSound.id,
      'toy-desktop.frog',
    ]);
  });

  it('counts another option from the dropdown or the list as a try, with the reason', () => {
    const level: ControlsLevel = {
      ...generateLevel(1, 1, 'band-6-8'),
      targets: [
        { kind: 'dropdown', value: 'large' },
        { kind: 'list', value: 'frog' },
      ],
    };
    const [dropdown, list] = controlSteps(level);
    if (dropdown === undefined || list === undefined) throw new Error('two steps');
    const run = (action: DesktopAction) => reduce(level.desktop, action, env());
    const small = settings({ type: 'set-icon-size', value: 'small' });
    expect(dropdown.wrong?.(run(small), small)).toBe(true);
    const large = settings({ type: 'set-icon-size', value: 'large' });
    expect(dropdown.wrong?.(run(large), large)).toBe(false);
    const harp = settings({ type: 'set-alert-sound', value: 'harp' });
    expect(list.wrong?.(run(harp), harp)).toBe(true);
    expect(dropdown.wrong?.(run(harp), harp)).toBe(false);
    expect(dropdown.nudge).toBe(strings.otherChoice);
  });

  it('counts no try for radio buttons, a slider passing by, or another control', () => {
    const level: ControlsLevel = {
      ...generateLevel(1, 1, 'band-6-8'),
      targets: [
        { kind: 'radio', value: 'pond' },
        { kind: 'slider', value: 'middle' },
      ],
    };
    const [radio, slider] = controlSteps(level);
    if (radio === undefined || slider === undefined) throw new Error('two steps');
    const run = (action: DesktopAction) => reduce(level.desktop, action, env());
    // Arrow keys pass through radio buttons, so another background is no try.
    const hills = settings({ type: 'set-wallpaper', value: 'hills' });
    expect(radio.wrong?.(run(hills), hills)).toBe(false);
    const pond = settings({ type: 'set-wallpaper', value: 'pond' });
    expect(radio.wrong?.(run(pond), pond)).toBe(false);
    const icons = settings({ type: 'set-icon-size', value: 'large' });
    expect(radio.wrong?.(run(icons), icons)).toBe(false);
    const passing = settings({ type: 'set-brightness', value: 90 });
    expect(slider.wrong?.(run(passing), passing)).toBe(false);
    expect(radio.hint?.(level.desktop)).toEqual({ kind: 'key', key: 'setting:wallpaper' });
    expect(slider.hint?.(level.desktop)).toEqual({ kind: 'key', key: 'setting:brightness' });
  });
});

describe('controls desktop', () => {
  it('starts every setting at the panel default, away from any value a card asks for', () => {
    const { showNames: _names, computerName: _name, ...rest } = generateLevel(1, 8, 'band-9-12').desktop.settings;
    expect(rest).toEqual({ wallpaper: 'meadow', iconSize: 'medium', brightness: 100, alertSound: 'bell' });
  });

  it('starts the names shown in some rounds and hidden in others', () => {
    const starts = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-6-8').desktop.settings.showNames));
    expect(starts).toEqual(new Set([true, false]));
  });

  it('shows the settings window and two icons, so names and icon size show what they change', () => {
    const level = generateLevel(1, 1, 'band-6-8');
    expect(level.desktop.windows.map((window) => window.app.kind)).toEqual(['settings']);
    expect(withDefaults(level.parts)).toEqual({
      // No close button, so Close leaves the menus and shortcuts too.
      hiddenCommands: ['close'],
      icons: [{ app: 'notepad' }, { app: 'music-box' }],
      menuBar: false,
      taskStrip: false,
      launcher: [],
      windowControls: [],
      move: false,
      resize: false,
      openMaximized: false,
      systemSound: false,
    });
  });

  it.each([
    ['checkbox', 'setting:showNames'],
    ['radio', 'setting:wallpaper'],
    ['dropdown', 'setting:iconSize'],
    ['slider', 'setting:brightness'],
    ['text', 'setting:computerName'],
    ['list', 'setting:alertSound'],
  ] as const)('points at the %s row of the panel', (kind, key) => {
    const level = SEEDS.map((seed) => generateLevel(seed, 8, 'band-9-12')).find(
      (each) => each.targets[0]?.kind === kind,
    );
    if (level === undefined) throw new Error(`no round starts with ${kind}`);
    expect(controlSteps(level)[0]?.hint?.(level.desktop)).toEqual({ kind: 'key', key });
  });
});
