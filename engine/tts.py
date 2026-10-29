"""
Narration synthesis with word-level timestamps.

Voice: Kokoro-82M (Apache-2.0) via kokoro-onnx, using a copy of the model that also
outputs the duration predictor (models/kokoro-v1.0-timed.onnx), so every word gets an
exact start/end time. Those times drive captions and on-screen animation cues.

Script markup understood here (inside a scene's `say:` text):
  {{3}}                 cue 3 fires when the next word starts (visual reveals)
  [[pause 0.8]]         insert 0.8 s of silence
  {1944|nineteen forty-four}   show "1944" in captions, say "nineteen forty-four"
  *word*                emphasis marker: shown highlighted in captions (voice unchanged)
"""
from __future__ import annotations

import difflib
import functools
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "models" / "kokoro-v1.0-timed.onnx"
VOICES = ROOT / "models" / "voices-v1.0.bin"
LEXICON = Path(__file__).resolve().parent / "lexicon.yaml"
SR = 24000

# ----------------------------------------------------------------------------- numbers

_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
_ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth",
        "nine": "ninth", "twelve": "twelfth"}
UNITS = {"m", "km", "nm", "ft", "feet", "metres", "meters", "kg", "kt", "kts", "knots", "hours", "hrs",
         "minutes", "min", "seconds", "sec", "members", "states", "pages", "percent", "%", "hpa", "mb",
         "lux", "people", "passengers", "aircraft", "flights", "nautical", "miles", "litres", "lbs", "pilots"}


def _two(n: int) -> str:
    if n < 20:
        return _ONES[n]
    t, o = divmod(n, 10)
    return _TENS[t] + ("" if o == 0 else " " + _ONES[o])


def num_words(n: int) -> str:
    """Integer to words, British/Indian style ('one hundred and five')."""
    if n < 0:
        return "minus " + num_words(-n)
    if n < 100:
        return _two(n)
    if n < 1000:
        h, r = divmod(n, 100)
        return _ONES[h] + " hundred" + ("" if r == 0 else " and " + _two(r))
    for div, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= div:
            q, r = divmod(n, div)
            head = num_words(q) + " " + name
            if r == 0:
                return head
            return head + (" and " if r < 100 else " ") + num_words(r)
    return str(n)


def year_words(n: int) -> str:
    if 2000 <= n <= 2009:
        return "two thousand" + ("" if n == 2000 else " " + _ONES[n - 2000])
    hi, lo = divmod(n, 100)
    if lo == 0:
        return _two(hi) + " hundred"
    if lo < 10:
        return _two(hi) + " oh " + _ONES[lo]
    return _two(hi) + " " + _two(lo)


def ordinal_words(n: int) -> str:
    w = num_words(n).split()
    last = w[-1]
    if last in _ORD:
        w[-1] = _ORD[last]
    elif last.endswith("y"):
        w[-1] = last[:-1] + "ieth"
    else:
        w[-1] = last + "th"
    return " ".join(w)


# ----------------------------------------------------------------------------- tokens

@dataclass
class Token:
    display: str            # what captions show (with punctuation)
    spoken: list[str]       # words sent to the voice
    emphasis: bool = False
    cue_before: list[int] = field(default_factory=list)   # cues that fire when this word starts
    cue_after: list[int] = field(default_factory=list)    # cues that fire when this word ends
    start: float = 0.0
    end: float = 0.0


MARKUP = re.compile(r"\{\{(\d+)\}\}|\[\[pause\s+([\d.]+)\]\]|\{([^{}|]+)\|([^{}]+)\}|(\S+)")
_ABBR = {"e.g.": "for example", "i.e.": "that is", "vs": "versus", "vs.": "versus", "&": "and",
         "No.": "number", "Nos.": "numbers", "Art.": "Article", "approx.": "approximately", "etc.": "etcetera",
         "Govt.": "Government", "Dept.": "Department", "Sec.": "Section", "Para": "Para"}


def _split_punct(word: str) -> tuple[str, str, str]:
    m = re.match(r"^([\"'“‘(\[]*)(.*?)([\"'”’)\].,;:!?…]*)$", word)
    return m.group(1), m.group(2), m.group(3)


def spoken_form(core: str, nxt: str | None) -> list[str]:
    """How one written word should be spoken (list of words for the phonemizer)."""
    if core in _ABBR:
        return _ABBR[core].split()
    low_next = (nxt or "").lower().strip(".,;:")
    m = re.fullmatch(r"(\d{1,3}(?:,\d{3})+|\d+)", core)
    if m:
        n = int(core.replace(",", ""))
        if 1100 <= n <= 2099 and "," not in core and low_next not in UNITS:
            return year_words(n).split()
        return num_words(n).split()
    m = re.fullmatch(r"(\d+)(st|nd|rd|th)", core)
    if m:
        return ordinal_words(int(m.group(1))).split()
    m = re.fullmatch(r"(\d+)\.(\d+)", core)
    if m:
        return num_words(int(m.group(1))).split() + ["point"] + [_ONES[int(d)] for d in m.group(2)]
    m = re.fullmatch(r"(\d+)%", core)
    if m:
        return num_words(int(m.group(1))).split() + ["percent"]
    m = re.fullmatch(r"(\d+)-(\d+)", core)          # ranges 5-10
    if m:
        return num_words(int(m.group(1))).split() + ["to"] + num_words(int(m.group(2))).split()
    if re.fullmatch(r"[A-Za-z]+(?:-[A-Za-z]+)+", core) and not re.fullmatch(r"[A-Z]+-[A-Z]+", core):
        return core.replace("-", " ").split()       # air-to-ground -> air to ground
    return [core]


def parse(text: str) -> tuple[list[Token], list[tuple[int, float]]]:
    """Parse narration markup into tokens + pause positions (pause after token index)."""
    text = text.replace("—", ", ").replace("–", ", ").replace(" ,", ",")
    raw = [m for m in MARKUP.finditer(text)]
    tokens: list[Token] = []
    pauses: list[tuple[int, float]] = []
    pending_cues: list[int] = []
    words = []
    for m in raw:
        if m.group(1):
            words.append(("cue", int(m.group(1))))
        elif m.group(2):
            words.append(("pause", float(m.group(2))))
        elif m.group(3):
            words.append(("pair", (m.group(3).strip(), m.group(4).strip())))
        else:
            words.append(("word", m.group(5)))
    for i, (kind, val) in enumerate(words):
        if kind == "cue":
            pending_cues.append(val)
            continue
        if kind == "pause":
            # a cue written right before a pause fires as the pause begins
            if pending_cues and tokens:
                tokens[-1].cue_after += pending_cues
                pending_cues = []
            pauses.append((len(tokens) - 1, val))
            continue
        if kind == "pair":
            disp, say = val
            tok = Token(display=disp, spoken=say.replace("-", " ").split())
        else:
            word = val
            emph = word.startswith("*") and word.rstrip(".,;:!?").endswith("*") and len(word) > 2
            if emph:
                word = word.replace("*", "")
            lead, core, trail = _split_punct(word)
            nxt = None
            for k2, v2 in words[i + 1:]:
                if k2 == "word":
                    nxt = v2
                    break
                if k2 == "pair":
                    nxt = v2[0]
                    break
            if not core:
                if tokens:
                    tokens[-1].display += word
                    if tokens[-1].spoken:
                        tokens[-1].spoken[-1] += trail
                continue
            sp = spoken_form(core, nxt)
            if trail:
                sp[-1] = sp[-1] + trail
            tok = Token(display=lead + core + trail, spoken=sp, emphasis=emph)
        tok.cue_before = pending_cues
        pending_cues = []
        tokens.append(tok)
    if pending_cues and tokens:          # cue at the very end -> fires when the last word ends
        tokens[-1].cue_after += pending_cues
    return tokens, pauses


def parse_all(text: str) -> tuple[list[Token], dict[int, float], list[int]]:
    """Parse a whole scene (paragraphs separated by blank lines). Returns tokens,
    {token index: seconds of silence after it} (explicit pauses) and the last token index of each paragraph."""
    paragraphs = [p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    tokens: list[Token] = []
    cut: dict[int, float] = {}
    ends: list[int] = []
    for para in paragraphs:
        toks, pauses = parse(para)
        base = len(tokens)
        for idx, sec in pauses:
            cut[base + idx] = cut.get(base + idx, 0) + sec
        tokens += toks
        if toks:
            ends.append(len(tokens) - 1)
    return tokens, cut, ends


def cue_times(tokens: list[Token]) -> dict[int, float]:
    cues: dict[int, float] = {}
    for t in tokens:
        for c in t.cue_before:
            cues[c] = t.start
        for c in t.cue_after:
            cues[c] = t.end
    return cues


# ----------------------------------------------------------------------------- phonemes

_LETTERS = {"A": "eɪ", "B": "biː", "C": "siː", "D": "diː", "E": "iː", "F": "ɛf", "G": "dʒiː", "H": "eɪtʃ",
            "I": "aɪ", "J": "dʒeɪ", "K": "keɪ", "L": "ɛl", "M": "ɛm", "N": "ɛn", "O": "oʊ", "P": "piː",
            "Q": "kjuː", "R": "ɑːɹ", "S": "ɛs", "T": "tiː", "U": "juː", "V": "viː", "W": "dʌbəljuː",
            "X": "ɛks", "Y": "waɪ", "Z": "zɛd"}
_STRIP = str.maketrans("", "", "ˈˌː.,;:!?\"()“” ")
_VOWEL_START = set("aeiouɑɛɪʊʌəæɔ")


def spell(acr: str) -> str:
    """Crisp letter-by-letter reading: only the last letter is stressed and long,
    the others are short and unstressed (so 'DGCA' is quick and clear, not drawn out).
    A secondary-stress mark separates letters that would otherwise blend (C-A -> 'see-ay')."""
    plural = acr.endswith("s") and acr[:-1].isupper()
    letters = [c for c in (acr[:-1] if plural else acr) if c in _LETTERS]
    out = ""
    for i, c in enumerate(letters):
        p = _LETTERS[c]
        last = i == len(letters) - 1
        if last:
            out += "ˈ" + p
        else:
            short = p.replace("ː", "")
            if out and short[0] in _VOWEL_START and out[-1] not in "bcdfghjklmnpqrstvwxzʃʒθðŋɹ":
                short = "ˌ" + short
            out += short
    return out + ("z" if plural else "")


class Phonemizer:
    def __init__(self, kokoro, lang: str = "en-us"):
        self.k = kokoro
        self.lang = lang
        self.vocab = set(kokoro.tokenizer.vocab.keys())
        self.lex = yaml.safe_load(LEXICON.read_text(encoding="utf-8")) or {}
        bad = {w: "".join(sorted(set(p) - self.vocab)) for w, p in self.lex.items() if set(p) - self.vocab}
        if bad:
            raise ValueError(f"lexicon has symbols the voice can't say: {bad}")

    def acronym_letters(self, word: str) -> int:
        """Number of letters if this word is read letter-by-letter, else 0."""
        _, core, _ = _split_punct(word)
        if core in self.lex:
            return 0
        if core.endswith("'s"):
            core = core[:-2]
        if re.fullmatch(r"[A-Z]{2,6}s?", core) and not (core.endswith("s") and len(core) == 2):
            return len(core.rstrip("s")) if core.endswith("s") and core[:-1].isupper() else len(core)
        return 0

    @functools.lru_cache(maxsize=20000)
    def espeak(self, text: str) -> str:
        return self.k.tokenizer.phonemize(text, self.lang)

    def fixed(self, word: str) -> str | None:
        """IPA for a word from the lexicon / acronym rule, else None (use espeak)."""
        lead, core, trail = _split_punct(word)
        if not core:
            return None
        ipa = self.lex.get(core)
        if ipa is None and core.endswith("'s") and core[:-2] in self.lex:
            ipa = self.lex[core[:-2]] + "z"
        if ipa is None and re.fullmatch(r"[A-Z]{2,6}s?", core):
            if not (core.endswith("s") and len(core) == 2):
                ipa = spell(core)
        if ipa is None and re.fullmatch(r"[A-Z]{2,6}'s", core):
            ipa = spell(core[:-2]) + "z"
        if ipa is None:
            return None
        punct = "".join(c for c in trail if c in ".,;:!?")
        return ipa + punct

    def words_to_phonemes(self, words: list[str]) -> list[list[str]]:
        """For each spoken word, the phoneme word(s) the voice will say.
        Runs of ordinary words are phonemized together (natural reductions like 'of the'),
        then aligned back to the words. A merged phoneme word is shared: the first word owns it
        and the following words get an empty list (their time is split later)."""
        out: list[list[str] | None] = [None] * len(words)
        run: list[int] = []

        def flush():
            if not run:
                return
            ws = [words[i] for i in run]
            sent = self.espeak(" ".join(ws))
            pws = sent.split()
            per = [self.espeak(w) for w in ws]
            mapping = _align(per, pws)
            for (a, b), group in mapping:
                idxs = [run[j] for j in range(a, b)]
                out[idxs[0]] = group
                for extra in idxs[1:]:
                    out[extra] = []
            run.clear()

        for i, w in enumerate(words):
            f = self.fixed(w)
            if f is not None:
                flush()
                out[i] = [f]
            else:
                run.append(i)
        flush()
        return [o if o is not None else [] for o in out]


def _sim(a: str, b: str) -> float:
    a, b = a.translate(_STRIP), b.translate(_STRIP)
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _align(per: list[str], pws: list[str]) -> list[tuple[tuple[int, int], list[str]]]:
    """DP alignment of per-word phonemes (n) to sentence phoneme words (m).
    Steps: 1:1, 2:1, 3:1 (merges), 1:2, 1:3 (splits). Returns [((wa, wb), [phoneme words])]."""
    n, m = len(per), len(pws)
    INF = -1e9
    best = [[INF] * (m + 1) for _ in range(n + 1)]
    back: list[list[tuple[int, int] | None]] = [[None] * (m + 1) for _ in range(n + 1)]
    best[0][0] = 0.0
    steps = [(1, 1), (2, 1), (3, 1), (1, 2), (1, 3), (1, 0), (0, 1)]
    for i in range(n + 1):
        for j in range(m + 1):
            if best[i][j] == INF:
                continue
            for di, dj in steps:
                ni, nj = i + di, j + dj
                if ni > n or nj > m:
                    continue
                if di == 0 or dj == 0:
                    score = best[i][j] - 1.5          # skip penalty
                else:
                    s = _sim("".join(per[i:ni]), "".join(pws[j:nj]))
                    score = best[i][j] + s - 0.15 * (di + dj - 2)
                if score > best[ni][nj]:
                    best[ni][nj] = score
                    back[ni][nj] = (di, dj)
    res = []
    i, j = n, m
    while i > 0 or j > 0:
        di, dj = back[i][j]
        res.append(((i - di, i), pws[j - dj:j]))
        i, j = i - di, j - dj
    res.reverse()
    # word(s) with no phoneme word (skip step) -> phonemize them alone so nothing is lost
    fixed = []
    for (a, b), g in res:
        if b > a and not g:
            g = [per[k] for k in range(a, b)]
        if b > a:
            fixed.append(((a, b), g))
    return fixed


# ----------------------------------------------------------------------------- synthesis

def _tighten(audio: np.ndarray, start: float, end: float, target: float,
             margin: float = 0.02, fade: float = 0.006) -> tuple[np.ndarray, float]:
    """Time-compress audio[start:end] (seconds) to about `target` seconds without changing pitch
    (ffmpeg atempo), splicing back with short crossfades. Returns (new audio, seconds removed)."""
    import subprocess
    s0 = max(0, int((start - margin) * SR))
    e0 = min(len(audio), int((end + margin) * SR))
    seg = audio[s0:e0]
    old = len(seg) / SR
    new = old - ((end - start) - target)
    tempo = min(1.45, max(1.0, old / max(new, 0.05)))
    if tempo <= 1.01:
        return audio, 0.0
    p = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
         "-af", f"atempo={tempo:.4f}", "-f", "f32le", "-ar", str(SR), "-ac", "1", "pipe:1"],
        input=seg.astype(np.float32).tobytes(), capture_output=True, check=True)
    comp = np.frombuffer(p.stdout, dtype=np.float32).copy()
    if len(comp) < 2 * int(fade * SR) + 10:
        return audio, 0.0
    f = int(fade * SR)
    w = np.linspace(0.0, 1.0, f, dtype=np.float32)
    comp[:f] = seg[:f] * (1 - w) + comp[:f] * w
    comp[-f:] = comp[-f:] * (1 - w) + seg[-f:] * w
    out = np.concatenate([audio[:s0], comp, audio[e0:]])
    return out, (len(seg) - len(comp)) / SR


class Narrator:
    """Human-paced narration: every sentence synthesized on its own with a slight (seeded, repeatable)
    variation in pace, and varied pauses between sentences / longer ones between paragraphs."""

    def __init__(self, voice: str = "af_heart", speed: float = 0.9, lang: str = "en-us",
                 sentence_pause: float = 0.42, clause_pause: float = 0.15,
                 paragraph_pause: float = 0.8, jitter: float = 0.025):
        self.paragraph_pause, self.jitter = paragraph_pause, jitter
        from kokoro_onnx import Kokoro
        self.k = Kokoro(str(MODEL), str(VOICES))
        assert self.k.has_timings, "model must expose a 'duration' output"
        self.voice, self.speed, self.lang = voice, speed, lang
        self.sentence_pause, self.clause_pause = sentence_pause, clause_pause
        self.ph = Phonemizer(self.k, lang)

    def _synth_chunk(self, tokens: list[Token]) -> np.ndarray:
        """Synthesize tokens (one chunk, no explicit pauses inside); fills token start/end."""
        spoken: list[str] = []
        owner: list[int] = []
        for ti, t in enumerate(tokens):
            for w in t.spoken:
                spoken.append(w)
                owner.append(ti)
        groups = self.ph.words_to_phonemes(spoken)
        pw_list: list[str] = []
        pw_words: list[list[int]] = []          # spoken word indices for each phoneme word
        for si, g in enumerate(groups):
            if g:
                for pw in g:
                    pw_list.append(pw)
                    pw_words.append([si])
            else:                               # merged into previous phoneme word
                if pw_words:
                    pw_words[-1].append(si)
        vocab = self.ph.vocab
        pw_list = ["".join(c for c in pw if c in vocab) for pw in pw_list]
        phon = " ".join(pw_list)
        audio, sr, spoken_t = self.k.create_timed(
            phon, self.voice, speed=self.speed, lang=self.lang, is_phonemes=True,
            trim=True, sentence_pause=self.sentence_pause, clause_pause=self.clause_pause)
        # walk the timed phonemes against our string to get each phoneme word's span
        spans = []
        ti = 0
        for pw in pw_list:
            st = en = None
            for ch in pw:
                look = ti
                while look < len(spoken_t) and spoken_t[look].phoneme != ch and look - ti < 3:
                    look += 1
                if look < len(spoken_t) and spoken_t[look].phoneme == ch:
                    ti = look
                    if ch not in ".,;:!?\"“”":
                        st = spoken_t[ti].start if st is None else st
                        en = spoken_t[ti].end
                    ti += 1
            if ti < len(spoken_t) and spoken_t[ti].phoneme == " ":
                ti += 1
            spans.append((st, en))
        last = 0.0
        for i, (st, en) in enumerate(spans):
            if st is None:
                st = last
            if en is None or en < st:
                en = st + 0.15
            spans[i] = (st, en)
            last = en
        # spoken-word times: split a phoneme word's span across the words that share it
        sw_time = [(0.0, 0.0)] * len(spoken)
        for (st, en), sws in zip(spans, pw_words):
            weights = [max(1, len(spoken[s])) for s in sws]
            tot = sum(weights)
            cur = st
            for s, wgt in zip(sws, weights):
                d = (en - st) * wgt / tot
                sw_time[s] = (cur, cur + d)
                cur += d
        for s, (st, en) in enumerate(sw_time):
            t = tokens[owner[s]]
            if t.start == 0.0 and t.end == 0.0:
                t.start, t.end = st, en
            else:
                t.start, t.end = min(t.start, st), max(t.end, en)
        audio = audio.astype(np.float32)
        # keep spelled acronyms crisp: tighten any that the model drew out (e.g. before a comma)
        for ti in reversed(range(len(tokens))):
            t = tokens[ti]
            letters = self.ph.acronym_letters(t.spoken[-1] if t.spoken else "")
            if not letters or len(t.spoken) != 1:
                continue
            final = bool(re.search(r"[.,;:!?]$", t.display))
            target = (0.14 * letters + 0.12) * (1.12 if final else 1.0) * (0.9 / max(self.speed, 0.5))
            dur = t.end - t.start
            if dur > target * 1.06:
                audio, removed = _tighten(audio, t.start, t.end, target)
                t.end -= removed
                for later in tokens[ti + 1:]:
                    later.start -= removed
                    later.end -= removed
        return audio

    def synth(self, text: str) -> dict:
        """Synthesize one scene's narration. Returns audio + timed tokens + cue times."""
        import random
        import zlib
        rng = random.Random(zlib.crc32(text.encode("utf-8")))
        tokens, cut, ends = parse_all(text)
        for e in ends[:-1]:
            cut[e] = cut.get(e, 0) + self.paragraph_pause
        if not tokens:
            return {"audio": np.zeros(0, np.float32), "tokens": [], "cues": {}, "duration": 0.0}
        # one chunk per sentence (or up to an explicit pause): natural, slightly varied pacing
        chunks, cur = [], []
        for i, t in enumerate(tokens):
            cur.append(t)
            ends_sentence = bool(re.search(r"[.!?…][\"”’)]*$", t.display))
            if i in cut or ends_sentence:
                pause = cut.get(i, 0.0)
                if ends_sentence and i not in cut:
                    pause = self.sentence_pause + (0.08 if t.display.rstrip("\"”’)").endswith("?") else 0.0)
                    pause += rng.uniform(-0.06, 0.1)
                chunks.append((cur, pause))
                cur = []
        if cur:
            chunks.append((cur, 0.0))
        if chunks:
            chunks[-1] = (chunks[-1][0], cut.get(len(tokens) - 1, 0.0))
        parts, offset = [], 0.0
        base_speed = self.speed
        for toks, pause in chunks:
            self.speed = base_speed * (1 + rng.uniform(-self.jitter, self.jitter * 0.8))
            try:
                a = self._synth_chunk(toks)
            finally:
                self.speed = base_speed
            for t in toks:
                t.start += offset
                t.end += offset
            parts.append(a)
            offset += len(a) / SR
            if pause:
                parts.append(np.zeros(int(pause * SR), np.float32))
                offset += pause
        audio = np.concatenate(parts)
        return {"audio": audio, "tokens": tokens, "cues": cue_times(tokens), "duration": len(audio) / SR}


if __name__ == "__main__":
    import sys
    import soundfile as sf
    n = Narrator(voice=sys.argv[2] if len(sys.argv) > 2 else "af_heart")
    r = n.synth(sys.argv[1])
    sf.write("/tmp/tts_test.wav", r["audio"], SR)
    for t in r["tokens"]:
        print(f"{t.start:6.2f} {t.end:6.2f}  {t.display}")
    print("cues", r["cues"], "dur", r["duration"])
