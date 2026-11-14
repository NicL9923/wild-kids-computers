import mask from '../../../../assets/coloring/snail.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/snail.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'snail',
  order: 120,
  title: 'Snail',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 966, y: 0 },
  regions: [
    { x: 1359, y: 159 },
    { x: 339, y: 188 },
    { x: 739, y: 451 },
    { x: 1403, y: 563 },
    { x: 1319, y: 594 },
    { x: 1464, y: 614 },
    { x: 1378, y: 616 },
    { x: 1070, y: 667 },
    { x: 1384, y: 727 },
    { x: 223, y: 738 },
    { x: 149, y: 749 },
    { x: 260, y: 766 },
    { x: 189, y: 833 },
  ],
});
