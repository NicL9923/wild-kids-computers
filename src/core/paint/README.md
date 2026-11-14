# Paint engine

A software rasterizer over typed arrays. No Canvas 2D, no DOM, no platform fonts or image decoders. The same input paints the same bytes on every machine, so tests compare images exactly. The contract is "Paint engine" in [docs/architecture.md](../../../docs/architecture.md).

## Use it from the studio

```ts
import { createDocument } from '../../core/paint/document.ts';
import { History } from '../../core/paint/history.ts';
import { startStroke, applyPictureEffect } from '../../core/paint/session.ts';
import { paintTools, brushTips, paintEffects, paintFonts } from '../../registry/paint.ts';

const doc = createDocument(); // 1600 by 1000, white paper, no mask
const history = new History(doc); // undo and redo, 256 MiB cap

// One stroke is one undo step. The studio decides when it begins and ends (sticky pen).
const stroke = startStroke(history, tool, settings);
repaint(stroke.begin({ x, y }));
repaint(stroke.move({ x, y })); // for every coalesced pointer event
repaint(stroke.end()); // commits; stroke.cancel() puts every pixel back instead

repaint(history.undo());
history.replaceDocument(blankPaper, coloringPageMask); // "open a coloring page", undoable
```

- Every call returns the `Rect` it changed. Wrap `doc.paint.data` in one `ImageData` and call `putImageData` with that rectangle once per frame. The paint layer is straight RGBA, the `ImageData` layout.
- `doc.mask` is the line art of a coloring page. Draw it on a canvas above the paint. Only history steps replace it, so compare the reference after undo and redo.
- `ToolSettings` carries the color, the size in document pixels, the brush tip, a seed for scattering, and the optional shape, fill, text, and stamp settings.
- A whole-picture effect's `apply(source, target)` is pure. Run it in a worker on a copy of the pixels, then hand the result to `history.replacePaint(result)`. `applyPictureEffect` does the same on the main thread.
- `flattenDocument(doc)` gives the picture as a child sees it, for saving. `thumbnail(picture, maxWidth, maxHeight)` gives the gallery thumbnail.

## Files

| File                          | What it holds                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `math.ts`                     | sin, cos, atan, atan2, exp, log, pow, built only from exactly rounded operations                |
| `color.ts`                    | Colors, HSV, and source-over blending in integer math                                           |
| `surface.ts`, `rect.ts`       | Pixel buffers and integer rectangles                                                            |
| `path.ts`, `raster.ts`        | Paths with curves flattened as they are added, the antialiased filler, and the distance stroker |
| `document.ts`, `history.ts`   | The document with its mask, and undo by 64 px tiles                                             |
| `dab.ts`                      | The dab pipeline: `DabTrail` places dabs, `DabCanvas` paints them with max coverage per stroke  |
| `session.ts`, `preview.ts`    | `startStroke`, `applyPictureEffect`, and helpers for tools that redraw as the pointer moves     |
| `types.ts`                    | The tool, tip, and effect interfaces and their settings                                         |
| `glyphs.ts`                   | Glyph tables for the text tool                                                                  |
| `patterns.ts`, `sample.ts`    | Patterns for pattern tips and fills, and bilinear sampling                                      |
| `sampleMap.ts`                | The precomputed sample map for whole-picture effects that move pixels                           |
| `scatter.ts`                  | `Scatter`, which blends pieces over each other for paint-on effects that scatter things         |
| `thumbnail.ts`                | Area-averaging downscale                                                                        |
| `tools/`, `tips/`, `effects/` | One module per item, found by the registry in `src/registry/paint.ts`                           |
| `testing/golden.ts`           | Golden image helpers. Test-only and excluded from the app build.                                |

## Rules

- **Exact math only.** A lint rule bans `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan`, `Math.atan2`, `Math.pow`, `Math.exp`, `Math.log`, `Math.hypot`, the other inexact `Math` functions, and `**` in this folder. Use `math.ts`. `Math.sqrt`, `Math.floor`, `Math.round`, `Math.min`, `Math.max`, and `Math.abs` are exact and allowed.
- **No randomness without a seed.** Use `createRandom(mixSeed(dab.seed, dab.index))` from `random.ts`, so a dab's randomness depends only on the stroke seed and its place in the stroke.
- **Touch before you write.** A tool calls `ctx.change.touch(rect)` before changing pixels in `rect`, so undo has the old tiles. `DabCanvas`, `drawPath`, and `drawStroke` do it for you.
- **Imports stay inside `src/core/paint/`.** No React, no DOM, no Electron. Tools, tips, and effects never call `import.meta.glob`.
- **Nothing assumes a held button.** A stroke is begin, moves, and end. The studio maps clicks to those.

## Add a brush tip

1. Create `tips/<tipId>.ts`. The id is camelCase and matches the file name.

   ```ts
   import { discCoverage } from '../dab.ts';
   import { defineTip } from '../types.ts';

   export default defineTip({
     id: 'bubbles',
     order: 13,
     spacing: 0.2, // distance between dabs, as a fraction of the size
     paint(canvas, dab) {
       const radius = dab.size / 2;
       const { r, g, b, a } = dab.color;
       canvas.disc(dab.x, dab.y, radius, (d) => discCoverage(radius, d) - discCoverage(radius - 2, d), r, g, b, a);
     },
   });
   ```

   Use `canvas.disc` when coverage depends only on the distance from the center. Otherwise visit pixels with `forEachInDisc` and call `canvas.put(x, y, coverage, r, g, b, a)`.

2. Run `npm run paint:goldens`. The table-driven test in `src/registry/paintTips.test.ts` paints a wave and a crossing stroke with every registered tip and writes `__goldens__/tip-<tipId>.png`.
3. Open the PNG and look at it. Check the edges, the spacing, and how it crosses itself. It must look clearly different from every other tip to a child.
4. Commit the tip and its golden together.

## Add a tool

1. Create `tools/<toolId>/index.ts` with a default export from `defineTool({ id, order, stroke })`. `stroke(ctx)` returns `{ begin, move, end, cancel }`, each returning the changed `Rect`.
   - A brush-like tool returns `tipStroke(ctx, tip)` or `trailStroke(ctx, spacing, paintDab)` from `dab.ts`.
   - A tool that redraws one thing as the pointer moves, like a shape, returns `previewStroke(ctx, draw)` from `preview.ts`.
   - `cancel` returns `ctx.change.revert()`.
2. Create `tools/<toolId>/index.test.ts` that builds a picture with `newPicture()`, draws with `drawStroke(history, tool, testSettings({...}), points)`, and calls `expectGolden('tool-<toolId>', doc.paint)`. Add variants as `tool-<toolId>-<variant>`. Add plain assertions for the edge cases: off the canvas, zero size, cancel, no undo step for a no-op.
3. Run `npm run paint:goldens`, look at every new PNG, and commit.

## Add an effect

Pick the group:

| Group           | Shape                                                                                                         | Reference          |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| `distort`       | A stroke effect that moves pixels under the brush. Sample from a copy of the dab area.                        | `effects/swirl`    |
| `color`         | A stroke effect that maps each pixel's color. Read the pixel from before the stroke with `canvas.readBefore`. | `effects/hueShift` |
| `paint-on`      | A stroke effect that adds things, like a brush. Scatter with a seeded random.                                 | `effects/confetti` |
| `whole-picture` | `apply(source, target)`, pure, fixed cost per pixel, so it can run in a worker.                               | `effects/mirror`   |

1. Copy the reference directory to `effects/<effectId>/` and change the id, order, and the work.
   - A paint-on effect whose pieces sit on top of each other, like bubbles with a shine or leaves with a vein, draws them with `Scatter` from `scatter.ts`, which blends each piece over the last and touches what it writes. One that reveals a pattern fixed to the paper, like `effects/honeycomb`, paints through a `DabCanvas` so overlapping dabs do not stack.
   - A whole-picture effect that moves pixels is a sample map. `sampleMapEffect(id, order, mapper)` builds and caches the map from a function called once per pixel. `builtMapEffect(id, order, build)` takes a function that builds the whole map, which a tight loop does several times faster: use it when the first run would come near the 60 ms budget. One that changes colors loops over the pixels once, and a filter uses a separable kernel.
2. Keep the test file next to it and point its `expectGolden('effect-<effectId>', ...)` at the new effect. Paint something with `paintBands(doc)` or strokes first, so the effect has something to work on. Test that the same seed gives the same pixels and another seed does not, for scattering effects.
3. Run `npm run paint:goldens`, look at the PNG, and commit.

## Goldens

- Goldens are 200 by 125 pictures in `__goldens__/`, named `<kind>-<id>` or `<kind>-<id>-<variant>`.
- The comparison is exact after PNG decoding. A failure writes `test-results/paint/<name>.actual.png` and `.diff.png`, with changed pixels in magenta.
- `npm run paint:goldens` rewrites only goldens whose pixels changed. Look at each one before committing.
- The suite refuses to run on a Node version other than `.node-version`.
- `src/registry/paint.test.ts` fails when a tool, tip, or effect has no golden, when a tool or effect has no test file next to it, when a golden belongs to nothing, or when two items share an id.

## Fonts

`tools/buildGlyphTables.ts` reads `assets/paint-fonts/Andika-Bold.ttf` and writes `assets/paint-fonts/meadow-sans.glyphs.json`: printable ASCII plus curly quotes, dashes, and the ellipsis, with kerning. The table is renamed because "Andika" is a Reserved Font Name under the OFL. The registry loads tables by face id from `paintFonts`, and `parseGlyphTable` checks each one.

## Measuring

`npm run perf` times a full-canvas fill, a frame of fast strokes with large soft brushes, a frame of fast strokes with each paint-on effect at 120 px, each whole-picture effect, and a full-canvas undo, on the 1600 by 1000 canvas. It prints numbers and gates nothing. A paint-on effect should stay under 4 ms a frame. A whole-picture effect should finish its first run, map included, in under 60 ms, because a child's laptop is several times slower.
