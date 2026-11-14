import mask from '../../../../assets/coloring/sunflower.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/sunflower.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'sunflower',
  order: 190,
  title: 'Sunflower',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 799, y: 144 },
    { x: 882, y: 169 },
    { x: 718, y: 171 },
    { x: 650, y: 220 },
    { x: 773, y: 220 },
    { x: 949, y: 220 },
    { x: 611, y: 297 },
    { x: 986, y: 297 },
    { x: 799, y: 339 },
    { x: 615, y: 381 },
    { x: 981, y: 381 },
    { x: 654, y: 456 },
    { x: 945, y: 456 },
    { x: 718, y: 508 },
    { x: 881, y: 508 },
    { x: 799, y: 525 },
    { x: 799, y: 648 },
    { x: 961, y: 716 },
    { x: 642, y: 778 },
  ],
});
