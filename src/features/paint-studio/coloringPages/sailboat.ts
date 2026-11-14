import mask from '../../../../assets/coloring/sailboat.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/sailboat.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'sailboat',
  order: 220,
  title: 'Sailboat',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 1599, y: 0 },
  regions: [
    { x: 822, y: 138 },
    { x: 1234, y: 168 },
    { x: 189, y: 169 },
    { x: 757, y: 286 },
    { x: 708, y: 397 },
    { x: 899, y: 499 },
    { x: 606, y: 532 },
    { x: 424, y: 669 },
    { x: 636, y: 749 },
    { x: 559, y: 751 },
    { x: 799, y: 751 },
    { x: 1039, y: 751 },
    { x: 203, y: 827 },
  ],
});
