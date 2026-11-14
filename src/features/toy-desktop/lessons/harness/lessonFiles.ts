/**
 * Plain, neutral files lessons fill their folders with. Each picture names bundled art, so a child
 * who cannot read yet still knows a fox picture by the fox.
 */
import { note, picture, tune, type FileSpec } from '../../model/build.ts';
import type { SAMPLE_PICTURE_IDS } from '../../model/sampleContent.ts';

export type LessonPictureId = (typeof SAMPLE_PICTURE_IDS)[number];

/** Each bundled picture and the file name it gets. A name says what the picture shows. */
export const LESSON_PICTURES: readonly { readonly id: LessonPictureId; readonly name: string }[] = [
  { id: 'fox', name: 'Fox' },
  { id: 'sunflower', name: 'Sunflower' },
  { id: 'sailboat', name: 'Boat' },
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'butterfly', name: 'Butterfly' },
  { id: 'tractor', name: 'Tractor' },
];

const LESSON_NOTES: readonly { readonly name: string; readonly text: string }[] = [
  { name: 'Shopping list', text: 'apples\nbread\nmilk' },
  { name: 'Animal names', text: 'fox\nowl\nfrog' },
  { name: 'Birthday ideas', text: 'a kite\na book' },
  { name: 'Garden plan', text: 'beans by the fence' },
  { name: 'Joke book', text: 'Why did the frog sit down?' },
  { name: 'Spelling words', text: 'river\ncloud\nseven' },
  { name: 'Story start', text: 'Once a small owl woke up.' },
  { name: 'Pet names', text: 'Biscuit\nPip\nMoss' },
];

export const LESSON_TUNES: readonly { readonly name: string; readonly on: readonly (readonly [number, number])[] }[] = [
  {
    name: 'Raindrops',
    on: [
      [0, 4],
      [2, 3],
      [4, 4],
    ],
  },
  {
    name: 'Up the hill',
    on: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  },
  {
    name: 'Frog dance',
    on: [
      [0, 1],
      [3, 1],
      [5, 3],
    ],
  },
  {
    name: 'Moon song',
    on: [
      [1, 4],
      [3, 2],
      [6, 0],
    ],
  },
];

/** The file kinds lessons sort, and the folder each belongs in. */
export const FILE_KINDS_IN_FOLDERS = [
  { kind: 'picture', folder: 'Pictures' },
  { kind: 'tune', folder: 'Music' },
  { kind: 'note', folder: 'Notes' },
] as const;

export type LessonFileKind = (typeof FILE_KINDS_IN_FOLDERS)[number]['kind'];

/** A file's name and content, ready for a `buildDesktop` tree. */
export interface NamedFile {
  readonly name: string;
  readonly kind: LessonFileKind;
  readonly spec: FileSpec;
}

/** Every lesson file of one kind, in a stable order. */
export function filesOfKind(kind: LessonFileKind): NamedFile[] {
  switch (kind) {
    case 'picture':
      return LESSON_PICTURES.map(({ id, name }) => ({ name, kind, spec: picture(id) }));
    case 'tune':
      return LESSON_TUNES.map(({ name, on }) => ({ name, kind, spec: tune(on) }));
    // 'note', the last kind.
    default:
      return LESSON_NOTES.map(({ name, text }) => ({ name, kind, spec: note(text) }));
  }
}
