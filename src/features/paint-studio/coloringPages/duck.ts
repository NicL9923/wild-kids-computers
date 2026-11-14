import mask from '../../../../assets/coloring/duck.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/duck.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'duck',
  order: 40,
  title: strings.duck,
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 1260, y: 338 },
    { x: 1040, y: 374 },
    { x: 469, y: 626 },
    { x: 724, y: 630 },
    { x: 1102, y: 813 },
  ],
});
