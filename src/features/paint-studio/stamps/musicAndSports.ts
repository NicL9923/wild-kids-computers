import { defineStampCategory } from '../stampCategory.ts';
import { strings } from './strings.ts';

export default defineStampCategory({
  id: 'musicAndSports',
  order: 100,
  title: strings.musicAndSports,
  icon: 'guitar',
  stamps: [
    'guitar',
    'violin',
    'trumpet',
    'saxophone',
    'drum',
    'piano',
    'flute',
    'maracas',
    'music-note',
    'microphone',
    'headphones',
    'soccer-ball',
    'basketball',
    'baseball',
    'football',
    'tennis-ball',
    'volleyball',
    'bowling',
    'badminton',
    'ice-skate',
    'sled',
  ],
});
