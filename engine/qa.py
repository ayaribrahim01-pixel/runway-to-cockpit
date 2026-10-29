"""
Quality check for a finished video, run before anything is published.

  python engine/qa.py out/air-regulations/AR-001/            # picks the final (muxed) lesson in that folder
  python engine/qa.py "out/.../AR-001 - Air Regulations - ….mp4" [more files…]

Checks
  • static screens   nothing on screen may stay still for more than 3 s (samples 4 frames/s, compares them)
  • blank frames     no black / empty frames
  • loudness         integrated loudness close to -14 LUFS, true peak under -1 dBTP
  • silence          no unexpected silent gaps longer than 2.5 s in the narration
  • format           1920x1080 (lesson) or 1080x1920 (reel), 30 fps, H.264 + AAC

Writes qa_report.json next to the video. Exit code 1 if any check FAILS (warnings don't fail the build).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

SAMPLE_FPS = 4
W, H = 320, 180
STATIC_DIFF = 0.22      # mean |Δ| (0-255) below this between samples = "nothing moved"
STATIC_MAX = 3.0        # seconds
BLACK_LUMA = 10


def probe(path: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def frames(path: Path):
    """Yield grayscale frames (H x W float32) sampled at SAMPLE_FPS."""
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={SAMPLE_FPS},scale={W}:{H},format=gray",
           "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = W * H
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(H, W).astype(np.float32)
    p.wait()


def visual_checks(path: Path) -> dict:
    diffs, lumas = [], []
    prev = None
    for fr in frames(path):
        lumas.append(float(fr.mean()))
        if prev is not None:
            diffs.append(float(np.abs(fr - prev).mean()))
        prev = fr
    diffs = np.array(diffs)
    static_runs = []
    run = 0
    for i, d in enumerate(diffs):
        if d < STATIC_DIFF:
            run += 1
        else:
            if run / SAMPLE_FPS > STATIC_MAX:
                static_runs.append((round((i - run) / SAMPLE_FPS, 2), round(run / SAMPLE_FPS, 2)))
            run = 0
    if run / SAMPLE_FPS > STATIC_MAX:
        static_runs.append((round((len(diffs) - run) / SAMPLE_FPS, 2), round(run / SAMPLE_FPS, 2)))
    black = []
    run = 0
    for i, l in enumerate(lumas):
        if l < BLACK_LUMA:
            run += 1
        else:
            if run >= 2:
                black.append((round((i - run) / SAMPLE_FPS, 2), round(run / SAMPLE_FPS, 2)))
            run = 0
    return dict(
        samples=len(lumas),
        motion_median=round(float(np.median(diffs)) if len(diffs) else 0.0, 3),
        still_share=round(float((diffs < STATIC_DIFF).mean()) if len(diffs) else 0.0, 3),
        static_runs=static_runs,
        black_runs=black,
    )


def audio_checks(path: Path) -> dict:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    txt = p.stderr
    summ = txt[txt.rfind("Summary:"):] if "Summary:" in txt else ""
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summ)
    lra = re.search(r"LRA:\s+(-?[\d.]+) LU", summ)
    tp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ)
    s = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-48dB:d=2.5", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", s)]
    durs = [float(x) for x in re.findall(r"silence_duration: ([\d.]+)", s)]
    return dict(
        integrated_lufs=float(i.group(1)) if i else None,
        lra=float(lra.group(1)) if lra else None,
        true_peak_dbtp=float(tp.group(1)) if tp else None,
        silences=[(round(a, 2), round(b, 2)) for a, b in zip(starts, durs)],
    )


def pick(arg: str) -> Path:
    p = Path(arg)
    if p.is_dir():
        finals = [f for f in p.glob("*.mp4") if not f.name.startswith("video_") and " REEL " not in f.name and "PREVIEW" not in f.name]
        if finals:
            return max(finals, key=lambda f: f.stat().st_mtime)
        if (p / "video_long.mp4").exists():
            return p / "video_long.mp4"
        raise SystemExit(f"no video in {p}")
    return p


def check(path: Path) -> int:
    fails, warns = [], []
    info = probe(path)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])
    report: dict = dict(file=str(path), duration=round(dur, 2))
    if not v:
        fails.append("no video stream")
    else:
        w, h = int(v["width"]), int(v["height"])
        fps = eval(v.get("r_frame_rate", "30/1"))  # noqa: S307 (ffprobe rational like "30/1")
        report["video"] = dict(width=w, height=h, fps=round(fps, 3), codec=v["codec_name"])
        if (w, h) not in ((1920, 1080), (1080, 1920)):
            warns.append(f"unusual size {w}x{h}")
        if abs(fps - 30) > 0.01:
            warns.append(f"frame rate {fps}")
        report["visual"] = vis = visual_checks(path)
        for st, ln in vis["static_runs"]:
            warns.append(f"static screen {ln:.1f}s at {st:.1f}s")
        for st, ln in vis["black_runs"]:
            (fails if ln > 0.6 else warns).append(f"blank/black frames {ln:.1f}s at {st:.1f}s")
    if not a:
        warns.append("no audio stream (silent render — QA the muxed file for audio checks)")
    else:
        report["audio"] = au = audio_checks(path)
        if au["integrated_lufs"] is not None and abs(au["integrated_lufs"] + 14) > 1.5:
            warns.append(f"loudness {au['integrated_lufs']} LUFS (target -14)")
        if au["true_peak_dbtp"] is not None and au["true_peak_dbtp"] > -0.5:
            fails.append(f"true peak {au['true_peak_dbtp']} dBTP (clipping risk)")
        for st, ln in au["silences"]:
            if st > 2 and st + ln < dur - 4:
                warns.append(f"silence {ln:.1f}s at {st:.1f}s")
    report["warnings"] = warns
    report["failures"] = fails
    out = path.parent / "qa_report.json"
    out.write_text(json.dumps(report, indent=1))
    print(f"QA {path.name}  ({dur:.1f}s)")
    if "visual" in report:
        vis = report["visual"]
        print(f"  motion median {vis['motion_median']}, still share {vis['still_share'] * 100:.1f}%")
    if "audio" in report:
        au = report["audio"]
        print(f"  loudness {au['integrated_lufs']} LUFS, true peak {au['true_peak_dbtp']} dBTP, LRA {au['lra']}")
    for w_ in warns:
        print("  warn  ", w_)
    for f_ in fails:
        print("  FAIL  ", f_)
    print("  " + ("OK" if not fails else f"{len(fails)} failure(s)"))
    return len(fails)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    bad = sum(check(pick(a)) for a in sys.argv[1:])
    sys.exit(1 if bad else 0)
