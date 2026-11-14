import mask from '../../../../assets/coloring/cat.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/cat.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'cat',
  order: 50,
  title: strings.cat,
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 175 },
  regions: [
    { x: 797, y: 233 },
    { x: 1286, y: 621 },
    { x: 799, y: 672 },
    { x: 629, y: 725 },
    { x: 688, y: 847 },
    { x: 898, y: 847 },
  ],
});
