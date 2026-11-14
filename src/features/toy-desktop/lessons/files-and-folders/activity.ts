import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type FilesFoldersLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FilesFoldersLevel>({
  id: 'files-and-folders',
  area: 'toy-desktop',
  order: 50,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'open-folder' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard', 'text-entry'],
  difficulty: {
    'band-6-8': { min: 1, max: 5 },
    'band-9-12': { min: 3, max: 8 },
  },
  roundsPerSession: 3,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.goHome,
    strings.movePicture,
    strings.moveTune,
    strings.moveNote,
    strings.openPictures,
    strings.openMusic,
    strings.openNotes,
    strings.newFolder,
    strings.nameFolder,
  ],
  load: () => import('./FilesAndFoldersActivity.tsx'),
});
