# Audio

One Web Audio engine plays voice clips and synthesized sound effects. Voice and effects have separate volumes under one mute. Nothing here throws on a missing clip or a missing sound device: it plays nothing and keeps going.

## Speak a string

1. Define the string in a `strings.ts` file. See [src/core/strings/README.md](../core/strings/README.md).
2. In an activity, call `kit.speak(strings.instruction)` or `kit.speakSequence([strings.find, letterNames.b])`. The kit routes through the engine and cancels speech when the child leaves.
3. Outside an activity, `const audio = useAudio()` and call `audio.speak(...)`, `audio.speakSequence([...])`, or `audio.cancelSpeech()`.

A new `speak` stops the clip that is playing, so a replay button pressed twice never stacks voices. A missing clip plays nothing, and the test log still records the string.

## Play a sound

- A short effect: `audio.play('pop')`. The names are in [sfx/sfxNames.ts](sfx/sfxNames.ts): `pop`, `chime`, `nudge`, `pick-up`, `put-down`, `tap`, `whoosh`, `sparkle`, `page-turn`, `key-tap`, `open`, `close`, `bloom`, `stamp`, `fill`, `snap`.
- Use `chime` to confirm a right action and `nudge` for a wrong one. Neither celebrates or scolds.
- A sound an action drives: `const brush = audio.startContinuous('brush')`, then `brush.set(speed)` with a value from 0 to 1 on each move, and `brush.stop()` on release. Intensity 0 is silent.

To add an effect, add its name to `SFX_NAMES` and its recipe to [sfx/oneShots.ts](sfx/oneShots.ts). The type check fails until both exist. Keep it under half a second and under `MAX_PEAK`.

## Wire it into the app

The shell does this once:

```tsx
const audio = createAppAudio({ underTest: bridgeInfo.underTest, volume: settings.volume });
if (bridgeInfo.underTest) exposeAudioTestLog(audio);
audio.onVolumeChange((volume) => saveSettings({ ...settings, volume }));

<AudioProvider engine={audio}>...</AudioProvider>;
```

- The always-visible mute control uses `const [muted, toggle] = useMute()`.
- The parent corner sets `audio.setVolume({ voice, effects })`. `useVolume()` re-renders on change.
- `exposeAudioTestLog` puts the log on `window.wkcAudioLog`. `e2e/support/audioLog.ts` reads it: every string spoken, with its clip and whether the clip exists, and every effect played.

## Files

| File                                                       | What it holds                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| [audioEngine.ts](audioEngine.ts)                           | The engine. Pure apart from the environment it is given.     |
| [createAppAudio.ts](createAppAudio.ts)                     | The real environment: `AudioContext`, bundled clips, `fetch` |
| [AudioProvider.tsx](AudioProvider.tsx)                     | `AudioProvider`, `useAudio`, `useVolume`, `useMute`          |
| [testLog.ts](testLog.ts)                                   | `exposeAudioTestLog`                                         |
| [sfx/](sfx/)                                               | Effect names, recipes, and the continuous brush and eraser   |
| [testing/fakeAudioContext.ts](testing/fakeAudioContext.ts) | A Web Audio fake for unit tests                              |

Voice clips are made by `npm run voice:generate`. See [tools/voice/README.md](../../tools/voice/README.md).
