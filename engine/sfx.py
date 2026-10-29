"""Original sound effects and ambiences, synthesized in code (no samples, no licences)."""
from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000


def _t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def _stereo(x: np.ndarray, pan: float = 0.5) -> np.ndarray:
    return np.stack([x * (1 - pan) * 1.4, x * pan * 1.4], axis=1).astype(np.float32)


def whoosh(dur: float = 0.7, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 480
    for i in range(0, n, blk):
        p = i / n
        fc = 350 + 3200 * (p ** 1.3)
        sos = butter(2, [fc * 0.6, fc * 1.4], btype="band", fs=SR, output="sos")
        out[i:i + blk] = sosfilt(sos, noise[i:i + blk])
    env = np.sin(np.pi * np.linspace(0, 1, n) ** 0.8) ** 2
    out *= env
    out /= np.max(np.abs(out)) + 1e-9
    pan = np.linspace(0.2, 0.8, n)
    return np.stack([out * (1 - pan), out * pan], axis=1).astype(np.float32) * 0.9


def pop(pitch: float = 820) -> np.ndarray:
    t = _t(0.12)
    f = pitch * (1 - 0.45 * np.minimum(1, t / 0.06))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / 0.035)
    return _stereo(x / np.max(np.abs(x)) * 0.8)


def tick() -> np.ndarray:
    rng = np.random.default_rng(3)
    t = _t(0.03)
    x = rng.standard_normal(len(t)) * np.exp(-t / 0.004)
    x = sosfilt(butter(2, [1500, 4500], btype="band", fs=SR, output="sos"), x)
    return _stereo(x / np.max(np.abs(x)) * 0.7)


def chime(base: float = 1318.5) -> np.ndarray:
    t = _t(1.4)
    x = np.zeros_like(t)
    for mult, amp, dec in [(1.0, 1.0, 0.5), (1.5, 0.6, 0.4), (2.76, 0.25, 0.18), (2.0, 0.3, 0.3)]:
        x += amp * np.sin(2 * np.pi * base * mult * t) * np.exp(-t / dec)
    x[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    return _stereo(x / np.max(np.abs(x)) * 0.75)


def impact() -> np.ndarray:
    rng = np.random.default_rng(7)
    t = _t(1.6)
    f = 42 + 50 * np.exp(-t / 0.08)
    ph = 2 * np.pi * np.cumsum(f) / SR
    boom = np.sin(ph) * np.exp(-t / 0.55)
    noise = sosfilt(butter(2, 900, btype="low", fs=SR, output="sos"), rng.standard_normal(len(t))) * np.exp(-t / 0.08)
    x = boom + 0.4 * noise / (np.max(np.abs(noise)) + 1e-9)
    return _stereo(x / np.max(np.abs(x)) * 0.9)


def swell(dur: float = 2.2) -> np.ndarray:
    rng = np.random.default_rng(5)
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 480
    for i in range(0, n, blk):
        fc = 300 + 5000 * (i / n) ** 2
        sos = butter(2, fc, btype="low", fs=SR, output="sos")
        out[i:i + blk] = sosfilt(sos, noise[i:i + blk])
    env = np.linspace(0, 1, n) ** 2.2
    out = out * env
    return _stereo(out / (np.max(np.abs(out)) + 1e-9) * 0.6)


def swish(dur: float = 0.34, seed: int = 11) -> np.ndarray:
    """fast whip-pan swish"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 240
    for i in range(0, n, blk):
        p = i / n
        fc = 5200 - 3800 * p
        sos = butter(2, [fc * 0.55, fc * 1.5], btype="band", fs=SR, output="sos")
        out[i:i + blk] = sosfilt(sos, noise[i:i + blk])
    env = np.sin(np.pi * np.linspace(0, 1, n) ** 0.5) ** 3
    out *= env
    out /= np.max(np.abs(out)) + 1e-9
    pan = np.linspace(0.85, 0.15, n)
    return np.stack([out * (1 - pan), out * pan], axis=1).astype(np.float32) * 0.9


def ding(base: float = 1760.0) -> np.ndarray:
    t = _t(1.1)
    x = np.zeros_like(t)
    for mult, amp, dec in [(1.0, 1.0, 0.45), (2.4, 0.4, 0.22), (3.9, 0.22, 0.12), (1.5, 0.25, 0.3)]:
        x += amp * np.sin(2 * np.pi * base * mult * t) * np.exp(-t / dec)
    x += 0.6 * np.sin(2 * np.pi * base * 0.5 * t) * np.exp(-t / 0.2)
    x[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return _stereo(x / np.max(np.abs(x)) * 0.75)


def click() -> np.ndarray:
    t = _t(0.045)
    x = np.sin(2 * np.pi * 2600 * t) * np.exp(-t / 0.006) + 0.5 * np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.01)
    return _stereo(x / np.max(np.abs(x)) * 0.7)


def stamp() -> np.ndarray:
    rng = np.random.default_rng(13)
    t = _t(0.6)
    thud = np.sin(2 * np.pi * np.cumsum(70 + 90 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.12)
    slap = sosfilt(butter(2, [300, 2500], btype="band", fs=SR, output="sos"), rng.standard_normal(len(t))) * np.exp(-t / 0.03)
    x = thud + 0.6 * slap / (np.max(np.abs(slap)) + 1e-9)
    return _stereo(x / np.max(np.abs(x)) * 0.9)


def paper() -> np.ndarray:
    rng = np.random.default_rng(17)
    n = int(0.55 * SR)
    noise = rng.standard_normal(n)
    x = sosfilt(butter(2, [900, 6000], btype="band", fs=SR, output="sos"), noise)
    env = np.sin(np.pi * np.linspace(0, 1, n) ** 0.7) ** 2 * (0.6 + 0.4 * np.sin(np.linspace(0, 40, n)) ** 2)
    x *= env
    return _stereo(x / (np.max(np.abs(x)) + 1e-9) * 0.7, 0.6)


def marker(dur: float = 1.2, seed: int = 19) -> np.ndarray:
    """marker scribbling on a whiteboard"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros(n)
    k = 0
    while k < n:
        ln = int((0.04 + rng.random() * 0.07) * SR)
        burst = sosfilt(butter(2, [1800, 6500], btype="band", fs=SR, output="sos"), rng.standard_normal(ln))
        burst *= np.sin(np.pi * np.linspace(0, 1, ln)) ** 2 * (0.5 + 0.5 * rng.random())
        e = min(n, k + ln)
        out[k:e] += burst[: e - k]
        k += int(ln * (0.8 + rng.random() * 0.6))
    return _stereo(out / (np.max(np.abs(out)) + 1e-9) * 0.6, 0.55)


def riser(dur: float = 1.6) -> np.ndarray:
    rng = np.random.default_rng(23)
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 180 * 2 ** (3.2 * (t / dur) ** 1.5)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 480
    for i in range(0, n, blk):
        fc = 400 + 6000 * (i / n) ** 2
        out[i:i + blk] = sosfilt(butter(2, fc, btype="low", fs=SR, output="sos"), noise[i:i + blk])
    x = (out / (np.max(np.abs(out)) + 1e-9) + tone) * (t / dur) ** 2
    return _stereo(x / (np.max(np.abs(x)) + 1e-9) * 0.7)


def shutter() -> np.ndarray:
    rng = np.random.default_rng(29)
    t = _t(0.16)
    x = np.zeros_like(t)
    for at in (0.0, 0.07):
        i = int(at * SR)
        ln = int(0.03 * SR)
        x[i:i + ln] += sosfilt(butter(2, [2000, 8000], btype="band", fs=SR, output="sos"), rng.standard_normal(ln)) * np.exp(-np.arange(ln) / SR / 0.006)
    return _stereo(x / (np.max(np.abs(x)) + 1e-9) * 0.7)


def squelch() -> np.ndarray:
    rng = np.random.default_rng(31)
    n = int(0.14 * SR)
    x = sosfilt(butter(4, [900, 3200], btype="band", fs=SR, output="sos"), rng.standard_normal(n))
    x *= np.minimum(1, np.linspace(0, 6, n)) * np.linspace(1, 0.2, n)
    return _stereo(x / (np.max(np.abs(x)) + 1e-9) * 0.6)


def jet(dur: float, seed: int = 37) -> np.ndarray:
    """jet engine roar (takeoff / fly-by ambience), fades in and out"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    brown = np.cumsum(rng.standard_normal(n))
    brown = sosfilt(butter(2, 40, btype="high", fs=SR, output="sos"), brown)
    roar = sosfilt(butter(2, 650, btype="low", fs=SR, output="sos"), brown)
    roar /= np.max(np.abs(roar)) + 1e-9
    hiss = sosfilt(butter(2, [1500, 5000], btype="band", fs=SR, output="sos"), rng.standard_normal(n))
    hiss /= np.max(np.abs(hiss)) + 1e-9
    whine = np.sin(2 * np.pi * np.cumsum(2300 + 60 * np.sin(2 * np.pi * 0.3 * t)) / SR)
    x = roar * 0.8 + hiss * 0.18 + whine * 0.05
    fi = min(n // 3, int(0.8 * SR))
    fo = min(n // 3, int(1.2 * SR))
    env = np.ones(n)
    env[:fi] = np.linspace(0, 1, fi) ** 2
    env[n - fo:] = np.linspace(1, 0, fo) ** 1.5
    x *= env
    pan = 0.5 + 0.25 * np.sin(np.linspace(-1.2, 1.2, n))
    return np.stack([x * (1 - pan) * 1.3, x * pan * 1.3], axis=1).astype(np.float32)


def cabin(dur: float, seed: int = 41) -> np.ndarray:
    """steady cabin / cruise hum"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    pink = np.cumsum(rng.standard_normal(n))
    pink = sosfilt(butter(1, 30, btype="high", fs=SR, output="sos"), pink)
    hum = sosfilt(butter(2, 420, btype="low", fs=SR, output="sos"), pink)
    hum /= np.max(np.abs(hum)) + 1e-9
    x = hum * 0.9 + 0.08 * np.sin(2 * np.pi * 118 * t)
    fi = min(n // 3, int(0.7 * SR))
    env = np.ones(n)
    env[:fi] = np.linspace(0, 1, fi) ** 2
    env[n - fi:] = np.linspace(1, 0, fi) ** 2
    x *= env
    return _stereo(x * 0.8)


def airport(dur: float, seed: int = 43) -> np.ndarray:
    """distant airport bed: far-off jet rumble + faint wind"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    brown = np.cumsum(rng.standard_normal(n))
    brown = sosfilt(butter(2, 30, btype="high", fs=SR, output="sos"), brown)
    rumble = sosfilt(butter(2, 300, btype="low", fs=SR, output="sos"), brown)
    rumble /= np.max(np.abs(rumble)) + 1e-9
    wind = sosfilt(butter(2, [300, 1500], btype="band", fs=SR, output="sos"), rng.standard_normal(n))
    wind /= np.max(np.abs(wind)) + 1e-9
    lfo = 0.6 + 0.4 * np.sin(np.linspace(0, 2 * np.pi * dur / 9.0, n))
    x = rumble * 0.7 * lfo + wind * 0.12
    fi = min(n // 3, int(0.8 * SR))
    env = np.ones(n)
    env[:fi] = np.linspace(0, 1, fi) ** 2
    env[n - fi:] = np.linspace(1, 0, fi) ** 2
    return _stereo(x * env * 0.8)


BANK = {"whoosh": whoosh, "pop": pop, "tick": tick, "chime": chime, "impact": impact, "swell": swell, "swish": swish, "ding": ding,
        "click": click, "stamp": stamp, "paper": paper, "marker": marker, "riser": riser, "shutter": shutter, "squelch": squelch}
SIZED = {"jet": jet, "cabin": cabin, "airport": airport, "marker": marker, "swell": swell, "riser": riser}
LEVEL_DB = {"whoosh": -19, "pop": -27, "tick": -29, "chime": -21, "impact": -15, "swell": -24, "swish": -21, "ding": -20,
            "click": -27, "stamp": -16, "paper": -23, "marker": -30, "riser": -23, "shutter": -22, "squelch": -26,
            "jet": -22, "cabin": -27, "airport": -26}


def render_events(events: list[tuple], seconds: float) -> np.ndarray:
    """Place (time_seconds, name[, duration_s[, gain_db]]) events on a stereo track `seconds` long."""
    total = int(seconds * SR)
    out = np.zeros((total, 2), np.float32)
    cache: dict[str, np.ndarray] = {}
    for ev in events:
        t, name = ev[0], ev[1]
        dur = ev[2] if len(ev) > 2 else None
        gain = 10 ** ((ev[3] if len(ev) > 3 and ev[3] is not None else 0.0) / 20)
        if t is None or (name not in BANK and name not in SIZED):
            continue
        if dur is not None and name in SIZED:
            s = SIZED[name](float(dur)) * (10 ** (LEVEL_DB[name] / 20))
        elif name in BANK:
            if name not in cache:
                cache[name] = BANK[name]() * (10 ** (LEVEL_DB[name] / 20))
            s = cache[name]
        else:
            continue
        s = s * gain
        start = int(t * SR)
        if name == "swell":                 # swells end at t
            start = int(t * SR) - len(s)
        start = max(0, start)
        end = min(total, start + len(s))
        if end > start:
            out[start:end] += s[: end - start]
    return out
