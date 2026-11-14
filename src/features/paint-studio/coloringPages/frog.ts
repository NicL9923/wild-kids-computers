import mask from '../../../../assets/coloring/frog.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/frog.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'frog',
  order: 130,
  title: strings.frog,
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 1404, y: 145 },
    { x: 1487, y: 152 },
    { x: 1411, y: 240 },
    { x: 1485, y: 244 },
    { x: 601, y: 276 },
    { x: 998, y: 276 },
    { x: 677, y: 390 },
    { x: 620, y: 676 },
    { x: 792, y: 729 },
    { x: 516, y: 804 },
    { x: 1083, y: 804 },
    { x: 435, y: 904 },
  ],
});
