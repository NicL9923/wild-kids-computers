/**
 * What the screen calls each thing in the model, and the picture it shows for it. Model ids are
 * never shown to a child; these maps turn each one into a spoken string and an emoji.
 */
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import type { EmojiId } from '../../../core/strings/shared/emoji.ts';
import type { MenuId } from '../model/appMenus.ts';
import type { AlertSound, IconSize, Wallpaper } from '../model/apps/settingsPanel.ts';
import type { CalculatorProblem } from '../model/apps/calculator.ts';
import type { CommandId, ModifierKey } from '../model/commands.ts';
import type { RejectReason } from '../model/events.ts';
import type { FsNode } from '../model/fileSystem.ts';
import type { SAMPLE_PICTURE_IDS } from '../model/sampleContent.ts';
import type { AppKind } from '../model/state.ts';
import { strings } from './strings.ts';

export const APP_NAMES: Readonly<Record<AppKind, SpokenHandle>> = {
  notepad: strings.notepad,
  'picture-viewer': strings.pictureViewer,
  'file-explorer': strings.fileExplorer,
  'music-box': strings.musicBox,
  calculator: strings.calculator,
  settings: strings.settings,
};

/** The calculator has no emoji of its own, so it draws an original picture instead. */
export const APP_PICTURES: Readonly<Record<AppKind, EmojiId | 'calculator'>> = {
  notepad: 'note',
  'picture-viewer': 'picture',
  'file-explorer': 'folder',
  'music-box': 'music-note',
  calculator: 'calculator',
  settings: 'gear',
};

export const MENU_NAMES: Readonly<Record<MenuId, SpokenHandle>> = {
  file: strings.menuFile,
  edit: strings.menuEdit,
  view: strings.menuView,
  go: strings.menuGo,
  play: strings.menuPlay,
};

export const COMMAND_NAMES: Readonly<Record<CommandId, SpokenHandle>> = {
  new: strings.new,
  open: strings.open,
  save: strings.save,
  'save-as': strings.saveAs,
  close: strings.close,
  undo: strings.undo,
  redo: strings.redo,
  cut: strings.cut,
  copy: strings.copy,
  paste: strings.paste,
  'select-all': strings.selectAll,
  'new-folder': strings.newFolder,
  rename: strings.rename,
  delete: strings.delete,
  restore: strings.restore,
  'empty-trash': strings.emptyTrash,
  'go-up': strings.goUp,
  previous: strings.previous,
  next: strings.next,
  play: strings.play,
  stop: strings.stop,
  clear: strings.clear,
};

export const MODIFIER_NAMES: Readonly<Record<ModifierKey, SpokenHandle>> = {
  command: strings.keyCommand,
  control: strings.keyControl,
  shift: strings.keyShift,
};

/** Keys that are not a letter. A letter key shows itself. */
const KEY_NAMES: Readonly<Record<string, SpokenHandle>> = {
  Delete: strings.keyDelete,
  ' ': strings.keySpace,
  ArrowUp: strings.keyUp,
  ArrowLeft: strings.keyLeft,
  ArrowRight: strings.keyRight,
};

/** The handle that names a key, or null for a letter, which shows as itself. */
export function keyName(key: string): SpokenHandle | null {
  return KEY_NAMES[key] ?? null;
}

/**
 * The sentence for a refused action, or null when the child needs no words: a refused move just
 * goes back, and a command that cannot run is already shown as unavailable.
 */
export function rejectionSentence(reason: RejectReason): SpokenHandle | null {
  switch (reason) {
    case 'empty':
      return strings.nameEmpty;
    case 'too-long':
      return strings.nameTooLong;
    case 'bad-character':
      return strings.nameMark;
    case 'only-dots':
      return strings.nameOnlyDots;
    case 'duplicate':
      return strings.nameTaken;
    case 'full':
      return strings.computerFull;
    case 'too-many-windows':
      return strings.tooManyWindows;
    case 'into-itself':
    case 'in-trash':
    case 'fixed-folder':
    case 'not-a-folder':
    case 'wrong-kind':
      return strings.cannotHere;
    default:
      return null;
  }
}

export const CALCULATOR_PROBLEMS: Readonly<Record<CalculatorProblem, SpokenHandle>> = {
  'divide-by-zero': strings.divideByZero,
  'too-big': strings.tooBig,
};

export const WALLPAPER_NAMES: Readonly<Record<Wallpaper, SpokenHandle>> = {
  meadow: strings.meadow,
  pond: strings.pond,
  hills: strings.hills,
  'night-sky': strings.nightSky,
};

export const ICON_SIZE_NAMES: Readonly<Record<IconSize, SpokenHandle>> = {
  small: strings.small,
  medium: strings.medium,
  large: strings.large,
};

export const ALERT_SOUND_NAMES: Readonly<Record<AlertSound, SpokenHandle>> = {
  bell: strings.bell,
  chirp: strings.chirp,
  drum: strings.drum,
  pop: strings.pop,
  whistle: strings.whistle,
  harp: strings.harp,
  splash: strings.splash,
  ding: strings.ding,
  frog: strings.frog,
  bubbles: strings.bubbles,
  chime: strings.chime,
  'wood-block': strings.woodBlock,
};

/** Music box rows, lowest first, as the model numbers them. */
export const NOTE_ROW_NAMES: readonly SpokenHandle[] = [
  strings.noteLowest,
  strings.noteLow,
  strings.noteMiddle,
  strings.noteHigh,
  strings.noteHighest,
];

type SamplePictureId = (typeof SAMPLE_PICTURE_IDS)[number];

/** The bundled art for each sample picture id. A new sample id fails to compile until it has art. */
const SAMPLE_ART: Readonly<Record<SamplePictureId, EmojiId>> = {
  sunflower: 'sunflower',
  fox: 'fox',
  sailboat: 'sailboat',
  rainbow: 'rainbow',
  butterfly: 'butterfly',
  tractor: 'tractor',
};

function isSamplePicture(pictureId: string): pictureId is SamplePictureId {
  return Object.hasOwn(SAMPLE_ART, pictureId);
}

/** Picture ids that name a painting in the child's gallery start with this. */
export const GALLERY_PICTURE_PREFIX = 'g-';

export type PictureSource =
  | { kind: 'emoji'; id: EmojiId }
  | { kind: 'gallery'; pictureId: string }
  /** An id with no art, such as a painting that was deleted. */
  | { kind: 'missing' };

export function pictureSource(pictureId: string): PictureSource {
  if (isSamplePicture(pictureId)) return { kind: 'emoji', id: SAMPLE_ART[pictureId] };
  if (pictureId.startsWith(GALLERY_PICTURE_PREFIX)) {
    return { kind: 'gallery', pictureId: pictureId.slice(GALLERY_PICTURE_PREFIX.length) };
  }
  return { kind: 'missing' };
}

/** The small picture for a file or folder in a list. */
export function nodePicture(node: FsNode): EmojiId {
  switch (node.kind) {
    case 'folder':
      return node.id === 'trash' ? 'trash-can' : 'folder';
    case 'note':
      return 'note';
    case 'tune':
      return 'music-note';
    default: {
      const source = pictureSource(node.pictureId);
      return source.kind === 'emoji' ? source.id : 'picture';
    }
  }
}

/** The kind of a file or folder, said after its name for a screen reader. */
export function nodeKindName(node: FsNode): SpokenHandle {
  switch (node.kind) {
    case 'folder':
      return strings.folder;
    case 'note':
      return strings.note;
    case 'tune':
      return strings.tune;
    default:
      return strings.picture;
  }
}
