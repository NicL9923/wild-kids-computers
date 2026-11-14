# Voice generator

Makes the voice clips in `assets/voice/en/` with Kokoro-82M v1.0 (Apache-2.0). It has its own `package.json` and lockfile, so the model runtime never enters the app's dependency tree.

## Generate clips

```sh
npm ci --prefix tools/voice   # once per machine, about 740 MB
npm run voice:generate        # makes only the clips that are missing
npm run check:voice           # every spoken string has a clip, and no clip is stale
```

`voice:generate` first runs a Vitest task that reads the string registry and writes the spoken list to `node_modules/.cache/wkc-voice/spoken.json`. The generator then reads that list with plain Node. The model downloads once to `~/.cache/wkc/transformers` and every later run reuses it. `node tools/voice/generate.ts --prune` also deletes clips that no string uses.

Each clip goes through these steps:

1. espeak-ng (through the `phonemizer` package) turns the text into phonemes, and `toKokoroPhonemes` maps them to the alphabet Kokoro was trained on, with one symbol per diphthong and affricate. kokoro-js skips that mapping, and the model then says "boy" as "bye". A speech with no end punctuation gets a period, or Kokoro clips the last sound of a short word ("bed" came out "bad").
2. Kokoro says a lead-in and then the speech, at the voice and speed in `VOICE_PROFILE` (`src/core/strings/voice.ts`). The lead-in is "Ready?" before words and "Say." plus an empty sentence before a bare sound.
3. `cutAfterLead` keeps only what follows the pause after the lead-in. Kokoro adds a false consonant to a short utterance that starts with a vowel ("egg" comes out "lag"). After a lead-in it does not. The cut fails loudly if the pause is not where it should be.
4. Silence is trimmed to a 40 ms lead and 80 ms tail, the voiced part is evened out to -20 dBFS RMS under a -1.5 dBFS peak, and the edges fade over 8 ms.
5. ffmpeg (on PATH) encodes mono Opus in Ogg at 24 kbit/s, voice mode, with no metadata.

A speech wrapped in slashes, such as `/bə/`, is read as Kokoro phonemes. The letter sounds use it.

Changing post-processing changes no clip name, so bump `revision` in `VOICE_PROFILE` to regenerate everything.

## Check intelligibility

```sh
python3 -m venv ~/.cache/wkc/venv-asr
~/.cache/wkc/venv-asr/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0
~/.cache/wkc/venv-asr/bin/pip install -r tools/voice/asr-requirements.txt
npm run voice:round-trip
```

The round trip transcribes every clip with Whisper large-v3-turbo and checks each letter sound with a wav2vec2 phoneme recognizer. It writes [docs/voice-round-trip.md](../../docs/voice-round-trip.md) with the word error rate and every clip the recognizer got wrong. Fix a misheard clip with a `speech` override, then generate and run the round trip again.
