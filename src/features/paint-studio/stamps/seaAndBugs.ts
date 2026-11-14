import { defineStampCategory } from '../stampCategory.ts';
import { strings } from './strings.ts';

export default defineStampCategory({
  id: 'seaAndBugs',
  order: 20,
  title: strings.seaAndBugs,
  icon: 'tropical-fish',
  stamps: [
    'whale',
    'dolphin',
    'fish',
    'tropical-fish',
    'pufferfish',
    'shark',
    'octopus',
    'crab',
    'lobster',
    'shrimp',
    'seal',
    'jellyfish',
    'shell',
    'snail',
    'butterfly',
    'caterpillar',
    'ant',
    'bee',
    'ladybug',
    'spider',
    'worm',
  ],
});
