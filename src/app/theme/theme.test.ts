// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyTheme, resolveReducedMotion, themeAttributes, type ThemeSettings } from './theme.ts';

const standard: ThemeSettings = {
  band: 'band-3-5',
  textSize: 'standard',
  letterSpacing: 'standard',
  reducedMotion: 'system',
};

describe('themeAttributes', () => {
  it('leaves the standard settings off the root, so tokens.css defaults and the system preference apply', () => {
    expect(themeAttributes(standard)).toEqual({
      'data-band': 'band-3-5',
      'data-text-size': null,
      'data-letter-spacing': null,
      'data-motion': null,
    });
  });

  it('names the larger text, wider spacing, and a forced motion choice', () => {
    expect(
      themeAttributes({ band: 'band-9-12', textSize: 'larger', letterSpacing: 'wide', reducedMotion: 'on' }),
    ).toEqual({
      'data-band': 'band-9-12',
      'data-text-size': 'larger',
      'data-letter-spacing': 'wide',
      'data-motion': 'reduce',
    });
    expect(themeAttributes({ ...standard, reducedMotion: 'off' })['data-motion']).toBe('full');
  });
});

describe('applyTheme', () => {
  it('sets the attributes and its cleanup restores what was there before', () => {
    const root = document.createElement('div');
    root.setAttribute('data-band', 'band-6-8');
    root.setAttribute('data-motion', 'reduce');

    const restore = applyTheme(root, { ...standard, textSize: 'large' });
    expect(root.getAttribute('data-band')).toBe('band-3-5');
    expect(root.getAttribute('data-text-size')).toBe('large');
    expect(root.hasAttribute('data-motion')).toBe(false);

    restore();
    expect(root.getAttribute('data-band')).toBe('band-6-8');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(root.hasAttribute('data-text-size')).toBe(false);
  });
});

describe('resolveReducedMotion', () => {
  it.each([
    { setting: 'system', system: true, reduced: true },
    { setting: 'system', system: false, reduced: false },
    { setting: 'on', system: false, reduced: true },
    { setting: 'off', system: true, reduced: false },
  ] as const)('$setting with the system asking $system gives $reduced', ({ setting, system, reduced }) => {
    expect(resolveReducedMotion(setting, system)).toBe(reduced);
  });
});
