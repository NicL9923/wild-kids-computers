import mask from '../../../../assets/coloring/fox.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/fox.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'fox',
  order: 150,
  title: 'Fox',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 999 },
  regions: [
    { x: 1356, y: 171 },
    { x: 659, y: 205 },
    { x: 940, y: 205 },
    { x: 1336, y: 214 },
    { x: 281, y: 217 },
    { x: 301, y: 260 },
    { x: 799, y: 283 },
    { x: 718, y: 465 },
    { x: 1288, y: 552 },
    { x: 799, y: 633 },
    { x: 1315, y: 656 },
    { x: 943, y: 710 },
    { x: 337, y: 719 },
    { x: 315, y: 759 },
  ],
});
