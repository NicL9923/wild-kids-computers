# Strings

Every word the app shows or says lives in a `strings.ts` file next to the code that uses it. The registry finds the file by its name, so you never edit a central list.

## Add strings

1. Create `strings.ts` next to your component and export one catalog named `strings`:

   ```ts
   import { defineStrings } from '../../core/strings/defineStrings.ts';

   export const strings = defineStrings('pop-the-seed-pods', {
     title: { text: 'Pop the seed pods' },
     goal: { text: 'Click a large target that stays still.', silent: 'parent' },
     instruction: { text: 'Click a seed pod to pop it.' },
   });
   ```

2. Show text with `t(strings.title)`. Never put a string literal in JSX.
3. Speak with `kit.speak(strings.instruction)` in an activity, or `useAudio().speak(...)` elsewhere. See [src/audio/README.md](../../audio/README.md).
4. Run `npm run voice:generate` to make the clips, then commit them. On a feature branch, the coordinator does this on the integration branch.

## Rules

- **The namespace** is kebab-case and unique across the app, usually the activity id.
- **Spoken by default.** A string that is never spoken sets `silent: 'parent'` for adult-only text, or `silent: 'decorative'` for text an older child reads that repeats something already spoken. `speak()` does not compile with a silent string.
- **`speech`** is what the voice says when it differs from the text. Wrap Kokoro phonemes in slashes for a sound that is not a word, as the letter sounds do: `speech: '/mːː/'`.
- **No interpolation.** Compose a sentence from clips: `speakSequence([strings.find, letterNames.b])`.
- **Content rules.** The strings check fails on reward words (star, points, badge, streak, score, level up, trophy, prize, coins, unlock), pressure (countdown, hurry, keep playing, one more), and scolding (wrong, fail, oh no, bad, sad). An honest use lists the rule: `{ text: 'star', allow: ['star'] }`. An allow entry that no longer matches fails too. The full list is in [contentRules.ts](contentRules.ts).
- **Feedback** never scolds and never over-praises. Use the shared `feedback` set: "That one goes somewhere else.", "Try another one.", "You did it.", "All done."

## Shared clip sets

Import them from [shared/index.ts](shared/index.ts) so every activity says them the same way.

| Export         | Keys                                                       |
| -------------- | ---------------------------------------------------------- |
| `letterNames`  | `a` to `z`. Says "bee".                                    |
| `letterSounds` | `a` to `z`. Says the sound, "buh".                         |
| `numbers`      | `0` to `100`, or `numberHandle(n)`                         |
| `ordinals`     | `first` to `tenth`                                         |
| `colors`       | `red`, `orange`, `yellow`, `green`, `blue`, `purple`, ...  |
| `shapes`       | `circle`, `square`, `triangle`, `rectangle`, `star`, ...   |
| `days`         | `monday` to `sunday`                                       |
| `months`       | `january` to `december`                                    |
| `feedback`     | `yes`, `thatsIt`, `tryAnother`, `youDidIt`, `allDone`, ... |
| `emojiNames`   | One per bundled emoji id, such as `elephant`. See `Emoji`. |

## Checks

| Command                 | Fails when                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run check:strings` | A namespace repeats, text is empty, a content rule matches, or a file name names a reference app |
| `npm run check:voice`   | A spoken string has no clip, a clip matches no string, or two texts share a clip name            |

`voiceClipName(speech)` in [voice.ts](voice.ts) names each clip by a 64-bit hash of the voice profile and the normalized speech. A changed string has no clip until someone generates it.
