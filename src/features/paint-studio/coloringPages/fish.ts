import mask from '../../../../assets/coloring/fish.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/fish.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'fish',
  order: 30,
  title: strings.fish,
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 999 },
  regions: [
    { x: 329, y: 109 },
    { x: 801, y: 229 },
    { x: 229, y: 269 },
    { x: 704, y: 424 },
    { x: 947, y: 499 },
    { x: 1227, y: 499 },
    { x: 510, y: 507 },
    { x: 743, y: 771 },
  ],
});
