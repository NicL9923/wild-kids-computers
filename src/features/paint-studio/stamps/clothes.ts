import { defineStampCategory } from '../stampCategory.ts';
import { strings } from './strings.ts';

export default defineStampCategory({
  id: 'clothes',
  order: 80,
  title: strings.clothes,
  icon: 'crown',
  stamps: [
    'shirt',
    'jeans',
    'shorts',
    'dress',
    'coat',
    'scarf',
    'gloves',
    'socks',
    'cap',
    'top-hat',
    'crown',
    'sneaker',
    'boot',
    'rain-boot',
    'flip-flop',
    'glasses',
    'sunglasses',
    'tie',
    'swimsuit',
  ],
});
