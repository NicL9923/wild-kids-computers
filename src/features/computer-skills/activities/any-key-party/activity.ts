import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_PARTY_DIFFICULTY, type PartyLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<PartyLevel>({
  id: 'any-key-party',
  area: 'computer-skills',
  order: 120,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'balloon' },
  kind: 'rounds',
  inputs: ['keyboard'],
  difficulty: { 'band-3-5': { min: 1, max: MAX_PARTY_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.useKeys],
  load: () => import('./AnyKeyPartyActivity.tsx'),
});
