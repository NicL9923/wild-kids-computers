import mask from '../../../../assets/coloring/apple-and-pear.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/apple-and-pear.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'apple-and-pear',
  order: 60,
  title: strings.appleAndPear,
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 1224, y: 189 },
    { x: 702, y: 204 },
    { x: 577, y: 576 },
    { x: 1112, y: 691 },
  ],
});
