import mask from '../../../../assets/coloring/turtle.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/turtle.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';

export default defineColoringPage({
  id: 'turtle',
  order: 180,
  title: 'Turtle',
  bands: ['band-6-8', 'band-9-12'],
  mask,
  thumbnail,
  background: { x: 871, y: 0 },
  regions: [
    { x: 1379, y: 169 },
    { x: 339, y: 170 },
    { x: 732, y: 444 },
    { x: 621, y: 494 },
    { x: 878, y: 494 },
    { x: 749, y: 564 },
    { x: 1233, y: 622 },
    { x: 494, y: 632 },
    { x: 878, y: 632 },
    { x: 723, y: 670 },
    { x: 368, y: 701 },
    { x: 427, y: 727 },
    { x: 567, y: 727 },
    { x: 707, y: 727 },
    { x: 847, y: 727 },
    { x: 987, y: 727 },
    { x: 532, y: 815 },
    { x: 932, y: 815 },
  ],
});
