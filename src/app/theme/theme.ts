import type { Band } from '../../core/bands.ts';
import type { Settings } from '../../core/storage/schemas.ts';

/** The parts of a profile that change how every screen looks. */
export interface ThemeSettings {
  band: Band;
  textSize: Settings['textSize'];
  letterSpacing: Settings['letterSpacing'];
  reducedMotion: Settings['reducedMotion'];
}

const THEME_ATTRIBUTES = ['data-band', 'data-text-size', 'data-letter-spacing', 'data-motion'] as const;

type ThemeAttribute = (typeof THEME_ATTRIBUTES)[number];

/**
 * The attributes src/styles/tokens.css reads. A null value means the attribute is absent, which
 * is the standard setting: standard text, standard spacing, and motion that follows the system.
 */
export function themeAttributes(settings: ThemeSettings): Record<ThemeAttribute, string | null> {
  return {
    'data-band': settings.band,
    'data-text-size': settings.textSize === 'standard' ? null : settings.textSize,
    'data-letter-spacing': settings.letterSpacing === 'standard' ? null : settings.letterSpacing,
    'data-motion': { system: null, on: 'reduce', off: 'full' }[settings.reducedMotion],
  };
}

/**
 * Sets the theme attributes on an element, normally <html>, so dialogs that portal into <body>
 * get the same tokens. Returns a function that puts back what was there before.
 */
export function applyTheme(element: Element, settings: ThemeSettings): () => void {
  const previous = THEME_ATTRIBUTES.map((name) => [name, element.getAttribute(name)] as const);
  setAttributes(element, themeAttributes(settings));
  return () => setAttributes(element, Object.fromEntries(previous));
}

function setAttributes(element: Element, attributes: Partial<Record<ThemeAttribute, string | null>>): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
}

/** Whether movement is off, from the parent's setting and the operating system preference. */
export function resolveReducedMotion(setting: Settings['reducedMotion'], systemPrefersReduced: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return systemPrefersReduced;
}
