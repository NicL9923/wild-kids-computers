import mask from '../../../../assets/coloring/hot-air-balloon.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/hot-air-balloon.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'hot-air-balloon',
  order: 100,
  title: strings.hotAirBalloon,
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 999 },
  regions: [
    { x: 259, y: 290 },
    { x: 1005, y: 385 },
    { x: 593, y: 399 },
    { x: 799, y: 436 },
    { x: 768, y: 764 },
    { x: 1339, y: 785 },
    { x: 754, y: 894 },
  ],
});
