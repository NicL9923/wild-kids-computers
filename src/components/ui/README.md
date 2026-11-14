# UI primitives

The building blocks every screen uses. Open the component gallery to see them at each band: run `npm run dev` and go to `#/dev/gallery?band=band-3-5`. The gallery also opens in a test run and nowhere else.

## Rules

- **Sizes come from tokens.** Every size, color, radius, shadow, and duration is a custom property in `src/styles/tokens.css`. Use the Tailwind utilities that read them (`bg-surface`, `text-body`, `gap-item`, `min-h-target`, `rounded-control`) or the property itself. Tailwind's own palette and type scale are removed, so `bg-red-500` does not exist.
- **No literal colors.** Not in JSX, not in CSS. A new color is a token with a pairing in `src/styles/colorPairings.ts`, and the contrast test checks it.
- **Targets are at least `--wk-target-min`.** It is 72, 56, or 44 CSS px by band. Picture choices are at least `--wk-target-large`, twice that.
- **Text comes from the caller.** Primitives take already-resolved strings. Pass `t(strings.someHandle)` at the call site. Never put a string literal in JSX.
- **Movement multiplies by `--wk-motion-scale`.** Reduced motion sets it to 0, so a transform written as `calc(4px * var(--wk-motion-scale))` stops by itself. For motion driven by script, ask `useReducedMotion()` from `src/app/theme/ThemeRoot.tsx`.
- **Focus stays visible.** `:focus-visible` draws one ring for everything. Do not remove it.
- **Color is never the only signal.** A chosen tile shows a check. A switch moves its thumb and shows a check or a dash. A profile color has a shape.
- **Child pictures, adult icons.** Controls a child uses show an `InterfaceIcon`. Adult controls in the parent corner use [Lucide](https://lucide.dev) icons with the class `wk-lucide`.

## Primitives

| Primitive                               | Use it for                                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                | An action with a text label. `variant` is `primary`, `secondary` (default), or `danger`. `icon` puts a picture before the label. It never submits a form unless `type='submit'`.                   |
| `IconButton`                            | An action shown only as a picture. `label` is required and becomes the accessible name; a blank label throws. `pressed` makes it a toggle, such as mute.                                           |
| `InterfaceIcon`                         | One of the child-facing pictures: `exit`, `replay`, `sound-on`, `sound-off`, `play-again`, `meadow`, `undo`, `redo`, `parent-corner`. Decorative; the button around it carries the name.           |
| `Tile`                                  | A big picture choice for area pickers, activity pickers, and avatar choice. The label is hidden in `band-3-5` and always read by screen readers. `selected` adds a check and `aria-pressed`.       |
| `Dialog`                                | A parent-corner dialog on Radix. Focus moves in, stays in, closes on Escape, and returns to the control that opened it. Give it a `title` and a `closeLabel`.                                      |
| `AlertDialog`                           | A question before something happens, such as deleting a profile. Focus starts on the cancel button. Name both buttons by their action: "Delete profile" and "Keep profile", never "OK".            |
| `Slider`                                | A number in a range, such as volume. A native range input: arrow keys work and a click on the track jumps there, so no drag is needed. Pass `valueText` such as "60%".                             |
| `Switch`                                | An on and off setting with a visible label and an optional description.                                                                                                                            |
| `SegmentedChoice`                       | One choice from a short list, such as an age band or text size. Native radio buttons in a labelled group.                                                                                          |
| `TextField`                             | A labelled text input with an optional `hint` and `error`. The error marks the field invalid and is read before the hint.                                                                          |
| `VisuallyHidden`                        | Text for screen readers only. For text that helps a reader but must not be needed in `band-3-5`, use the class `wk-reading-text` instead; it shows from `band-6-8` up.                             |
| `Screen`                                | The frame of every activity and area screen. Three fixed top slots: `exit` (top left), `instruction` (top center, the replay control and, from `band-6-8`, the text), and `end` (top right, mute). |
| `CalmPanel`                             | The finish and closing screens. `picture` is `finish` or `closing`. Give `actions` two buttons of the same variant, so neither looks like the one to pick. No score, count, or clock.              |
| `HomeMap`                               | The meadow with a button for each area. Pass a `label` and a `places` record with each area's `label` and `onSelect`. It fills its parent, so give the parent a size.                              |
| `Avatar`, `AVATAR_IDS`                  | The twelve animal avatars. An unknown saved id shows the fox instead of a broken picture.                                                                                                          |
| `ProfileColorMark`, `PROFILE_COLOR_IDS` | The eight profile colors, each a swatch with its own shape. An unknown saved id shows the sun color.                                                                                               |
| `areaPicture(id)`                       | The picture of an area, the same art as its place on the home map, for area screens and tiles.                                                                                                     |

## Theme

`ThemeRoot` in `src/app/theme/` sets `data-band`, `data-text-size`, `data-letter-spacing`, and `data-motion` on `<html>`, so dialogs portalled into `<body>` get the same tokens. The app root mounts one with the active profile's settings. A nested `ThemeRoot` overrides the outer one until it unmounts.
