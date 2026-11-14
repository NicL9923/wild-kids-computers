import { defineStampCategory } from '../stampCategory.ts';
import { strings } from './strings.ts';

export default defineStampCategory({
  id: 'places',
  order: 90,
  title: strings.places,
  icon: 'house',
  stamps: [
    'house',
    'school',
    'hospital',
    'castle',
    'store',
    'tent',
    'ferris-wheel',
    'roller-coaster',
    'circus-tent',
    'slide',
    'beach',
    'park',
    'city',
    'map',
  ],
});
