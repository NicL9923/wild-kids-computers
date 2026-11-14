# Toy desktop

A pretend computer inside the app. `model/` is its logic: pure TypeScript with no React, no DOM, and no timers. It never touches real files, the real clipboard, or the real system. Screens, free play, and the lessons build on it.

## The shape

- One state value, `DesktopState`, holds the windows, the pretend file system, sound, and the settings panel's values. It is plain data and saves as one JSON document per profile.
- `reduce(state, action, env)` returns `{ state, events }`. Every change goes through it, so a lesson sees the same events whether the child used a menu, a shortcut, the task strip, or a drag.
- A refused action returns the same state and one `rejected` event with a reason code, such as `duplicate` or `minimized`. A screen turns the code into one short, neutral spoken sentence. Nothing is ever a failure the child must recover from.
- `env.clipboard` is the app's `toyClipboard` from `src/app/inputGuards.ts`. Copy and cut write it and paste reads it. Tests use `createToyClipboard()`. The reducer only writes the same content twice when it runs twice, so it is safe under React's double calls, but dispatch from event handlers rather than from a render.
- Single click opens things. Nothing needs a double-click or a right-click.

## A lesson in a few lines

```ts
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop, note, pathId, picture } from './model/build.ts';
import { reduce } from './model/desktop.ts';
import { hasEvent, isInFolder } from './model/goals.ts';

// The level: a starting desktop.
const start = buildDesktop({
  files: { Pictures: {}, Fox: picture('fox'), 'Shopping list': note('milk') },
  windows: [{ app: 'file-explorer' }],
});

// The child drops the fox on the Pictures folder. A screen sends this from useCarry.
const env = { clipboard: createToyClipboard() };
const { state, events } = reduce(
  start,
  {
    type: 'explorer',
    windowId: 'w1',
    action: { type: 'move', nodeId: pathId(start, 'Fox'), toId: pathId(start, 'Pictures') },
  },
  env,
);

// The goal check.
isInFolder(state, 'Fox', 'Pictures'); // true
hasEvent(events, 'node-moved'); // true
hasEvent(events, 'rejected'); // false
```

Places are paths under home, such as `"Pictures/Fox"`, and names match ignoring case. `""` is home. Window ids are `w1`, `w2`, and on, in the order `buildDesktop` opens them. Use `pathId(state, path)` for a file or folder id.

`reduceAll(state, actions, env)` applies a list and collects every event, which keeps lesson tests short.

## Building a starting desktop

`buildDesktop(spec)` takes:

| Field      | Meaning                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`     | The desktop area. Raised to at least 1024 by 640. The screen scales it to fit.                                                                                              |
| `files`    | A tree. A nested object is a folder. `note(text)`, `picture(pictureId)`, and `tune([[step, note], ...])` make files.                                                        |
| `trash`    | `{ name: { from: 'Notes', item: note('old') } }`: items already in the trash, each remembering its folder.                                                                  |
| `windows`  | In order, front last: `{ app }`, `{ app: 'notepad', text }`, `{ app: 'file-explorer', folder }`, or `{ file }`. Each also takes `at`, `size`, `minimized`, and `maximized`. |
| `focus`    | Index in `windows` of the focused window. Defaults to the front window that is not minimized.                                                                               |
| `system`   | `{ volume, muted }`                                                                                                                                                         |
| `settings` | Any of the settings panel values                                                                                                                                            |

A bad spec, such as a missing path or a duplicate name, throws, because it is an author's mistake. `sampleDesktop()` is the free-play desktop: Notes, Pictures, and Music folders and two pictures at home. `SAMPLE_PICTURE_IDS` lists the art ids a screen must map to images.

## Goal checks

In `model/goals.ts`: `isAppOpen`, `isWindowOpen`, `isAppFocused`, `isWindowFocused`, `isWindowMinimized`, `isWindowMaximized`, `windowsOf`, `windowWithFile`, `isInFolder(state, name, folderPath)`, `folderExists(state, path)`, `isInTrash(state, name)`, `fileExists(state, name)`, `noteContains(state, text, { file? })`, `lastCommandWas(state, command, app?)`, and `hasEvent(events, type, where?)`.

For the "Fix it" lesson, `model/faults.ts` has `applyFault(state, fault)` and `isFaultFixed(state, fault)` for `sound-muted`, `window-minimized`, `window-behind`, `window-off-side`, and `wrong-app-in-front`. Each fault is fixed by any route a real computer allows.

## Actions

| Action                                                                                    | What it does                                                                                               |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `open-app { app }`                                                                        | Opens a new window, cascaded, in front, with focus. At most 8 windows.                                     |
| `open-file { fileId }`                                                                    | Opens a note, picture, or tune in its app, or brings forward the window already showing it.                |
| `close-window`, `focus-window`, `minimize-window`, `maximize-window`, `unmaximize-window` | The window buttons and a click on a window. Each takes `windowId`.                                         |
| `move-window { windowId, x, y }`                                                          | The title bar. Clamped so the title bar stays reachable. A maximized window is restored first.             |
| `resize-window { windowId, width, height }`                                               | The bottom right handle. Clamped to 240 by 160 and to the desktop.                                         |
| `activate-window { windowId }`                                                            | The task strip: restores a minimized window and brings it forward.                                         |
| `focus-next-window`                                                                       | The keyboard window switch. The back window comes forward, so repeats reach every window.                  |
| `set-desktop-size { width, height }`                                                      | The screen changed size. Windows are clamped into the new area.                                            |
| `command { windowId, command }`                                                           | A menu command or its shortcut. Refused with a reason, usually `command-disabled`, when it cannot run now. |
| `text { windowId, field, op }`                                                            | Typing, Backspace, Delete, arrows with or without Shift, and pointer selection in a text field.            |
| `dialog { windowId, action }`                                                             | The save and open dialogs: `open-folder`, `go-up`, `select`, `confirm`, `cancel`.                          |
| `explorer { windowId, action }`                                                           | `open-node`, `select`, `move`, `start-rename`, `commit-rename`, `cancel-rename`, `clear-search`.           |
| `music-box { windowId, action }`                                                          | `toggle { step, note }`, and `tick`, which the screen sends on its own beat while playing.                 |
| `calculator { windowId, key }`                                                            | Digits, point, add, subtract, multiply, divide, equals, clear, and backspace.                              |
| `settings { windowId, action }`                                                           | The checkbox, radio group, dropdown, slider, and scrollable list of the settings panel.                    |
| `set-volume { volume }`, `set-muted { muted }`                                            | Toy sound. Raising the volume unmutes, as on real computers.                                               |

Text fields are `document` (the notepad), `file-name` (the save dialog), `search` and `rename` (the file explorer), and `computer-name` (the settings panel).

Commands are `new`, `open`, `save`, `save-as`, `close`, `undo`, `redo`, `cut`, `copy`, `paste`, `select-all`, `new-folder`, `rename`, `delete`, `restore`, `empty-trash`, `go-up`, `previous`, `next`, `play`, `stop`, and `clear`. `menuBar(state, windowId, clipboard)` lists each app's menus with each command's enabled state and shortcut. A command is enabled exactly when the reducer would run it: `isCommandEnabled` asks `reduce` with a clipboard that keeps nothing, so a menu and the reducer cannot disagree. A shortcut is "primary modifier plus key": `shortcutKeys(shortcut, os)` gives Command on a Mac and Ctrl elsewhere, and `commandForKey(state, windowId, keyPress, os, clipboard)` turns a key press into the enabled command.

## Events

`window-opened`, `window-closed` (with `unsavedChanges`), `window-focused`, `window-moved`, `window-resized` (with `clamped`), `window-minimized`, `window-restored`, `window-maximized`, `window-unmaximized`, `desktop-resized`, `command-run`, `text-changed`, `copied`, `cut`, `pasted`, `undone`, `redone`, `dialog-opened`, `dialog-closed`, `replace-asked`, `folder-opened`, `selection-changed`, `folder-created`, `rename-started`, `node-renamed`, `node-moved`, `node-trashed`, `node-restored` (with `renamedTo`), `trash-emptied`, `file-saved` (with `how`: `new`, `update`, or `replace`), `file-opened`, `picture-shown`, `note-toggled`, `tune-cleared`, `playback-changed`, `step-played` (the notes to sound now), `calculator-changed`, `setting-changed`, `volume-changed`, `mute-changed`, and `rejected` (with `reason`).

The types and reason codes are in `model/events.ts`.

## Rules worth knowing

- **Windows stay reachable.** The whole title bar stays on the desktop from top to bottom, and at least 120 units of it from side to side, for every desktop of 1024 by 640 or more.
- **Names.** Up to 32 characters, trimmed, no `/ \ : * ? " < > |` or control characters, not only dots, and unique in a folder ignoring case. Each broken rule has its own code: `empty`, `too-long`, `bad-character`, `only-dots`, `duplicate`.
- **Files have no extensions.** The kind is shown by its icon and spoken.
- **Trash.** Restore puts an item back where it came from, or home if that folder is gone or in the trash. A taken name gets the next free one, such as "Fox 2", so restore never fails.
- **Saving.** Save on a note never saved opens save-as. Save-as onto a note with the same name asks first (`replace-asked`), and a second confirm replaces it. A note has unsaved changes when its text differs from the last save, so typing a letter and deleting it leaves none.
- **Closing never asks.** A window with unsaved changes closes at once, and `window-closed` says so. A screen or lesson decides what to do about it.
- **Undo.** Typing undoes a word at a time. Undo history and playback are not saved; a loaded desktop starts with empty history and the music box stopped.
- **Calculator.** Operations run left to right like a pocket calculator, with 10 digits. Dividing by zero shows a friendly `divide-by-zero` problem, and the next key starts over.

## Saving

`desktopDocument` in `model/schema.ts` is the document spec for free play, built with `activityStateDocument`. `loadDocument` sets aside a corrupt file and returns `sampleDesktop()`. Structure is checked strictly. Things that can drift without being wrong, such as a window outside a smaller desktop, a focus on a minimized window, or a selection of a removed file, are repaired on load.

## Screens

`desktop/` draws the model. `<ToyDesktop desktop={useDesktop(() => state)} kit={kit} band={band} parts={parts} />` renders a monitor with the menu bar of the app in front, desktop icons, windows, dialogs, and a task strip. Every click, key, carry, and menu goes through `reduce`, and `desktop.listen((transition, action) => ...)` hears each transition. Windows move by the title bar and resize by the corner with `useCarry`, so click to pick up and click to place work everywhere. Copy, cut, and paste use the app's toy clipboard only.

The desktop is at least 1024 by 640 units and scales to fit, while the controls keep the band's real target size. New windows from an icon or the launcher open at a size measured in the band's targets. `parts` (in `desktop/parts.ts`) chooses what shows: `icons`, `menuBar`, `taskStrip`, `launcher`, `windowControls`, `move`, `resize`, `openMaximized`, and `systemSound`. Show only what the goal needs. End-to-end helpers are in `e2e/support/toyDesktop.ts`.

## Writing a lesson

A lesson is a `rounds` activity in `lessons/<id>/`. Copy [open-and-close](lessons/open-and-close/). Build the desktop with `size: LESSON_DESKTOP_SIZE` so every window is in view on every screen, and keep windows left of the icons, which stand at the right edge.

```ts
// level.ts: pure. The starting desktop and what the goal needs.
export interface TrashLevel extends LessonLevel { file: string }
export function generateLevel(seed: number, difficulty: number, band: Band): TrashLevel {
  const file = createRandom(seed).pick(['Fox', 'Owl']);
  return {
    file,
    parts: { icons: [{ app: 'file-explorer' }, { trash: true }], launcher: [] },
    desktop: buildDesktop({ size: LESSON_DESKTOP_SIZE, files: { Fox: picture('fox'), Owl: picture('owl') } }),
  };
}

// steps.ts: pure. One or more steps; each is done when its check passes after an action.
export function trashSteps({ file }: TrashLevel): LessonStep[] {
  return [
    { done: (state) => isInTrash(state, file), wrong: ({ events }) => hasEvent(events, 'node-moved') },
    {
      instruction: strings.restore, // spoken when this step starts; replay says it again
      done: (state) => fileExists(state, file),
      hint: () => ({ kind: 'command', command: 'restore' }), // pointed at after two wrong tries
    },
  ];
}

// TrashActivity.tsx
export default function TrashActivity({ level, band, kit }: ActivityProps<TrashLevel>) {
  const steps = useMemo(() => trashSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
```

`activity.ts` and `strings.ts` follow [adding-an-activity.md](../../../docs/adding-an-activity.md); the first spoken string is the main instruction. `LessonDesktop` speaks a step's `instruction` when the step starts (leave it out on the first step to keep the main one), gives `feedback.wrong` for each wrong try, points at `hint` after `HINT_AFTER_TRIES` wrong tries and counts one hint, and calls `kit.roundComplete()` `LESSON_DONE_PAUSE_MS` after the last step. A `wrong` check is optional; most lessons only count a try that undoes progress.

A step may set `nudge`, the line a wrong try says instead of "Try another one.". When a step is done, any later step whose `done` already holds with no events counts as done too, so a child who did things out of order is never asked twice. `LessonDesktop` also takes `backdrop`, which draws lesson marks on the desktop under the windows, such as a box to move a window into; it gets the scale, the state, and the step. The settings panel's rows and the sound button carry `data-highlight-key` (`setting:<name>` and `system-sound`), so a `{ kind: 'key' }` hint can point at them.

Test `steps.ts` through `LessonDesktop` as `lessons/harness/LessonDesktop.test.tsx` does, and `level.ts` as `open-and-close/level.test.ts` does. The end-to-end spec clicks with `page.mouse` on `[data-desktop-icon]`, `[data-window][data-app]`, `[data-window-control]`, `[data-menu]`, and `[data-command]`, and saves screenshots with `saveReviewScreenshot`. Point a `hint` at an app's own button with `{ kind: 'key', key }` and `data-highlight-key` on that button.
