import mask from '../../../../assets/coloring/rabbit.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/rabbit.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'rabbit',
  order: 160,
  title: 'Rabbit',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 299 },
  regions: [
    { x: 914, y: 154 },
    { x: 685, y: 155 },
    { x: 799, y: 318 },
    { x: 1195, y: 475 },
    { x: 1274, y: 498 },
    { x: 1121, y: 511 },
    { x: 1220, y: 632 },
    { x: 799, y: 698 },
    { x: 1258, y: 739 },
    { x: 642, y: 779 },
    { x: 1282, y: 831 },
    { x: 696, y: 899 },
    { x: 903, y: 899 },
    { x: 619, y: 904 },
    { x: 979, y: 904 },
  ],
});
