/**
 * The Zod schema for a saved toy desktop. Structure is checked strictly, so bad saved data is
 * set aside and replaced with defaults by `loadDocument`. Details that can drift without being
 * wrong, such as a window outside a smaller desktop or a selection of a removed file, are
 * repaired on load instead. Undo history and playback are not saved: they start empty and
 * stopped, which keeps the document small.
 */
import { z } from 'zod';
import { activityStateDocument } from '../../../core/storage/schemas.ts';
import { CALCULATOR_MAX_DIGITS, OPERATORS, type CalculatorState } from './apps/calculator.ts';
import {
  ALERT_SOUNDS,
  BRIGHTNESS,
  COMPUTER_NAME_MAX_LENGTH,
  ICON_SIZES,
  LIST_VISIBLE_ROWS,
  WALLPAPERS,
  type SettingsPanelState,
  type ToySettings,
} from './apps/settingsPanel.ts';
import { TUNE_NOTES, TUNE_STEPS, type Tune } from './apps/tune.ts';
import { COMMAND_IDS } from './commands.ts';
import { repairWindows } from './desktop.ts';
import { ancestry, HOME_ID, MAX_NODES, MAX_NOTE_LENGTH, TRASH_ID, type FileSystem, type FsNode } from './fileSystem.ts';
import { clampDesktopSize, clampWindowRect } from './geometry.ts';
import { checkName, sameName } from './names.ts';
import { sampleDesktop } from './sampleContent.ts';
import {
  APP_KINDS,
  MAX_WINDOWS,
  topVisibleWindow,
  type AppState,
  type DesktopState,
  type FileDialog,
  type WindowState,
} from './state.ts';
import type { TextEditorState } from './textEditor.ts';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'must be a short lowercase id');

const dimension = z.number().finite().min(-100_000).max(100_000);

/** A note can be up to `MAX_NOTE_LENGTH` characters, and one character is at most two UTF-16 units. */
const noteText = z.string().max(MAX_NOTE_LENGTH * 2);

const nodeName = z.string().refine((name) => {
  const check = checkName(name, []);
  return check.ok && check.name === name;
}, 'must follow the name rules');

const editorSchema = z
  .object({
    text: noteText,
    anchor: z.int().min(0),
    caret: z.int().min(0),
    multiline: z.boolean(),
    maxLength: z.int().min(1).max(MAX_NOTE_LENGTH),
  })
  .refine((editor) => editor.anchor <= editor.text.length && editor.caret <= editor.text.length, {
    message: 'selection must be inside the text',
  })
  .transform((editor): TextEditorState => ({ ...editor, undo: [], redo: [], run: null }));

const tuneSchema = z.object({
  steps: z.array(z.array(z.boolean()).length(TUNE_NOTES)).length(TUNE_STEPS),
}) satisfies z.ZodType<Tune>;

const nodeFields = {
  id,
  name: nodeName,
  parentId: id.nullable(),
  trashedFrom: id.nullable(),
};

const nodeSchema = z.discriminatedUnion('kind', [
  z.object({ ...nodeFields, kind: z.literal('folder') }),
  z.object({ ...nodeFields, kind: z.literal('note'), text: noteText }),
  z.object({ ...nodeFields, kind: z.literal('picture'), pictureId: id }),
  z.object({ ...nodeFields, kind: z.literal('tune'), tune: tuneSchema }),
]) satisfies z.ZodType<FsNode>;

/** Every structural rule the file system operations keep. Returns the first one broken. */
function fileSystemProblem(fs: FileSystem): string | null {
  const nodes = Object.entries(fs.nodes);
  if (nodes.length > MAX_NODES) return `more than ${MAX_NODES} items`;
  for (const rootId of [HOME_ID, TRASH_ID]) {
    const root = fs.nodes[rootId];
    if (root?.kind !== 'folder' || root.parentId !== null) return `${rootId} must be a top folder`;
  }
  for (const [key, node] of nodes) {
    if (key !== node.id) return `item ${key} has id ${node.id}`;
    if (node.id === HOME_ID || node.id === TRASH_ID) continue;
    const parent = node.parentId === null ? undefined : fs.nodes[node.parentId];
    if (parent?.kind !== 'folder') return `item ${key} is not in a folder`;
    if (ancestry(fs, key)[0]?.parentId !== null || ancestry(fs, key).length > MAX_NODES)
      return `item ${key} is in a loop`;
    if (node.trashedFrom !== null && node.parentId !== TRASH_ID)
      return `item ${key} remembers a trash place outside the trash`;
  }
  for (const [key, node] of nodes) {
    if (node.parentId === null || node.parentId === TRASH_ID) continue;
    const twin = nodes.find(
      ([other, sibling]) => other !== key && sibling.parentId === node.parentId && sameName(sibling.name, node.name),
    );
    if (twin !== undefined) return `two items named ${node.name} in one folder`;
  }
  return null;
}

const fileSystemSchema = z.object({ nodes: z.record(id, nodeSchema) }).superRefine((fs, context) => {
  const problem = fileSystemProblem(fs);
  if (problem !== null) context.addIssue({ code: 'custom', message: problem });
});

const dialogSchema = z.object({
  mode: z.enum(['save-as', 'open']),
  folderId: id,
  selectedId: id.nullable(),
  name: editorSchema,
  replaceId: id.nullable(),
}) satisfies z.ZodType<FileDialog>;

const calculatorSchema = z.object({
  kind: z.literal('calculator'),
  display: z
    .string()
    .regex(/^-?\d+(\.\d*)?$/)
    .refine((display) => display.replace(/\D/g, '').length <= CALCULATOR_MAX_DIGITS, 'too many digits'),
  stored: z.number().finite().nullable(),
  pending: z.enum(OPERATORS).nullable(),
  fresh: z.boolean(),
  repeat: z.object({ operator: z.enum(OPERATORS), operand: z.number().finite() }).nullable(),
  problem: z.enum(['divide-by-zero', 'too-big']).nullable(),
}) satisfies z.ZodType<CalculatorState>;

const settingsPanelSchema = z.object({
  kind: z.literal('settings'),
  nameField: editorSchema,
  dropdownOpen: z.boolean(),
  listScroll: z
    .int()
    .min(0)
    .max(ALERT_SOUNDS.length - LIST_VISIBLE_ROWS),
}) satisfies z.ZodType<SettingsPanelState>;

const appSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('notepad'),
    fileId: id.nullable(),
    editor: editorSchema,
    savedText: noteText,
    dialog: dialogSchema.nullable(),
  }),
  z.object({ kind: z.literal('picture-viewer'), fileId: id.nullable(), dialog: dialogSchema.nullable() }),
  z.object({
    kind: z.literal('file-explorer'),
    folderId: id,
    selectedId: id.nullable(),
    search: editorSchema,
    rename: z.object({ nodeId: id, field: editorSchema }).nullable(),
  }),
  z
    .object({
      kind: z.literal('music-box'),
      fileId: id.nullable(),
      tune: tuneSchema,
      savedTune: tuneSchema,
      dialog: dialogSchema.nullable(),
    })
    .transform((app) => ({ ...app, playing: false, position: 0, undo: [], redo: [] })),
  calculatorSchema,
  settingsPanelSchema,
]) satisfies z.ZodType<AppState>;

const windowSchema = z.object({
  id,
  rect: z.object({ x: dimension, y: dimension, width: dimension, height: dimension }),
  minimized: z.boolean(),
  maximized: z.boolean(),
  app: appSchema,
}) satisfies z.ZodType<WindowState>;

const settingsSchema = z.object({
  showNames: z.boolean(),
  wallpaper: z.enum(WALLPAPERS),
  iconSize: z.enum(ICON_SIZES),
  brightness: z
    .int()
    .min(BRIGHTNESS.min)
    .max(BRIGHTNESS.max)
    .refine((value) => value % BRIGHTNESS.step === 0, 'must be on a slider step'),
  computerName: z.string().max(COMPUTER_NAME_MAX_LENGTH * 2),
  alertSound: z.enum(ALERT_SOUNDS),
}) satisfies z.ZodType<ToySettings>;

/** The highest number in ids such as "w12" or "n40", so a loaded desktop never reuses one. */
function highestIdNumber(ids: readonly string[]): number {
  return Math.max(0, ...ids.map((value) => Number(/^[a-z](\d+)$/.exec(value)?.[1] ?? 0)));
}

/** Fixes what may drift without being corrupt: places, focus, the id counter, and stale references. */
function repairLoaded(state: DesktopState): DesktopState {
  const size = clampDesktopSize(state.size);
  const windows = state.windows.map((window) => ({ ...window, rect: clampWindowRect(window.rect, size) }));
  const placed = {
    ...state,
    size,
    windows,
    nextId: Math.max(state.nextId, highestIdNumber(Object.keys(state.fs.nodes)) + 1),
    nextWindowId: Math.max(state.nextWindowId, highestIdNumber(state.windows.map((window) => window.id)) + 1),
  };
  const focused = placed.windows.find((window) => window.id === placed.focusedWindowId && !window.minimized);
  const focusedWindowId = focused?.id ?? topVisibleWindow(placed)?.id ?? null;
  return repairWindows({ ...placed, focusedWindowId });
}

export const desktopStateSchema = z
  .object({
    size: z.object({ width: dimension, height: dimension }),
    windows: z
      .array(windowSchema)
      .max(MAX_WINDOWS)
      .refine(
        (windows) => new Set(windows.map((window) => window.id)).size === windows.length,
        'window ids must be unique',
      ),
    focusedWindowId: id.nullable(),
    fs: fileSystemSchema,
    system: z.object({ volume: z.int().min(0).max(100), muted: z.boolean() }),
    settings: settingsSchema,
    lastCommand: z.object({ command: z.enum(COMMAND_IDS), app: z.enum(APP_KINDS) }).nullable(),
    nextId: z.int().min(1),
    nextWindowId: z.int().min(1),
  })
  .transform(repairLoaded) satisfies z.ZodType<DesktopState>;

/** The saved document for the toy desktop's free play, one per profile. */
export const desktopDocument = activityStateDocument<DesktopState>({
  schema: desktopStateSchema,
  defaults: sampleDesktop,
});
