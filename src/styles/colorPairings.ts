import type { ContrastUse } from './contrast.ts';

/**
 * Every color pairing that carries text or a meaningful graphic. colorPairings.test.ts reads the
 * values from tokens.css and checks each pairing against WCAG 2.2 AA. When you add a color token
 * that text or an icon uses, add its pairings here. The test fails on a text, border, focus, or
 * mark token that no pairing uses.
 */
export interface ColorPairing {
  foreground: string;
  background: string;
  use: ContrastUse;
  where: string;
}

const pair = (foreground: string, background: string, use: ContrastUse, where: string): ColorPairing => ({
  foreground,
  background,
  use,
  where,
});

const PROFILE_COLOR_IDS = ['sun', 'marigold', 'poppy', 'sky', 'lake', 'fern', 'clover', 'night'] as const;

export const COLOR_PAIRINGS: readonly ColorPairing[] = [
  pair('--wk-color-text', '--wk-color-page', 'text', 'body text on the page'),
  pair('--wk-color-text', '--wk-color-surface', 'text', 'text on panels, dialogs, and secondary buttons'),
  pair('--wk-color-text', '--wk-color-surface-sunken', 'text', 'text in wells and unselected segments'),
  pair('--wk-color-text', '--wk-color-selected', 'text', 'the selected segment label'),
  pair('--wk-color-text-muted', '--wk-color-page', 'text', 'hints on the page'),
  pair('--wk-color-text-muted', '--wk-color-surface', 'text', 'hints in dialogs and fields'),
  pair('--wk-color-text-muted', '--wk-color-surface-sunken', 'text', 'hints in wells'),
  pair('--wk-color-on-primary', '--wk-color-primary', 'text', 'primary button label'),
  pair('--wk-color-on-primary', '--wk-color-primary-hover', 'text', 'primary button label on hover'),
  pair('--wk-color-on-accent', '--wk-color-accent', 'text', 'text on the sunflower accent'),
  pair('--wk-color-on-danger', '--wk-color-danger', 'text', 'destructive button label'),
  pair('--wk-color-on-danger', '--wk-color-danger-hover', 'text', 'destructive button label on hover'),
  pair('--wk-color-on-success', '--wk-color-success', 'text', 'text on a success fill'),
  pair('--wk-color-danger', '--wk-color-surface', 'text', 'a field error message'),
  pair('--wk-color-danger', '--wk-color-page', 'text', 'an error message on the page'),
  pair('--wk-color-primary', '--wk-color-surface', 'text', 'a primary-colored label or icon on a panel'),
  pair('--wk-color-primary', '--wk-color-page', 'text', 'a primary-colored label or icon on the page'),
  pair('--wk-color-border', '--wk-color-surface', 'graphic', 'control boundary on a panel'),
  pair('--wk-color-border', '--wk-color-page', 'graphic', 'control boundary on the page'),
  pair('--wk-color-border', '--wk-color-surface-sunken', 'graphic', 'control boundary in a well'),
  pair('--wk-color-primary', '--wk-color-selected', 'graphic', 'the selected segment outline and check'),
  pair('--wk-color-primary', '--wk-color-surface-sunken', 'graphic', 'a switch that is on, against its well'),
  pair('--wk-color-focus', '--wk-color-page', 'graphic', 'focus ring on the page'),
  pair('--wk-color-focus', '--wk-color-surface', 'graphic', 'focus ring in a panel or dialog'),
  pair('--wk-color-focus', '--wk-color-surface-sunken', 'graphic', 'focus ring in a well'),
  pair('--wk-color-focus', '--wk-color-meadow-sky', 'graphic', 'focus ring on the home map sky'),
  pair('--wk-color-focus', '--wk-color-meadow-grass', 'graphic', 'focus ring on the home map grass'),
  pair('--wk-color-text', '--wk-color-meadow-grass', 'text', 'anything written straight on the meadow'),
  ...PROFILE_COLOR_IDS.map((id) =>
    pair(`--wk-profile-${id}-mark`, `--wk-profile-${id}`, 'graphic', `the shape on the ${id} profile color`),
  ),
];
