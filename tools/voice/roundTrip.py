"""Voice round trip: run every committed clip through open speech recognizers and report.

Nobody listens to the clips during an agent run, so this is the objective check. Each clip is
transcribed and compared with the text it should say:

- Word clips go through Whisper large-v3-turbo (MIT). The report gives the word error rate and
  every clip the recognizer got wrong.
- Letter-sound clips (speech written as phonemes between slashes) go through a wav2vec2 phoneme
  recognizer (Apache-2.0), because Whisper writes words, not sounds.

Run it with `npm run voice:round-trip`, which writes the spoken list first. It needs ffmpeg and
the Python environment described in tools/voice/README.md. It writes docs/voice-round-trip.md.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForCTC, AutoProcessor, pipeline

REPO = Path(__file__).resolve().parents[2]
SPOKEN_LIST = REPO / "node_modules" / ".cache" / "wkc-voice" / "spoken.json"
CACHE_PATH = REPO / "node_modules" / ".cache" / "wkc-voice" / "round-trip-cache.json"
CLIP_DIR = REPO / "assets" / "voice" / "en"
REPORT = REPO / "docs" / "voice-round-trip.md"
WHISPER = "openai/whisper-large-v3-turbo"
PHONEMES = "facebook/wav2vec2-lv-60-espeak-cv-ft"

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()

# Whisper writes a lone letter name as a word that sounds the same. Count those as the letter.
LETTER_HOMOPHONES = {
    "ay": "a", "eh": "a", "bee": "b", "be": "b", "see": "c", "sea": "c", "dee": "d", "e": "e",
    "ef": "f", "gee": "g", "aitch": "h", "age": "h", "i": "i", "eye": "i", "jay": "j", "kay": "k",
    "el": "l", "em": "m", "en": "n", "oh": "o", "o": "o", "pee": "p", "pea": "p", "cue": "q",
    "queue": "q", "are": "r", "ar": "r", "ess": "s", "es": "s", "tea": "t", "tee": "t", "you": "u",
    "u": "u", "vee": "v", "why": "y", "ex": "x", "zee": "z", "zed": "z",
}

# Words that sound the same as the expected word. The recognizer cannot hear the difference, so
# these are not voice errors. Each pair is (heard, expected).
HOMOPHONES = {
    ("dear", "deer"), ("knows", "nose"), ("pi", "pie"), ("son", "sun"),
    ("flour", "flower"), ("donut", "doughnut"), ("genes", "jeans"), ("pair", "pear"),
    ("thai", "tie"), ("lama", "llama"),
}

# Spellings a recognizer writes as one word or with digits.
SPELLING_VARIANTS = {
    "rollercoaster": "roller coaster", "trashcan": "trash can", "1st": "first", "2nd": "second",
    "3rd": "third", "4th": "fourth", "5th": "fifth", "6th": "sixth", "7th": "seventh",
    "8th": "eighth", "9th": "ninth", "10th": "tenth",
}

# The first sound each letter-sound clip should start with, in the recognizer's alphabet.
# Vowels list several symbols: the recognizer is trained on sentences and blurs isolated vowels.
LETTER_SOUND_ONSETS = {
    "a": ["æ", "a", "ɛ"], "b": ["b"], "c": ["k"], "d": ["d"], "e": ["ɛ", "e", "a"], "f": ["f"],
    "g": ["ɡ"], "h": ["h", "x"], "i": ["ɪ", "i", "e"], "j": ["dʒ", "tɕ"], "k": ["k"], "l": ["l"],
    "m": ["m"], "n": ["n"], "o": ["ɑ", "a", "ɔ"], "p": ["p"], "q": ["k"], "r": ["ɹ", "r"],
    "s": ["s"], "t": ["t"], "u": ["ʌ", "a", "ə"], "v": ["v"], "w": ["w"], "x": ["k"], "y": ["j"],
    "z": ["z"],
}


def number_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n == 100:
        return "one hundred"
    return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])


def normalize_words(text: str) -> list[str]:
    text = text.lower().replace("’", "'").replace("-", " ")
    text = " ".join(SPELLING_VARIANTS.get(w.strip(".,!?"), w) for w in text.split())
    text = re.sub(r"\b(\d{1,3})\b", lambda m: number_words(int(m.group(1))) if int(m.group(1)) <= 100 else m.group(1), text)
    text = re.sub(r"[^a-z0-9' ]+", " ", text)
    words = [w.strip("'") for w in text.split()]
    words = [w for w in words if w]
    # Whisper sometimes loops on a short clip ("apple, apple, apple, ..."). A one-word clip cannot
    # say a word twice in a row, so collapse repeats instead of counting the loop as errors.
    words = [w for i, w in enumerate(words) if i == 0 or w != words[i - 1]]
    # Whisper often writes "spacebar" or "ok" where a reader would split or spell it out.
    joined = " ".join(words).replace("t rex", "trex").replace("space bar", "spacebar")
    words = joined.split()
    return [LETTER_HOMOPHONES.get(w, w) if len(words) == 1 else w for w in words]


def edit_distance(a: list[str], b: list[str]) -> int:
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            same = x == y or (y, x) in HOMOPHONES
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (not same)))
        previous = current
    return previous[-1]


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


@dataclass
class WordResult:
    clip: str
    ids: list[str]
    expected: str
    heard: str
    errors: int
    words: int


@dataclass
class SoundResult:
    clip: str
    ids: list[str]
    phonemes: str
    heard: str
    ok: bool


def load_cache(use_cache: bool) -> dict[str, str]:
    if not use_cache or not CACHE_PATH.exists():
        return {}
    try:
        loaded = json.loads(CACHE_PATH.read_text())
        return loaded if isinstance(loaded, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_cache(cache: dict[str, str]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=2, sort_keys=True) + "\n")


def parse_only_filter(argv: list[str]) -> set[str] | None:
    if "--only" not in argv:
        return None
    idx = argv.index("--only")
    if idx + 1 >= len(argv):
        raise SystemExit("--only expects a comma-separated list of clip filenames or string ids")
    return {item.strip() for item in argv[idx + 1].split(",") if item.strip()}


def main() -> None:
    argv = sys.argv[1:]
    use_cache = "--no-cache" not in argv
    only = parse_only_filter(argv)
    spoken = json.loads(SPOKEN_LIST.read_text())
    profile = spoken["profile"]
    clips = spoken["clips"]
    if only is not None:
        clips = [
            entry for entry in clips if entry["clip"] in only or any(string_id in only for string_id in entry["ids"])
        ]
    cache = load_cache(use_cache)
    torch.set_num_threads(max(1, torch.get_num_threads()))

    asr = None
    processor = None
    phoneme_model = None

    words: list[WordResult] = []
    sounds: list[SoundResult] = []
    started = time.time()
    cache_hits = 0
    transcribed = 0
    for index, entry in enumerate(clips, 1):
        speech = entry["speech"]
        match = re.fullmatch(r"/(.+)/", speech)
        is_letter_sound = bool(match) and all(i.startswith("letter-sounds.") for i in entry["ids"])
        if is_letter_sound and match is not None:
            cache_key = f"{PHONEMES}|{entry['clip']}|{speech}"
            heard = cache.get(cache_key)
            if heard is None:
                if processor is None or phoneme_model is None:
                    processor = AutoProcessor.from_pretrained(PHONEMES)
                    phoneme_model = AutoModelForCTC.from_pretrained(PHONEMES).eval()
                audio = decode(CLIP_DIR / entry["clip"])
                padded = np.concatenate([np.zeros(4000, np.float32), audio, np.zeros(4000, np.float32)])
                values = processor(padded, sampling_rate=16000, return_tensors="pt").input_values
                with torch.no_grad():
                    ids = phoneme_model(values).logits.argmax(-1)
                heard = processor.batch_decode(ids)[0].strip()
                cache[cache_key] = heard
                transcribed += 1
            else:
                cache_hits += 1
            letter = entry["ids"][0].split(".")[-1]
            onsets = LETTER_SOUND_ONSETS.get(letter, [])
            first = [p for p in heard.split() if p != "ʔ"]
            ok = bool(first) and any(first[0].startswith(o) for o in onsets)
            sounds.append(SoundResult(entry["clip"], entry["ids"], match.group(1), heard, ok))
        else:
            cache_key = f"{WHISPER}|{entry['clip']}|{speech}"
            heard = cache.get(cache_key)
            if heard is None:
                if asr is None:
                    asr = pipeline("automatic-speech-recognition", model=WHISPER, device="cpu", torch_dtype=torch.float32)
                audio = decode(CLIP_DIR / entry["clip"])
                heard = asr(audio, generate_kwargs={"language": "english", "task": "transcribe"})["text"].strip()
                cache[cache_key] = heard
                transcribed += 1
            else:
                cache_hits += 1
            # Word clips that use explicit /phonemes/ overrides are still evaluated against their English display text.
            expected_text = entry.get("text", speech) if match else speech
            expected_words = normalize_words(expected_text)
            errors = edit_distance(expected_words, normalize_words(heard))
            words.append(WordResult(entry["clip"], entry["ids"], expected_text, heard, errors, len(expected_words)))
        if transcribed > 0 and transcribed % 50 == 0:
            save_cache(cache)
        if index % 50 == 0:
            print(
                f"{index}/{len(clips)} clips ({transcribed} new, {cache_hits} cached), {time.time() - started:.0f} s",
                file=sys.stderr,
            )

    save_cache(cache)
    if only is not None:
        for r in words:
            status = "OK" if r.errors == 0 else f"ERR({r.errors})"
            print(f"{status}\t{r.clip}\t{','.join(r.ids)}\texpected={r.expected!r}\theard={r.heard!r}")
        for s in sounds:
            status = "OK" if s.ok else "ERR"
            print(f"{status}\t{s.clip}\t{','.join(s.ids)}\tphonemes={s.phonemes!r}\theard={s.heard!r}")
        return
    write_report(profile, words, sounds)


def write_report(profile: dict, words: list[WordResult], sounds: list[SoundResult]) -> None:
    total_words = sum(r.words for r in words)
    total_errors = sum(r.errors for r in words)
    wrong = [r for r in words if r.errors > 0]
    sizes = [(CLIP_DIR / p).stat().st_size for p in [r.clip for r in words] + [s.clip for s in sounds]]
    lines = [
        "# Voice round trip",
        "",
        "Generated by `npm run voice:round-trip`. Do not edit by hand.",
        "",
        "Every committed clip is transcribed by an open speech recognizer and compared with the text",
        "it should say. Nobody listened to these clips while they were made, so this is the objective",
        "check. It cannot judge warmth or pace; a person still needs to listen before release.",
        "",
        "## Summary",
        "",
        f"- Voice: {profile['model']}, voice `{profile['voice']}`, speed {profile['speed']}, revision {profile['revision']}",
        f"- Clips: {len(words) + len(sounds)} ({len(words)} words and sentences, {len(sounds)} letter sounds)",
        f"- Total size of committed clips: {sum(sizes) / 1024:.0f} KB, mean {sum(sizes) / max(1, len(sizes)) / 1024:.1f} KB",
        f"- Word clips: {total_words} words, {total_errors} word errors, word error rate {100 * total_errors / max(1, total_words):.2f}%",
        f"- Word clips the recognizer got wrong: {len(wrong)} of {len(words)}",
        f"- Letter sounds whose first sound matched: {sum(s.ok for s in sounds)} of {len(sounds)}",
        "",
        "## Method",
        "",
        f"- Words and sentences: `{WHISPER}` on the CPU, English, no prompt. Both sides are lower-cased,",
        "  stripped of punctuation, and numerals become words. A lone letter name may come back as a",
        "  word that sounds the same (\"bee\" for b), which counts as the letter. A true homophone of",
        "  the expected word (\"son\" for sun) and a spelling variant (\"trashcan\", \"6th\") count as",
        "  right, because no recognizer can hear the difference. A word Whisper repeats in a loop counts once.",
        f"- Letter sounds: `{PHONEMES}`, a phoneme recognizer. A clip passes when its first sound,",
        "  ignoring a glottal stop, is the letter's sound. The recognizer is trained on sentences and",
        "  blurs isolated vowels, so it can confirm that a vowel clip starts with a clean vowel but",
        "  cannot tell the short a from the short o. It writes the English j sound as the similar",
        "  `tɕ` of its multilingual alphabet, so that counts for j.",
        "",
        "## Word clips the recognizer got wrong",
        "",
    ]
    if wrong:
        lines += ["| Clip | Strings | Expected | Heard | Word errors |", "| --- | --- | --- | --- | --- |"]
        for r in sorted(wrong, key=lambda r: (-r.errors, r.expected)):
            lines.append(f"| `{r.clip}` | {', '.join(r.ids)} | {r.expected} | {r.heard} | {r.errors} |")
    else:
        lines.append("None.")
    lines += ["", "## Letter sounds", "", "| Letter | Phonemes | Heard | First sound |", "| --- | --- | --- | --- |"]
    for s in sorted(sounds, key=lambda s: s.ids[0]):
        letters = ", ".join(i.split(".")[-1] for i in s.ids)
        lines.append(f"| {letters} | `{s.phonemes}` | `{s.heard}` | {'matches' if s.ok else 'does not match'} |")
    lines.append("")
    REPORT.write_text("\n".join(lines))
    print(f"Wrote {REPORT}", file=sys.stderr)


if __name__ == "__main__":
    main()
