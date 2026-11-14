import mask from '../../../../assets/coloring/mushroom-house.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/mushroom-house.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'mushroom-house',
  order: 200,
  title: strings.mushroomHouse,
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 759, y: 269 },
    { x: 979, y: 329 },
    { x: 559, y: 379 },
    { x: 845, y: 409 },
    { x: 1139, y: 419 },
    { x: 449, y: 439 },
    { x: 612, y: 617 },
    { x: 657, y: 617 },
    { x: 942, y: 617 },
    { x: 987, y: 617 },
    { x: 612, y: 662 },
    { x: 657, y: 662 },
    { x: 942, y: 662 },
    { x: 987, y: 662 },
    { x: 799, y: 663 },
    { x: 746, y: 708 },
    { x: 853, y: 708 },
    { x: 631, y: 783 },
    { x: 438, y: 919 },
    { x: 1238, y: 919 },
  ],
});
