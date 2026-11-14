import mask from '../../../../assets/coloring/rainbow.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/rainbow.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'rainbow',
  order: 80,
  title: 'Rainbow',
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 1429, y: 169 },
    { x: 616, y: 222 },
    { x: 645, y: 328 },
    { x: 674, y: 434 },
    { x: 711, y: 538 },
    { x: 300, y: 755 },
    { x: 1299, y: 755 },
  ],
});
