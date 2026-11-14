import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('trash', {
  title: { text: 'Trash' },
  goal: { text: 'Deletes a file by putting it in the trash, then finds it there and restores it.', silent: 'parent' },
  instruction: { text: 'Put a picture in the trash, then bring it back.' },
  deleteFox: { text: 'Put the fox picture in the trash. Click its dots, then click Trash.' },
  deleteSunflower: { text: 'Put the sunflower picture in the trash. Click its dots, then click Trash.' },
  deleteBoat: { text: 'Put the boat picture in the trash. Click its dots, then click Trash.' },
  deleteRainbow: { text: 'Put the rainbow picture in the trash. Click its dots, then click Trash.' },
  deleteButterfly: { text: 'Put the butterfly picture in the trash. Click its dots, then click Trash.' },
  deleteTractor: { text: 'Put the tractor picture in the trash. Click its dots, then click Trash.' },
  openTrash: { text: 'Now open the trash. Click Trash.' },
  restore: { text: 'Bring the picture back. Click it, then click Restore.' },
});
