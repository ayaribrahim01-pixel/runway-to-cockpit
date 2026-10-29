"""
Original background music, generated in code (no samples, no licences, no Content ID claims).

Styles (each seeded, so every episode/section sounds related but not identical):
  doc     calm documentary bed: warm pad, soft plucked arpeggio, sub bass       (84 bpm)
  drive   brighter and moving: pluck arp, bass pulse, light kick/hat/clap        (100 bpm)
  wonder  open and airy: pad + piano-like arpeggio, no drums                     (72 bpm)
  pulse   focused/tense for quizzes and traps: minor, pulsing bass, bell plucks  (92 bpm)

Each style is built from three seamless 8-bar loops (A: intro layer, B: +melody, C: full)
arranged to length; `make_score` stitches different styles per section with crossfades.
"""
from __future__ import annotations

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000

PROGRESSIONS = {
    "major": [
        [(0, "maj9"), (9, "m7"), (5, "maj7"), (7, "sus")],
        [(9, "m7"), (5, "maj7"), (0, "maj9"), (7, "sus")],
        [(0, "maj9"), (4, "m7"), (5, "maj7"), (7, "sus")],
        [(5, "maj7"), (7, "sus"), (9, "m7"), (0, "maj9")],
    ],
    "minor": [
        [(0, "m9"), (8, "maj7"), (3, "maj7"), (10, "sus")],
        [(0, "m9"), (5, "m7"), (8, "maj7"), (7, "sus")],
    ],
}
SHAPES = {
    "maj9": [0, 4, 7, 11, 14],
    "maj7": [0, 4, 7, 11],
    "m7": [0, 3, 7, 10],
    "m9": [0, 3, 7, 10, 14],
    "sus": [0, 5, 7, 10, 14],
}
STYLES = {
    "doc": dict(bpm=84, mode="major", arp="pluck", arp_div=2, bass="sub", drums=False, pad=1.0, cutoff=1100, tonic=(50, 57)),
    "drive": dict(bpm=100, mode="major", arp="pluck", arp_div=2, bass="pulse", drums=True, pad=0.7, cutoff=1700, tonic=(52, 58)),
    "wonder": dict(bpm=72, mode="major", arp="piano", arp_div=2, bass="none", drums=False, pad=0.85, cutoff=900, tonic=(48, 55)),
    "pulse": dict(bpm=92, mode="minor", arp="bell", arp_div=1, bass="pulse8", drums=False, pad=0.6, cutoff=1300, tonic=(49, 55)),
}


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _saw(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    return 2.0 * ((freq * t + phase) % 1.0) - 1.0


def _env(n: int, attack: float, release: float) -> np.ndarray:
    e = np.ones(n, np.float32)
    a = min(n, int(attack * SR))
    r = min(n - a, int(release * SR))
    if a:
        e[:a] = np.linspace(0, 1, a) ** 1.6
    if r:
        e[n - r:] *= np.linspace(1, 0, r) ** 1.4
    return e


def _reverb_ir(seconds: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t / (seconds / 6.5))[:, None]
    sos = butter(2, [180, 7000], btype="band", fs=SR, output="sos")
    ir = sosfilt(sos, ir, axis=0)
    return (ir / np.sqrt((ir**2).sum(axis=0))).astype(np.float32)


def _loop_reverb(x: np.ndarray, ir: np.ndarray, wet: float) -> np.ndarray:
    """Reverb that wraps its tail to the loop start, so the loop repeats seamlessly."""
    n = len(x)
    out = np.zeros_like(x)
    for ch in range(2):
        y = fftconvolve(x[:, ch], ir[:, ch])
        tail = y[n:]
        y = y[:n].copy()
        k = 0
        while k < len(tail):
            seg = tail[k:k + n]
            y[: len(seg)] += seg
            k += n
        out[:, ch] = y
    return (1 - wet) * x + wet * out


def _note(kind: str, f0: float, ln: int, vel: float) -> np.ndarray:
    t = np.arange(ln) / SR
    if kind == "piano":
        tone = np.sin(2 * np.pi * f0 * t) + 0.45 * np.sin(2 * np.pi * 2 * f0 * t) * np.exp(-t / 0.4) + 0.18 * np.sin(2 * np.pi * 3 * f0 * t) * np.exp(-t / 0.25)
        tone *= np.exp(-t / 0.75)
    elif kind == "bell":
        tone = np.sin(2 * np.pi * f0 * t) + 0.5 * np.sin(2 * np.pi * 2.76 * f0 * t) * np.exp(-t / 0.18) + 0.25 * np.sin(2 * np.pi * 5.4 * f0 * t) * np.exp(-t / 0.08)
        tone *= np.exp(-t / 0.5)
    else:  # pluck
        tone = np.sin(2 * np.pi * f0 * t) + 0.28 * np.sin(2 * np.pi * 2 * f0 * t) + 0.08 * np.sin(2 * np.pi * 3 * f0 * t)
        tone *= np.exp(-t / 0.22)
    a = int(0.004 * SR)
    tone[:a] *= np.linspace(0, 1, a)
    return tone * vel


def _drums(n_loop: int, beat: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = np.zeros((n_loop, 2), np.float32)
    nb = int(round(n_loop / (beat * SR)))
    kl = int(0.35 * SR)
    t = np.arange(kl) / SR
    kick = np.sin(2 * np.pi * np.cumsum(45 + 70 * np.exp(-t / 0.04)) / SR) * np.exp(-t / 0.18)
    hl = int(0.06 * SR)
    hat = sosfilt(butter(2, 7000, btype="high", fs=SR, output="sos"), rng.standard_normal(hl)) * np.exp(-np.arange(hl) / SR / 0.012)
    cl = int(0.18 * SR)
    clap = sosfilt(butter(2, [900, 3500], btype="band", fs=SR, output="sos"), rng.standard_normal(cl)) * np.exp(-np.arange(cl) / SR / 0.05)
    for bi in range(nb):
        s = int(bi * beat * SR)
        if bi % 4 in (0, 2):
            e = min(n_loop, s + kl)
            out[s:e] += (kick[: e - s] * 0.9)[:, None]
        if bi % 4 in (1, 3):
            e = min(n_loop, s + cl)
            out[s:e, 0] += clap[: e - s] * 0.28
            out[s:e, 1] += clap[: e - s] * 0.24
        hs = s + int(0.5 * beat * SR)
        e = min(n_loop, hs + hl)
        if hs < n_loop:
            out[hs:e, 0] += hat[: e - hs] * 0.16
            out[hs:e, 1] += hat[: e - hs] * 0.2
    return out


def make_loops(seed: int = 1, style: str = "doc"):
    st = STYLES.get(style, STYLES["doc"])
    rng = np.random.default_rng(seed)
    bpm = st["bpm"]
    beat = 60 / bpm
    bar = 4 * beat
    lo, hi = st["tonic"]
    tonic = lo + int(rng.integers(0, hi - lo + 1))
    progs = PROGRESSIONS[st["mode"]]
    prog = progs[int(rng.integers(0, len(progs)))]
    chord_len = 2 * bar
    n_chord = int(chord_len * SR)
    n_loop = n_chord * len(prog)
    pad = np.zeros((n_loop, 2), np.float32)
    arp = np.zeros((n_loop, 2), np.float32)
    bass = np.zeros((n_loop, 2), np.float32)
    lfo_t = np.arange(n_chord) / SR
    for ci, (deg, q) in enumerate(prog):
        root = tonic + deg
        notes = [root + s for s in SHAPES[q]]
        seg = slice(ci * n_chord, (ci + 1) * n_chord)
        p = np.zeros((n_chord, 2), np.float32)
        for m in notes:
            f0 = midi_hz(m)
            for det, pan in ((-0.09, 0.2), (0.0, 0.5), (0.11, 0.8)):
                w = _saw(f0 * 2 ** (det / 12), n_chord, rng.random())
                p[:, 0] += w * (1 - pan)
                p[:, 1] += w * pan
        cutoff = st["cutoff"] + 0.45 * st["cutoff"] * np.sin(2 * np.pi * lfo_t / (chord_len * 2) + ci)
        blk = SR // 10
        out = np.zeros_like(p)
        for i in range(0, n_chord, blk):
            fc = float(cutoff[min(i, n_chord - 1)])
            sos = butter(2, fc, btype="low", fs=SR, output="sos")
            out[i:i + blk] = sosfilt(sos, p[i:i + blk], axis=0)
        out *= _env(n_chord, 1.4, 1.2)[:, None]
        pad[seg] += out / (len(notes) * 3)
        # arpeggio
        order = notes + notes[-2:0:-1]
        step = int(beat / st["arp_div"] * SR)
        for j in range(n_chord // step):
            if st["arp"] == "bell" and j % 2:
                continue
            m = order[j % len(order)] + (12 if st["arp"] != "bell" else 24)
            ln = int((1.6 if st["arp"] == "piano" else 0.9) * SR)
            vel = 0.55 + 0.35 * rng.random()
            tone = _note(st["arp"], midi_hz(m), ln, vel)
            start = ci * n_chord + j * step
            end = min(n_loop, start + ln)
            pan = 0.35 + 0.3 * ((j % 4) / 3)
            arp[start:end, 0] += tone[: end - start] * (1 - pan)
            arp[start:end, 1] += tone[: end - start] * pan
        # bass
        if st["bass"] != "none":
            div = {"sub": 2.0, "pulse": 1.0, "pulse8": 0.5}[st["bass"]]
            k = 0.0
            while k < chord_len / beat - 1e-6:
                f0 = midi_hz(root - 12)
                ln = int(beat * (1.9 if st["bass"] == "sub" else div * 0.9) * SR)
                t = np.arange(ln) / SR
                tone = np.sin(2 * np.pi * f0 * t) * np.minimum(1, t / 0.02) * np.exp(-t / (0.9 if st["bass"] == "sub" else 0.25))
                tone += 0.25 * np.sin(2 * np.pi * 2 * f0 * t) * np.exp(-t / 0.12)
                start = ci * n_chord + int(k * beat * SR)
                end = min(n_loop, start + ln)
                bass[start:end] += tone[: end - start, None] * 0.5
                k += div
    d = int(beat * 0.75 * SR)
    echo = np.zeros_like(arp)
    echo[d:, 0] += arp[:-d, 1] * 0.35
    echo[2 * d:, 1] += arp[: -2 * d, 0] * 0.22
    arp = arp + echo
    ir = _reverb_ir(2.8 if style != "wonder" else 3.6, seed + 5)
    pad = _loop_reverb(pad, ir, 0.35)
    arp = _loop_reverb(arp, ir, 0.45 if style != "drive" else 0.3)
    air = np.random.default_rng(seed + 9).standard_normal((n_loop, 2)).astype(np.float32)
    air = sosfilt(butter(2, [2500, 7000], btype="band", fs=SR, output="sos"), air, axis=0) * 0.012

    def norm(x, peak):
        return x / (np.max(np.abs(x)) + 1e-9) * peak

    pad = norm(pad, 0.5 * st["pad"])
    arp = norm(arp, 0.32)
    bass = norm(bass, 0.3) if np.any(bass) else bass
    drums = norm(_drums(n_loop, beat, seed + 21), 0.26) if st["drums"] else np.zeros_like(pad)
    A = pad + air + drums * 0.5
    B = pad + arp * 0.8 + air + drums * 0.8
    C = pad + arp + bass + air + drums
    return {"A": A.astype(np.float32), "B": B.astype(np.float32), "C": C.astype(np.float32)}, n_loop


def make_bed(seconds: float, seed: int = 1, intro: float = 0.0, style: str = "doc", fade_in: float = 3.0, fade_out: float = 4.0) -> np.ndarray:
    """Arrange a style's loops to `seconds`: A first, then alternating B/C, with fades."""
    loops, n_loop = make_loops(seed, style)
    total = int(seconds * SR)
    plan = ["A", "B", "C", "B", "C", "C", "B"]
    parts = []
    k = 0
    while sum(len(p) for p in parts) < total + n_loop:
        parts.append(loops[plan[min(k, len(plan) - 1)] if k < len(plan) else ("C" if k % 2 else "B")])
        k += 1
    xf = int(0.5 * SR)
    out = parts[0].copy()
    for p in parts[1:]:
        fade = np.linspace(0, 1, xf)[:, None]
        out[-xf:] = out[-xf:] * (1 - fade) + p[:xf] * fade
        out = np.concatenate([out, p[xf:]])
    out = out[:total]
    fi = int(min(fade_in, seconds / 4) * SR)
    if fi:
        out[:fi] *= np.linspace(0, 1, fi)[:, None] ** 2
    fo = int(min(fade_out, seconds / 4) * SR)
    if fo:
        out[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    return out.astype(np.float32)


def make_score(sections: list[tuple[float, float, str, int]], total: float, xfade: float = 1.6) -> np.ndarray:
    """Different style per section, crossfaded at the boundaries. sections: (start_s, end_s, style, seed)."""
    n = int(total * SR)
    out = np.zeros((n, 2), np.float32)
    for i, (s0, s1, style, seed) in enumerate(sections):
        a = max(0.0, s0 - (xfade / 2 if i else 0))
        b = min(total, s1 + (xfade / 2 if i < len(sections) - 1 else 0))
        bed = make_bed(b - a, seed=seed, style=style, fade_in=(xfade if i else 2.5), fade_out=(xfade if i < len(sections) - 1 else 4.0))
        ia = int(a * SR)
        ib = min(n, ia + len(bed))
        out[ia:ib] += bed[: ib - ia]
    return out


if __name__ == "__main__":
    import sys

    import soundfile as sf
    style = sys.argv[2] if len(sys.argv) > 2 else "doc"
    bed = make_bed(float(sys.argv[1]) if len(sys.argv) > 1 else 40, seed=3, style=style)
    sf.write(f"/tmp/bed_{style}.wav", bed, SR)
    print("ok", bed.shape)
