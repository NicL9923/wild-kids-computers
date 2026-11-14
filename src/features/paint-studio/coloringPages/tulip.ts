import mask from '../../../../assets/coloring/tulip.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/tulip.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'tulip',
  order: 70,
  title: 'Tulip',
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 654, y: 237 },
    { x: 945, y: 237 },
    { x: 799, y: 314 },
    { x: 943, y: 624 },
    { x: 660, y: 649 },
    { x: 642, y: 797 },
    { x: 707, y: 907 },
  ],
});
