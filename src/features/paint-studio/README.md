# Paint studio

The paint studio at `/paint` and its gallery at `/paint/gallery`. The engine is in [src/core/paint](../../core/paint/README.md); this directory is the screen around it. The contract is "Paint engine" in [docs/architecture.md](../../../docs/architecture.md).

## Open the studio with a starting picture

Another feature can open the studio with a picture to keep painting. The studio saves whatever picture it had, starts a new gallery picture from the one it was given, and makes placing it an undoable step.

```ts
import { useNavigate } from '@tanstack/react-router';
import { openPaintStudioWith } from '../paint-studio/startingPicture.ts';
import { toPaintPicture } from './engine/drawing.ts';

const navigate = useNavigate();

// Lines, such as the robot painter's drawing. toPaintPicture already returns this shape.
await navigate({ to: openPaintStudioWith({ kind: 'lines', ...toPaintPicture(segments, canvas) }) });

// Or pixels: straight RGBA, row by row, any size. They are scaled to fit the paper and centered.
await navigate({ to: openPaintStudioWith({ kind: 'pixels', width, height, data }) });
```

- `lines` take `width` and `height`, the size of the drawing's own coordinate space, and `lines`, each `{ from, to, color, width }` in those units. The studio scales the drawing evenly to fit the 1600 by 1000 paper, centers it, and paints each line with the engine's line tool, so it looks the same on every machine.
- `openPaintStudioWith` checks the picture first and throws a `RangeError` that names the problem: a size that is not a whole number of at least 1, a pixel buffer of the wrong length, a point that is not a number, or a width that is not above 0. It returns the path to navigate to.
- The picture waits until the studio opens it. Sending another picture before then replaces it.

## Export and print, and the parent gate

Export and print are adult controls on each gallery card. They call `requestParentGate(reason)` from [parentGate.ts](parentGate.ts) and act only when it resolves true. Export saves a PNG through the bridge to a place the adult chooses; print sends the PNG to the bridge's print call.

While the profile's settings say export and print need the gate (`outputNeedsParentGate`, on by default), `requestParentGate` asks the adult through the app shell's `useParentGate()`. A parent can turn that off in the parent corner; then export and print act at once.

## How it works

| File                                                               | What it holds                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `PaintStudio.tsx`, `studio/PaintStudioScreen.tsx`                  | The screen: tools by band, options, pickers, autosave, session length, sound, and keyboard shortcuts                 |
| `studio/StudioCanvas.tsx`                                          | The paint and line-art canvases, pointer and keyboard input, and one `putImageData` of the changed area per frame    |
| `studio/penInput.ts`                                               | The sticky pen as a pure state machine                                                                               |
| `studio/studioDocument.ts`                                         | One picture: document, history, the stroke in progress, the area to repaint, and the coloring page id under undo     |
| `studio/autosave.ts`, `studio/pictureFile.ts`, `studio/pngText.ts` | Saving without a button, and the PNG files, with the coloring page id in a `tEXt` chunk                              |
| `studio/unflatten.ts`                                              | Takes a coloring page's lines back out of a saved picture, so reopening it puts them on their own layer again        |
| `studio/studioOptions.ts`                                          | What each band sees: tools, effects, sizes, colors, fill styles                                                      |
| `studio/previews.ts`                                               | Picker previews painted by the engine: tips, shapes, fills, and effects on the child's own picture or a sample scene |
| `worker/`                                                          | The Web Worker that runs whole-picture effects, and the runner that falls back to this thread if the worker fails    |
| `studioScope.ts`                                                   | The studio's timers and frames, all cancelled when it closes. The only place here that touches the global timers.    |
| `stamps/<categoryId>.ts`, `coloringPages/<pageId>.ts`              | Stamp categories and coloring pages, found by `src/registry/stampCategories.ts` and `src/registry/coloringPages.ts`  |
| `effects/strings.ts`                                               | The spoken name of every effect and effect group                                                                     |
| `gallery/PaintGallery.tsx`                                         | Thumbnails of the active profile's pictures: open, copy, trash with a "bring it back" control, export, and print     |

- **Sticky pen.** With a mouse, a click without movement puts the pen down and the next click lifts it. Press, drag, and release also works. Touch never sticks. Fill, stamps, letters, and whole-picture effects act once per click. The pen lifts when the pointer leaves the picture for 0.7 seconds, the window loses focus, or the child picks another tool.
- **Keyboard.** Every control is a button. On the picture, the arrow keys move a paint cursor (Shift moves farther), and Enter or Space acts there: fill, a stamp, or a whole-picture effect, or pen down and up for brushes. Ctrl or Cmd with Z undoes, and with Y or Shift and Z redoes.
- **Saving.** The picture saves 1.5 seconds after painting pauses and when the child leaves the studio. An untouched coloring page is not saved. Opening a page or new paper keeps the current picture in the gallery and starts a new one. Saved pictures are flattened PNGs, so any screen can show them.
- **Session length.** When the session layer says the limit is reached, the studio waits for the pen to lift, saves, and goes to `/closing`.
- **Trash.** A deleted picture stays in the bridge's trash; the gallery shows "bring it back" for 12 seconds. Nothing purges the trash yet.

## Tests

- Unit tests sit next to each module. They run the real engine on small documents.
- `e2e/paint/studio.spec.ts` drives the built app with real pointer events and reads canvas pixels back from the page. `e2e/paint/screens.spec.ts` saves screenshots of every view at each band at 1920 by 1080 and 1280 by 800 into `reports/screens/<band>/`, which Playwright does not wipe.
- `e2e/paint/studioPerf.ts` measures the studio in the real app and runs as part of `npm run perf`. `WKC_PERF_MINUTES` shortens the memory run.
