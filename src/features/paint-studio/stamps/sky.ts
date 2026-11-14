import { defineStampCategory } from '../stampCategory.ts';
import { strings } from './strings.ts';

export default defineStampCategory({
  id: 'sky',
  order: 50,
  title: strings.sky,
  icon: 'sun-and-cloud',
  stamps: [
    'sun',
    'sun-and-cloud',
    'cloud',
    'rain',
    'storm',
    'snow',
    'lightning',
    'snowflake',
    'snowman',
    'rainbow',
    'umbrella-in-the-rain',
    'wind',
    'moon',
    'full-moon',
    'star',
    'shooting-star',
    'planet',
    'earth',
  ],
});
