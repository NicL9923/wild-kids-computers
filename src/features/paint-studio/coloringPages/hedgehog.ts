import mask from '../../../../assets/coloring/hedgehog.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/hedgehog.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'hedgehog',
  order: 170,
  title: 'Hedgehog',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 892, y: 0 },
  regions: [
    { x: 253, y: 186 },
    { x: 1320, y: 216 },
    { x: 271, y: 230 },
    { x: 1302, y: 260 },
    { x: 1012, y: 644 },
    { x: 1422, y: 660 },
    { x: 1054, y: 743 },
    { x: 819, y: 754 },
    { x: 1354, y: 829 },
    { x: 179, y: 854 },
    { x: 122, y: 864 },
    { x: 530, y: 924 },
    { x: 830, y: 924 },
    { x: 164, y: 932 },
  ],
});
