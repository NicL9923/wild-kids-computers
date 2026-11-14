import { defineStrings } from '../../../core/strings/defineStrings.ts';

/**
 * Everything the toy desktop shows or says. Names are the plain, generic words most computers
 * share. A control speaks its name when the pointer rests on it or it gets focus, below
 * `band-9-12`, so a child who cannot read yet still hears what it does.
 */
export const strings = defineStrings('toy-desktop', {
  // The computer itself.
  screen: { text: 'Toy computer' },
  desktop: { text: 'Desktop' },
  menuBar: { text: 'Menu bar' },
  taskStrip: { text: 'Open windows' },
  apps: { text: 'Apps' },
  sound: { text: 'Sound' },
  volume: { text: 'Volume' },

  // Apps.
  notepad: { text: 'Notepad' },
  pictureViewer: { text: 'Picture viewer' },
  fileExplorer: { text: 'Files' },
  musicBox: { text: 'Music box' },
  calculator: { text: 'Calculator' },
  settings: { text: 'Settings' },

  // Places and kinds of things.
  home: { text: 'Home' },
  trash: { text: 'Trash' },
  folder: { text: 'Folder' },
  note: { text: 'Note' },
  picture: { text: 'Picture' },
  tune: { text: 'Tune' },

  // Window controls.
  close: { text: 'Close' },
  minimize: { text: 'Minimize' },
  maximize: { text: 'Maximize' },
  restoreSize: { text: 'Restore size' },
  moveHint: { text: 'Pick up the title to move the window.' },
  resize: { text: 'Resize' },
  unsaved: { text: 'Not saved yet' },

  // Menus.
  menuFile: { text: 'File' },
  menuEdit: { text: 'Edit' },
  menuView: { text: 'View' },
  menuGo: { text: 'Go' },
  menuPlay: { text: 'Play' },

  // Commands.
  new: { text: 'New' },
  open: { text: 'Open' },
  save: { text: 'Save' },
  saveAs: { text: 'Save as' },
  undo: { text: 'Undo' },
  redo: { text: 'Redo' },
  cut: { text: 'Cut' },
  copy: { text: 'Copy' },
  paste: { text: 'Paste' },
  selectAll: { text: 'Select all' },
  newFolder: { text: 'New folder' },
  rename: { text: 'Rename' },
  delete: { text: 'Delete' },
  restore: { text: 'Restore' },
  emptyTrash: { text: 'Empty trash' },
  goUp: { text: 'Go up' },
  previous: { text: 'Previous' },
  next: { text: 'Next' },
  play: { text: 'Play' },
  stop: { text: 'Stop' },
  clear: { text: 'Clear' },

  // Keys shown beside menu commands.
  keyControl: { text: 'Ctrl' },
  keyCommand: { text: 'Command' },
  keyShift: { text: 'Shift' },
  keyDelete: { text: 'Delete' },
  keySpace: { text: 'Space' },
  keyUp: { text: 'Up arrow' },
  keyLeft: { text: 'Left arrow' },
  keyRight: { text: 'Right arrow' },

  // Save and open.
  name: { text: 'Name' },
  cancel: { text: 'Cancel' },
  replace: { text: 'Replace' },
  replaceQuestion: { text: 'Something here has that name. Replace it?' },
  emptyFolder: { text: 'Nothing is in this folder yet.' },

  // Gentle words when something cannot happen.
  nameEmpty: { text: 'Type a name first.' },
  nameTooLong: { text: 'That name is long. Try a shorter one.' },
  nameMark: { text: 'Names use letters and numbers. Try without that mark.' },
  nameOnlyDots: { text: 'Add a letter to the name.' },
  nameTaken: { text: 'That name is here already. Try another name.' },
  computerFull: { text: 'This computer is full. Put something in the trash first.' },
  tooManyWindows: { text: 'Lots of windows are open. Close one first.' },
  cannotHere: { text: 'That does not go there.' },

  // Notepad.
  noteText: { text: 'Note text' },

  // Picture viewer.
  openPicture: { text: 'Open a picture' },
  noPicture: { text: 'No picture yet.' },
  pictureGone: { text: 'This picture is not here now.' },

  // File explorer.
  search: { text: 'Search' },
  places: { text: 'Places' },
  noMatches: { text: 'Nothing has that name.' },
  moveItem: { text: 'Move' },

  // Music box.
  musicGrid: { text: 'Notes' },
  noteHighest: { text: 'Highest note' },
  noteHigh: { text: 'High note' },
  noteMiddle: { text: 'Middle note' },
  noteLow: { text: 'Low note' },
  noteLowest: { text: 'Lowest note' },

  // Calculator.
  display: { text: 'Display' },
  plus: { text: 'Plus' },
  minus: { text: 'Minus' },
  times: { text: 'Times' },
  dividedBy: { text: 'Divided by' },
  equals: { text: 'Equals' },
  // The decimal point key, not a score.
  point: { text: 'Point', allow: ['point'] },
  back: { text: 'Back' },
  divideByZero: { text: 'Nothing can be shared into zero groups. Press a key to start again.' },
  tooBig: { text: 'That number is too big for this calculator. Press a key to start again.' },

  // Settings.
  showNames: { text: 'Show names under icons' },
  background: { text: 'Background' },
  meadow: { text: 'Meadow' },
  pond: { text: 'Pond' },
  hills: { text: 'Hills' },
  nightSky: { text: 'Night sky' },
  iconSize: { text: 'Icon size' },
  small: { text: 'Small' },
  medium: { text: 'Medium' },
  large: { text: 'Large' },
  brightness: { text: 'Brightness' },
  computerName: { text: 'Computer name' },
  alertSound: { text: 'Alert sound' },
  scrollUp: { text: 'Scroll up' },
  scrollDown: { text: 'Scroll down' },
  bell: { text: 'Bell' },
  chirp: { text: 'Chirp' },
  drum: { text: 'Drum' },
  pop: { text: 'Pop' },
  whistle: { text: 'Whistle' },
  harp: { text: 'Harp' },
  splash: { text: 'Splash' },
  ding: { text: 'Ding' },
  frog: { text: 'Frog' },
  bubbles: { text: 'Bubbles' },
  chime: { text: 'Chime' },
  woodBlock: { text: 'Wood block' },
});
