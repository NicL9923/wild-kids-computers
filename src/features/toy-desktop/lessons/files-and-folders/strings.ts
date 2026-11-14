import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('files-and-folders', {
  title: { text: 'Files and folders' },
  goal: {
    text: 'Opens folders, moves a file into the folder where it belongs, and makes and names a new folder.',
    silent: 'parent',
  },
  instruction: { text: 'Put a file in its folder, then make a new folder.' },
  goHome: { text: 'First go back home. Click Home.' },
  movePicture: { text: 'Put the picture in the Pictures folder. Click its dots, then click the folder.' },
  moveTune: { text: 'Put the tune in the Music folder. Click its dots, then click the folder.' },
  moveNote: { text: 'Put the note in the Notes folder. Click its dots, then click the folder.' },
  openPictures: { text: 'Now open the Pictures folder to see it there.' },
  openMusic: { text: 'Now open the Music folder to see it there.' },
  openNotes: { text: 'Now open the Notes folder to see it there.' },
  newFolder: { text: 'Make a new folder here. Click New folder.' },
  nameFolder: { text: 'Type a name for the new folder, then press Enter.' },
});
