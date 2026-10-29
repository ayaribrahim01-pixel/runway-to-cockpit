"""
Voice finishing: makes synthetic narration sit like a studio recording.
- gentle high-pass, warmth and presence EQ, light compression (ffmpeg)
- a very small 'booth' ambience (short convolution reverb, ~7% wet)
- faint room tone so pauses are never digital silence
- loudness normalised for the voice stem (-16 LUFS); the final mix is normalised again
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

SR_OUT = 48000


def _booth_ir(sr: int, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(0.22 * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-t / 0.045)
    ir[: int(0.008 * sr)] = 0.0                       # 8 ms pre-delay
    sos = butter(2, [300, 5500], btype="band", fs=sr, output="sos")
    ir = sosfilt(sos, ir)
    return ir / np.sqrt(np.sum(ir**2))


def _room_tone(n: int, sr: int, level_db: float = -64.0, seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    white = rng.standard_normal(n)
    pink = np.cumsum(white)
    sos = butter(1, 60, btype="high", fs=sr, output="sos")
    pink = sosfilt(sos, pink)
    sos2 = butter(2, 7000, btype="low", fs=sr, output="sos")
    pink = sosfilt(sos2, pink)
    pink /= np.max(np.abs(pink)) + 1e-9
    return pink * 10 ** (level_db / 20)


def finish_voice(audio: np.ndarray, sr: int, out_path: str | Path, wet: float = 0.07) -> Path:
    """Process raw narration (float32 mono at `sr`) into a polished 48 kHz WAV stem."""
    out_path = Path(out_path)
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "raw.wav"
        sf.write(raw, audio.astype(np.float32), sr)
        eq = Path(td) / "eq.wav"
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af",
            "aresample=48000:resampler=soxr,highpass=f=75,"
            "equalizer=f=180:t=q:w=1.1:g=1.2,equalizer=f=3200:t=q:w=1.2:g=1.4,"
            "equalizer=f=7500:t=q:w=1.5:g=-1.5,"
            "acompressor=threshold=-22dB:ratio=2.4:attack=10:release=140:makeup=1.6",
            "-ar", str(SR_OUT), str(eq)], check=True)
        x, _ = sf.read(eq, dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        verb = fftconvolve(x, _booth_ir(SR_OUT))[: len(x)]
        verb *= np.sqrt(np.mean(x**2) + 1e-12) / (np.sqrt(np.mean(verb**2)) + 1e-12)
        y = (1 - wet) * x + wet * verb
        y = y + _room_tone(len(y), SR_OUT)
        mixed = Path(td) / "mixed.wav"
        sf.write(mixed, y.astype(np.float32), SR_OUT)
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(mixed), "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", str(SR_OUT), "-c:a", "pcm_s16le", str(out_path)],
            check=True)
    return out_path


def radio(audio: np.ndarray, sr: int) -> np.ndarray:
    """ATC-radio treatment for a voice line: band-limited, a little drive, faint hiss."""
    sos = butter(4, [320, 3100], btype="band", fs=sr, output="sos")
    y = sosfilt(sos, audio.astype(np.float64))
    y = np.tanh(y * 3.2) / np.tanh(3.2)
    rng = np.random.default_rng(5)
    hiss = sosfilt(butter(2, [1500, 4000], btype="band", fs=sr, output="sos"), rng.standard_normal(len(y))) * 0.012
    return (y * 0.9 + hiss).astype(np.float32)
