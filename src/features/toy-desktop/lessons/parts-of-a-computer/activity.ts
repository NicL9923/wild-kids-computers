import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type PartsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<PartsLevel>({
  id: 'parts-of-a-computer',
  area: 'toy-desktop',
  order: 120,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'computer' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: 6 },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.screen,
    strings.keyboard,
    strings.mouse,
    strings.trackpad,
    strings.speaker,
    strings.camera,
    strings.findScreen,
    strings.findKeyboard,
    strings.findMouse,
    strings.findTrackpad,
    strings.findSpeaker,
    strings.findCamera,
    strings.clueScreen,
    strings.clueKeyboard,
    strings.clueMouse,
    strings.clueTrackpad,
    strings.clueSpeaker,
    strings.clueCamera,
  ],
  load: () => import('./PartsOfAComputerActivity.tsx'),
});
