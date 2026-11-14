import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, firstLaunchSteps, missingChoice, profileFromDraft, type ProfileDraft } from './steps.ts';

const COMPLETE: ProfileDraft = { avatarId: 'owl', colorId: 'fern', name: '', band: 'band-6-8' };

describe('first launch steps', () => {
  it('asks for a profile only when none exists yet', () => {
    expect(firstLaunchSteps(false)).toEqual(['animal', 'color', 'band', 'sound', 'kiosk']);
    expect(firstLaunchSteps(true)).toEqual(['sound', 'kiosk']);
  });

  it.each([
    ['animal', EMPTY_DRAFT, 'animal'],
    ['color', { ...COMPLETE, colorId: null }, 'color'],
    ['band', { ...COMPLETE, band: null }, 'band'],
    ['band', COMPLETE, null],
    ['sound', EMPTY_DRAFT, null],
  ] as const)('the %s step with %o is missing %s', (step, draft, missing) => {
    expect(missingChoice(step, draft)).toBe(missing);
  });
});

describe('profile from the draft', () => {
  it('is null until the animal, color, and band are chosen', () => {
    expect(profileFromDraft({ ...COMPLETE, avatarId: null })).toBeNull();
    expect(profileFromDraft({ ...COMPLETE, colorId: null })).toBeNull();
    expect(profileFromDraft({ ...COMPLETE, band: null })).toBeNull();
  });

  it('trims the name and leaves a blank one out', () => {
    expect(profileFromDraft({ ...COMPLETE, name: '  Mia ' })).toEqual({ ...COMPLETE, name: 'Mia' });
    expect(profileFromDraft({ ...COMPLETE, name: '   ' })).toEqual({
      avatarId: 'owl',
      colorId: 'fern',
      band: 'band-6-8',
    });
  });
});
