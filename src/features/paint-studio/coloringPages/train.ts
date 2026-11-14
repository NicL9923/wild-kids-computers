import mask from '../../../../assets/coloring/train.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/train.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'train',
  order: 210,
  title: 'Train',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 1269, y: 79 },
    { x: 1079, y: 194 },
    { x: 354, y: 314 },
    { x: 984, y: 372 },
    { x: 697, y: 435 },
    { x: 474, y: 454 },
    { x: 689, y: 529 },
    { x: 839, y: 539 },
    { x: 1018, y: 558 },
    { x: 449, y: 609 },
    { x: 349, y: 729 },
    { x: 1170, y: 738 },
    { x: 449, y: 789 },
    { x: 639, y: 789 },
    { x: 889, y: 789 },
    { x: 1049, y: 789 },
    { x: 397, y: 799 },
    { x: 587, y: 799 },
    { x: 846, y: 800 },
    { x: 1006, y: 800 },
  ],
});
