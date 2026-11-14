import mask from '../../../../assets/coloring/bee.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/bee.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'bee',
  order: 110,
  title: strings.bee,
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 884, y: 251 },
    { x: 653, y: 289 },
    { x: 677, y: 456 },
    { x: 1075, y: 467 },
    { x: 814, y: 500 },
    { x: 556, y: 547 },
    { x: 955, y: 547 },
    { x: 466, y: 559 },
    { x: 249, y: 611 },
    { x: 171, y: 653 },
    { x: 328, y: 653 },
    { x: 249, y: 699 },
    { x: 177, y: 741 },
    { x: 322, y: 741 },
    { x: 249, y: 783 },
    { x: 333, y: 884 },
  ],
});
