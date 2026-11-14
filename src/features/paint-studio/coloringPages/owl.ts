import mask from '../../../../assets/coloring/owl.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/owl.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'owl',
  order: 140,
  title: 'Owl',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 999 },
  regions: [
    { x: 1149, y: 110 },
    { x: 1299, y: 190 },
    { x: 174, y: 231 },
    { x: 799, y: 362 },
    { x: 1459, y: 380 },
    { x: 672, y: 389 },
    { x: 927, y: 389 },
    { x: 799, y: 503 },
    { x: 617, y: 567 },
    { x: 512, y: 626 },
    { x: 1087, y: 626 },
    { x: 700, y: 687 },
    { x: 273, y: 754 },
    { x: 377, y: 839 },
    { x: 1330, y: 913 },
  ],
});
