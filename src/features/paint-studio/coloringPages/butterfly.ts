import mask from '../../../../assets/coloring/butterfly.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/butterfly.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'butterfly',
  order: 10,
  title: 'Butterfly',
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 999 },
  regions: [
    { x: 799, y: 245 },
    { x: 429, y: 319 },
    { x: 1169, y: 319 },
    { x: 799, y: 386 },
    { x: 607, y: 432 },
    { x: 992, y: 432 },
    { x: 490, y: 735 },
    { x: 1109, y: 735 },
  ],
});
