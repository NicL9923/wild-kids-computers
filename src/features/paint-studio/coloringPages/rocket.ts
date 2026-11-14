import mask from '../../../../assets/coloring/rocket.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/rocket.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'rocket',
  order: 90,
  title: 'Rocket',
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 799, y: 245 },
    { x: 799, y: 529 },
    { x: 741, y: 688 },
    { x: 591, y: 736 },
    { x: 1008, y: 736 },
    { x: 799, y: 840 },
  ],
});
