import mask from '../../../../assets/coloring/ladybug.png?no-inline';
import thumbnail from '../../../../assets/coloring/src/ladybug.svg?no-inline';
import { defineColoringPage } from '../coloringPage.ts';
import { strings } from './strings.ts';

export default defineColoringPage({
  id: 'ladybug',
  order: 20,
  title: strings.ladybug,
  bands: ['band-3-5', 'band-6-8'],
  mask,
  thumbnail,
  background: { x: 0, y: 0 },
  regions: [
    { x: 796, y: 186 },
    { x: 644, y: 469 },
    { x: 954, y: 469 },
    { x: 712, y: 602 },
    { x: 886, y: 602 },
    { x: 629, y: 729 },
    { x: 969, y: 729 },
  ],
});
