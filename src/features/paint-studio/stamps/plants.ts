import { defineStampCategory } from '../stampCategory.ts';
import { strings } from './strings.ts';

export default defineStampCategory({
  id: 'plants',
  order: 40,
  title: strings.plants,
  icon: 'sunflower',
  stamps: [
    'seedling',
    'potted-plant',
    'clover',
    'leaf',
    'tree',
    'pine-tree',
    'palm-tree',
    'cactus',
    'sunflower',
    'tulip',
    'rose',
    'cherry-blossom',
    'flower',
    'bouquet',
    'rock',
    'log',
    'mountain',
    'volcano',
    'island',
    'wave',
    'water-drop',
    'nest',
  ],
});
