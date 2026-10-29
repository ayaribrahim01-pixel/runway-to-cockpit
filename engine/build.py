"""
Build one episode end-to-end:

  series/<series>/epNNN.yaml
     -> narration (Kokoro, word timestamps)          engine/tts.py
     -> timeline JSON (scenes, cues, chapters)        for remotion/
     -> captions (.srt), YouTube description + chapters, upload manifest
     -> original music (per-section styles in v2) + SFX + ambience, ducked under the voice, mastered to -14 LUFS
     -> Remotion render (1920x1080 lesson, 1080x1920 reel, 1280x720 thumbnail)
     -> final MP4s with audio

Scripts with `style: v2` use the v2 lesson composition (varied beats, transitions, word captions, 3D shots).

Usage:
  python3 engine/build.py series/air-regulations/ep001.yaml            # full build
  python3 engine/build.py ... --stills                                  # one still per scene (quick visual check)
  python3 engine/build.py ... --frames 120,480,900                      # specific frames as stills
  python3 engine/build.py ... --skip-render                             # audio/timeline/captions only
  python3 engine/build.py ... --preview 75                              # render only the first 75 s
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pickle
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import director  # noqa: E402
from music import make_bed, make_score  # noqa: E402
from sfx import render_events  # noqa: E402
from tts import SR as TTS_SR, Narrator, cue_times, parse_all  # noqa: E402
from voicefx import SR_OUT, finish_voice  # noqa: E402

FPS = 30
LEAD = {"chapter": 0.6, "title": 0.0, "hook": 0.4, "quiz": 0.3, "tip": 0.35,
        "title3d": 0.2, "examtip": 0.5, "kinetic": 0.12, "count": 0.3, "doc": 0.35, "shot": 0.15, "whiteboard": 0.3,
        "airspace3d": 0.3, "split": 0.25, "airportmap": 0.4, "freedom": 0.3}
TAIL = {"chapter": 0.45, "quiz": 0.8, "tip": 0.7, "recap": 0.9, "outro": 0.4, "hook": 0.6, "quote": 0.7,
        "grid": 0.6, "diagram": 0.7, "ladder": 0.6, "org": 0.6, "rend": 0.4,
        "title3d": 0.4, "examtip": 0.7, "kinetic": 0.25, "count": 0.5, "doc": 0.5, "shot": 0.25, "whiteboard": 0.6,
        "airspace3d": 0.9, "split": 0.5, "airportmap": 0.8, "freedom": 0.7}
MIN_DUR = {"title": 3.8, "chapter": 2.6, "outro": 6.5, "tip": 3.0, "rend": 3.2, "rhook": 1.6,
           "title3d": 2.8, "examtip": 3.5, "kinetic": 1.8, "count": 3.0, "doc": 3.2, "shot": 2.2, "whiteboard": 4.0,
           "airspace3d": 6.0, "split": 4.0, "airportmap": 6.0, "freedom": 7.0}
POP_TYPES = {"points", "stat", "timeline", "ladder", "org", "recap", "rpoints"}


def fr(t: float) -> int:
    return int(round(t * FPS))


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# --------------------------------------------------------------------------- narration -> timeline

CACHE = ROOT / "out" / ".tts-cache"


def _cached_synth(narr: Narrator, say: str, voice_key: str) -> dict:
    """Narration is the slowest step; cache it per (text, voice settings) so edits re-voice only what changed."""
    CACHE.mkdir(parents=True, exist_ok=True)
    spoken = re.sub(r"\{\{\d+\}\}", "", say)          # cue markers don't change the audio
    lex = yaml.safe_load((HERE / "lexicon.yaml").read_text()) or {}
    # key on the dictionary entries this text actually uses, so adding a word re-voices only scenes that say it
    used = {k: v for k, v in sorted(lex.items()) if re.search(r"(?<![A-Za-z])" + re.escape(str(k)) + r"(?![A-Za-z])", spoken)}
    key = hashlib.sha1(("v4\n" + voice_key + "\n" + spoken + "\n" + json.dumps(used, ensure_ascii=False)).encode("utf-8")).hexdigest()
    fp = CACHE / f"{key}.pkl"
    if fp.exists():
        r = pickle.loads(fp.read_bytes())
    else:
        r = narr.synth(spoken)
        fp.write_bytes(pickle.dumps(r))
    # re-attach this script's cue markers to the (identical) word list
    toks, _, _ = parse_all(say)
    if len(toks) != len(r["tokens"]):
        raise SystemExit(f"cue mapping mismatch in scene: {say[:60]}…")
    for a, b in zip(toks, r["tokens"]):
        a.start, a.end = b.start, b.end
    return dict(r, tokens=toks, cues=cue_times(toks))


def synth_scenes(scenes: list[dict], narr: Narrator, voice_key: str = "") -> tuple[list[dict], np.ndarray, float]:
    """Synthesize every scene; return scene records with absolute timing + the raw voice track."""
    recs = []
    t = 0.0
    for i, sc in enumerate(scenes):
        typ = sc["type"]
        say = (sc.get("say") or "").strip()
        lead = float(sc.get("lead", LEAD.get(typ, 0.25)))
        tail = float(sc.get("tail", TAIL.get(typ, 0.4)))
        hold = float(sc.get("hold", 0.0))
        if say:
            r = _cached_synth(narr, say, voice_key)
            audio, tokens, cues, sp = r["audio"], r["tokens"], r["cues"], r["duration"]
        else:
            audio, tokens, cues, sp = np.zeros(0, np.float32), [], {}, 0.0
            lead, tail = 0.0, 0.0
        dur = max(float(sc.get("min", MIN_DUR.get(typ, 1.2))), lead + sp + tail + hold)
        recs.append(dict(i=i, sc=sc, start=t, dur=dur, lead=lead, audio=audio, tokens=tokens, cues=cues, speech=sp))
        log(f"  scene {i:02d} {typ:11s} {dur:6.2f}s  ({len(tokens)} words)")
        t += dur
    total = t
    voice = np.zeros(int(total * TTS_SR) + TTS_SR, np.float32)
    for r in recs:
        if len(r["audio"]):
            s = int((r["start"] + r["lead"]) * TTS_SR)
            voice[s:s + len(r["audio"])] += r["audio"]
    return recs, voice[: int(total * TTS_SR)], total


def timeline_from(recs: list[dict], total: float, ep: dict, cfg: dict, kind: str) -> dict:
    scenes, chapters = [], []
    for r in recs:
        sc = r["sc"]
        start = fr(r["start"])
        end = fr(r["start"] + r["dur"])
        ncue = (max(r["cues"].keys()) + 1) if r["cues"] else 0
        cues = [None] * ncue
        for k, v in r["cues"].items():
            cues[k] = fr(r["lead"] + v)
        words = [dict(t=tok.display, s=fr(r["lead"] + tok.start), e=fr(r["lead"] + tok.end), k=bool(tok.emphasis))
                 for tok in r["tokens"]]
        scenes.append(dict(id=sc.get("id", f"s{r['i']:02d}"), type=sc["type"], start=start, dur=max(1, end - start),
                           cues=cues, words=words, data=sc.get("data", {}) or {}))
        if sc["type"] == "chapter":
            d = sc.get("data", {})
            chapters.append(dict(n=int(d.get("n", len(chapters) + 1)), title=str(d.get("title", "")).replace("*", ""), start=start))
    total_f = fr(total)
    for i, c in enumerate(chapters):
        c["end"] = chapters[i + 1]["start"] if i + 1 < len(chapters) else total_f
    brand = cfg["brand"]
    ch = cfg["channel"]
    w, h = (1920, 1080) if kind == "long" else (1080, 1920)
    return dict(
        kind=kind, fps=FPS, width=w, height=h, durationInFrames=total_f,
        series=dict(name=ep["series_name"], short=ep.get("series_short", ep["series_name"]), episode=int(ep["episode"]),
                    title=ep["title"].replace("*", ""), subtitle=ep.get("subtitle", "")),
        channel=dict(name=ch.get("name", ""), handle=ch.get("handle", "")),
        brand=brand, chapters=chapters, scenes=scenes,
        captions=[], showCaptions=bool(ep.get("burn_captions", kind == "reel")),
        publishLine=ep.get("publish_line") or f"A new DGCA lesson every day · {nice_time(cfg['publish']['time_ist'])} IST",
    )


def all_words(recs: list[dict]) -> list[dict]:
    out = []
    for r in recs:
        for tok in r["tokens"]:
            out.append(dict(t=tok.display, s=r["start"] + r["lead"] + tok.start, e=r["start"] + r["lead"] + tok.end, k=bool(tok.emphasis)))
    return out


def caption_groups(words: list[dict], max_chars: int, max_lines: int, max_dur: float, gap: float = 0.55) -> list[list[dict]]:
    groups, cur, lines, line_len = [], [], 1, 0
    for w in words:
        txt = w["t"]
        start_new = False
        if cur:
            if w["s"] - cur[-1]["e"] > gap:
                start_new = True
            elif w["e"] - cur[0]["s"] > max_dur:
                start_new = True
            elif re.search(r"[.!?]$", cur[-1]["t"]) and cur[-1]["e"] - cur[0]["s"] > 0.9:
                start_new = True
            elif line_len + 1 + len(txt) > max_chars:
                if lines >= max_lines:
                    start_new = True
                else:
                    lines += 1
                    line_len = len(txt)
                    cur.append(w)
                    continue
        if start_new:
            groups.append(cur)
            cur, lines, line_len = [], 1, 0
        cur.append(w)
        line_len += (1 if line_len else 0) + len(txt)
    if cur:
        groups.append(cur)
    return groups


def srt_time(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}".replace(",1000", ",999")


def write_srt(groups: list[list[dict]], path: Path, max_chars: int):
    out = []
    for i, g in enumerate(groups, 1):
        s = g[0]["s"]
        e = max(g[-1]["e"] + 0.25, s + 0.8)
        if i < len(groups):
            e = min(e, groups[i][0]["s"] - 0.02)
        lines, cur = [], ""
        for w in g:
            if cur and len(cur) + 1 + len(w["t"]) > max_chars:
                lines.append(cur)
                cur = w["t"]
            else:
                cur = (cur + " " + w["t"]).strip()
        lines.append(cur)
        out.append(f"{i}\n{srt_time(s)} --> {srt_time(e)}\n" + "\n".join(lines) + "\n")
    path.write_text("\n".join(out), encoding="utf-8")


def ts(t: float) -> str:
    m, s = divmod(int(t), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


# --------------------------------------------------------------------------- audio

def sfx_events(recs: list[dict], kind: str) -> list[tuple[float, str]]:
    """v1 sound design (kept for v1 scripts and reels)."""
    ev = []
    for r in recs:
        typ = r["sc"]["type"]
        st = r["start"]
        cues = sorted(r["cues"].items())
        if typ == "title":
            ev += [(st, "swell"), (st + 0.05, "impact"), (st + 0.1, "whoosh")]
        elif typ == "chapter":
            ev.append((st + 0.02, "whoosh"))
        elif typ == "tip":
            ev.append((st + 0.1, "pop"))
        elif typ == "quiz":
            c = dict(cues)
            if 1 in c and 2 in c:
                t0 = st + r["lead"] + c[1]
                t1 = st + r["lead"] + c[2]
                k = t0
                while k < t1 - 0.3:
                    ev.append((k, "tick"))
                    k += 1.0
                ev.append((t1, "chime"))
        elif typ in ("outro", "rend"):
            ev.append((st + 0.05, "whoosh"))
        if typ in POP_TYPES:
            for _, v in cues:
                ev.append((st + r["lead"] + v, "pop"))
    return ev


def duck_envelope(voice48: np.ndarray, low_db: float, high_db: float) -> np.ndarray:
    frame = 480  # 10 ms
    n = len(voice48) // frame
    rms = np.sqrt((voice48[: n * frame].reshape(n, frame) ** 2).mean(axis=1) + 1e-12)
    active = (20 * np.log10(rms) > -42).astype(np.float32)
    env = np.zeros(n, np.float32)
    a, rel = 1 - np.exp(-1 / 6), 1 - np.exp(-1 / 60)   # attack 60 ms, release 600 ms
    v = 0.0
    for i in range(n):
        target = active[i]
        v += (target - v) * (a if target > v else rel)
        env[i] = v
    gain_db = high_db + (low_db - high_db) * env
    g = 10 ** (gain_db / 20)
    g = np.repeat(g, frame)
    if len(g) < len(voice48):
        g = np.concatenate([g, np.full(len(voice48) - len(g), g[-1] if len(g) else 1.0)])
    return g[: len(voice48)]


def master(in_wav: Path, out_wav: Path, target: float = -14.0):
    """Two-pass loudness normalisation (linear) to `target` LUFS, true peak -1 dBTP."""
    p = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(in_wav), "-af",
                        f"loudnorm=I={target}:TP=-1.0:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
    meas = json.loads(m.group(0))
    af = (f"loudnorm=I={target}:TP=-1.0:LRA=11:measured_I={meas['input_i']}:measured_TP={meas['input_tp']}:"
          f"measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}:offset={meas['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(in_wav), "-af", af, "-ar", "48000", "-c:a", "pcm_s16le", str(out_wav)],
                   check=True)
    return meas


def make_audio(recs: list[dict], voice24: np.ndarray, total: float, out_dir: Path, tag: str, seed: int, kind: str,
               scenes: list[dict] | None = None, episode: int = 1, v2: bool = False) -> Path:
    vpath = out_dir / f"voice_{tag}.wav"
    finish_voice(voice24, TTS_SR, vpath)
    v, _ = sf.read(vpath, dtype="float32")
    if v.ndim > 1:
        v = v.mean(axis=1)
    n = int(total * SR_OUT)
    if len(v) < n:
        v = np.concatenate([v, np.zeros(n - len(v), np.float32)])
    v = v[:n]
    amb = None
    if v2 and scenes is not None:
        sections = director.music_sections(recs, total, episode)
        log("  music: " + ", ".join(f"{a:.0f}-{b:.0f}s {st}" for a, b, st, _ in sections))
        bed = make_score(sections, total)
        events, amb_events = director.sfx_events(recs, scenes)
        amb = render_events(amb_events, total)[:n]
    else:
        bed = make_bed(total, seed=seed)
        events = sfx_events(recs, kind)
    bed = bed[:n] if len(bed) >= n else np.concatenate([bed, np.zeros((n - len(bed), 2), np.float32)])
    # music sits under the voice while speaking, rises in pauses / intro / outro
    lo, hi = (-19.0, -12.0) if kind == "long" else (-17.0, -11.0)
    g = duck_envelope(v, lo, hi)
    fx = render_events(events, total)[:n]
    mix = np.stack([v, v], axis=1) * 0.92 + bed * g[:, None] + fx
    if amb is not None:
        ga = duck_envelope(v, -9.0, -3.0)  # ambience dips under the voice too
        amb = amb[:n] if len(amb) >= n else np.concatenate([amb, np.zeros((n - len(amb), 2), np.float32)])
        mix = mix + amb * ga[:, None]
    raw = out_dir / f"mix_raw_{tag}.wav"
    sf.write(raw, mix.astype(np.float32), SR_OUT, subtype="FLOAT")
    final = out_dir / f"mix_{tag}.wav"
    meas = master(raw, final, -14.0)
    log(f"  audio {tag}: measured {meas['input_i']} LUFS -> -14 LUFS")
    raw.unlink(missing_ok=True)
    return final


# --------------------------------------------------------------------------- render

THREE_D = {"shot", "title3d", "airspace3d"}
LESSON_OVERLAP = 10  # frames, must match remotion/src/Lesson.tsx


def uses_3d(sc: dict) -> bool:
    d = sc.get("data") or {}
    return sc["type"] in THREE_D or (sc["type"] == "chapter" and bool(d.get("bg3d"))) or (sc["type"] == "split" and bool(d.get("visual")))


def render_segments(tl: dict, first: int, last: int, min_2d: int = 75) -> list[dict]:
    """Split [first, last] into runs that need software WebGL (a 3D shot is on screen) and runs that don't."""
    need = []
    for i, sc in enumerate(tl["scenes"]):
        if uses_3d(sc):
            a = sc["start"]
            b = sc["start"] + sc["dur"] + (LESSON_OVERLAP if i < len(tl["scenes"]) - 1 else 0) - 1
            need.append([max(first, a), min(last, b)])
    need = [r for r in need if r[0] <= r[1]]
    need.sort()
    merged: list[list[int]] = []
    for r in need:
        # absorb short 2D gaps into the 3D run (each segment costs a browser start)
        if merged and r[0] <= merged[-1][1] + min_2d:
            merged[-1][1] = max(merged[-1][1], r[1])
        else:
            merged.append(r)
    segs, cur = [], first
    for a, b in merged:
        if a - cur < min_2d and segs == [] and a > cur:
            a = cur
        if a > cur:
            segs.append(dict(frames=[cur, a - 1], gl=None))
        segs.append(dict(frames=[a, b], gl="swangle"))
        cur = b + 1
    if cur <= last:
        if last - cur + 1 < min_2d and segs:
            segs[-1]["frames"][1] = last
        else:
            segs.append(dict(frames=[cur, last], gl=None))
    return segs


def run_render(jobs: list[dict], out_dir: Path):
    jp = out_dir / "jobs.json"
    jp.write_text(json.dumps(jobs, indent=1))
    p = subprocess.Popen(["node", str(ROOT / "remotion" / "render.mjs"), str(jp)], cwd=str(ROOT / "remotion"),
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout:
        print("   ", line.rstrip(), flush=True)
    if p.wait() != 0:
        raise SystemExit("render failed")


def mux(video: Path, audio: Path, out: Path):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(out)],
                   check=True)


# --------------------------------------------------------------------------- description

def nice_time(hhmm: str) -> str:
    h, m = map(int, hhmm.split(":"))
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12} {suffix}" if m == 0 else f"{h12}:{m:02d} {suffix}"


def youtube_description(ep: dict, chapters_yt: list[tuple[float, str]], cfg: dict) -> str:
    yt = ep.get("youtube", {})
    parts = [yt.get("description", "").strip(), ""]
    if len(chapters_yt) >= 3:
        parts.append("⏱ Chapters")
        parts += [f"{ts(t)} {name}" for t, name in chapters_yt]
        parts.append("")
    facts = yt.get("key_facts") or []
    if facts:
        parts.append("📌 Key facts for the DGCA exam")
        parts += [f"• {f}" for f in facts]
        parts.append("")
    src = ep.get("sources") or []
    if src:
        parts.append("📚 Sources")
        parts += [f"• {s}" for s in src]
        parts.append("")
    nxt = ep.get("next", {})
    if nxt.get("title"):
        parts.append(f"▶ Next lesson: {nxt['title'].replace('*', '')}")
    parts.append(f"New lesson every day at {nice_time(cfg['publish']['time_ist'])} IST. Subscribe and turn on notifications.")
    parts.append("")
    parts.append("For exam preparation. Always check the current DGCA / ICAO documents before relying on any figure.")
    parts.append("")
    parts.append(" ".join(yt.get("hashtags", ["#DGCA", "#CPL", "#AirRegulations", "#PilotTraining", "#Aviation"])))
    return "\n".join(parts).strip() + "\n"


# --------------------------------------------------------------------------- main

def build(ep_path: Path, stills: bool = False, skip_render: bool = False, only: str | None = None, preview: float | None = None,
          still_frames: list[int] | None = None):
    cfg = yaml.safe_load((ROOT / "config" / "channel.yaml").read_text())
    ep = yaml.safe_load(ep_path.read_text())
    v2 = ep.get("style") == "v2"
    code = ep.get("code") or f"ep{int(ep['episode']):03d}"
    out_dir = ROOT / "out" / ep.get("series", "series") / (code + ("-v2" if v2 else ""))
    out_dir.mkdir(parents=True, exist_ok=True)
    vc = cfg["voice"]
    narr = Narrator(voice="am_michael", speed=vc["speed"], sentence_pause=vc["sentence_pause"],
                    clause_pause=vc["clause_pause"], paragraph_pause=vc["paragraph_pause"], jitter=vc["jitter"])
    narr.voice = sum(w * narr.k.voices[name] for name, w in vc["mix"].items())
    voice_key = json.dumps(vc, sort_keys=True)
    manifest = dict(code=code, built=dt.datetime.now().isoformat(timespec="seconds"), files={})
    if only and (out_dir / "manifest.json").exists():
        # a partial rebuild (--only ...) updates the existing manifest instead of dropping what it doesn't rebuild
        try:
            old = json.loads((out_dir / "manifest.json").read_text())
            old["built"] = manifest["built"]
            old.setdefault("files", {})
            manifest = old
        except (ValueError, OSError):
            pass
    jobs = []

    # ---------------- long-form lesson
    if only in (None, "long"):
        log(f"[{code}] narration (long)…")
        recs, voice, total = synth_scenes(ep["scenes"], narr, voice_key)
        tl = timeline_from(recs, total, ep, cfg, "long")
        words = all_words(recs)
        if v2:
            director.style_scenes(tl["scenes"], int(ep["episode"]))
            tl["showCaptions"] = True
            groups = caption_groups(words, max_chars=30, max_lines=1, max_dur=2.3, gap=0.4)
        else:
            groups = caption_groups(words, max_chars=42, max_lines=2, max_dur=5.5)
        tl["captions"] = [dict(s=fr(g[0]["s"]), e=fr(g[-1]["e"] + 0.25), words=[dict(t=w["t"], s=fr(w["s"]), e=fr(w["e"]), k=w["k"]) for w in g])
                          for g in groups]
        for i in range(len(tl["captions"]) - 1):
            tl["captions"][i]["e"] = min(tl["captions"][i]["e"], tl["captions"][i + 1]["s"])
        (out_dir / "timeline_long.json").write_text(json.dumps(tl))
        write_srt(caption_groups(words, max_chars=42, max_lines=2, max_dur=5.5) if v2 else groups, out_dir / f"{code}.en.srt", 42)
        chapters_yt = [(0.0, ep.get("intro_chapter", "Intro"))] + [(c["start"] / FPS, c["title"]) for c in tl["chapters"]]
        desc = youtube_description(ep, chapters_yt, cfg)
        (out_dir / "description.txt").write_text(desc, encoding="utf-8")
        log(f"[{code}] long-form: {ts(total)} ({total:.1f}s), {len(words)} words, {len(tl['chapters'])} chapters")
        comp = "Lesson" if v2 else "LongForm"
        if not stills:
            make_audio(recs, voice, total, out_dir, "long", seed=int(ep["episode"]) * 7 + 1, kind="long",
                       scenes=tl["scenes"], episode=int(ep["episode"]), v2=v2)
        if stills:
            if still_frames:
                for fno in still_frames:
                    jobs.append(dict(comp=comp, props="timeline_long.json", out=f"stills/f{fno:06d}.jpg", still=True, frame=fno))
            else:
                limit = fr(preview) if preview else None
                for s in tl["scenes"]:
                    if limit is not None and s["start"] >= limit:
                        continue
                    jobs.append(dict(comp=comp, props="timeline_long.json", out=f"stills/{s['start']:06d}_{s['type']}.jpg",
                                     still=True, frame=s["start"] + max(1, s["dur"] - 14)))
        elif not skip_render:
            job = dict(comp=comp, props="timeline_long.json", out="video_long.mp4")
            last_f = tl["durationInFrames"] - 1
            if preview:
                last_f = min(tl["durationInFrames"], fr(preview)) - 1
                job["frames"] = [0, last_f]
                job["out"] = "video_preview.mp4"
            if v2 and os.environ.get("SPLIT_RENDER", "1") != "0":
                job["segments"] = render_segments(tl, 0, last_f)
                log(f"  render plan: " + ", ".join(f"{s['frames'][0]}-{s['frames'][1]} {'3D' if s['gl'] else '2D'}" for s in job["segments"]))
            jobs.append(job)
        manifest["long"] = dict(duration=round(total, 2), chapters=chapters_yt)

    # ---------------- reel / short
    if only in (None, "reel") and ep.get("reel") and not preview:
        log(f"[{code}] narration (reel)…")
        rrecs, rvoice, rtotal = synth_scenes(ep["reel"]["scenes"], narr, voice_key)
        rtl = timeline_from(rrecs, rtotal, ep, cfg, "reel")
        rwords = all_words(rrecs)
        rgroups = caption_groups(rwords, max_chars=16, max_lines=2, max_dur=2.2, gap=0.35)
        rtl["captions"] = [dict(s=fr(g[0]["s"]), e=fr(g[-1]["e"] + 0.12), words=[dict(t=w["t"], s=fr(w["s"]), e=fr(w["e"]), k=w["k"]) for w in g])
                           for g in rgroups]
        for i in range(len(rtl["captions"]) - 1):
            rtl["captions"][i]["e"] = min(rtl["captions"][i]["e"], rtl["captions"][i + 1]["s"])
        (out_dir / "timeline_reel.json").write_text(json.dumps(rtl))
        write_srt(caption_groups(rwords, 42, 2, 5.0), out_dir / f"{code}.reel.en.srt", 42)
        log(f"[{code}] reel: {rtotal:.1f}s")
        if not stills:
            make_audio(rrecs, rvoice, rtotal, out_dir, "reel", seed=int(ep["episode"]) * 7 + 3, kind="reel")
        if stills and not still_frames:
            for s in rtl["scenes"]:
                jobs.append(dict(comp="Reel", props="timeline_reel.json", out=f"stills/reel_{s['start']:05d}_{s['type']}.jpg",
                                 still=True, frame=s["start"] + max(1, s["dur"] - 12)))
        elif not stills and not skip_render:
            jobs.append(dict(comp="Reel", props="timeline_reel.json", out="video_reel.mp4"))
        manifest["reel"] = dict(duration=round(rtotal, 2))

    # ---------------- thumbnail
    th = ep.get("thumbnail")
    if th and only in (None, "thumb") and not still_frames:
        props = dict(brand=cfg["brand"], line1=th["line1"], line2=th["line2"], badge=th.get("badge", f"EP {int(ep['episode']):02d}"),
                     kicker=th.get("kicker", ep["series_name"]), visual=th.get("visual", "globe"), markers=th.get("markers", []),
                     arcs=th.get("arcs", []), rotate=th.get("rotate", [40, 22]))
        (out_dir / "thumb.json").write_text(json.dumps(props))
        jobs.append(dict(comp="Thumbnail", props="thumb.json", out="thumbnail.png", still=True, frame=0))

    # ---------------- Instagram image posts (1080x1350): tip, quiz carousel (question + answer), cheat sheet
    posts = ep.get("posts") or []
    if posts and only in (None, "posts") and not still_frames and not preview:
        (out_dir / "posts").mkdir(exist_ok=True)
        plist = []
        for i, pst in enumerate(posts, 1):
            variant = pst.get("variant", "tip")
            slides = ["q", "a"] if variant == "quiz" else [None]
            images = []
            for k, slide in enumerate(slides, 1):
                props = dict(brand=cfg["brand"], variant=variant, series=ep.get("series_short", ep["series_name"]),
                             episode=int(ep["episode"]), handle=cfg["channel"].get("handle"), data=pst.get("data", {}))
                if slide:
                    props["slide"] = slide
                pj = f"posts/post{i}_{k}.json"
                (out_dir / pj).write_text(json.dumps(props))
                name = f"{code}-post{i}-{k}.jpg"
                jobs.append(dict(comp="Post", props=pj, out=f"posts/{name}", still=True, frame=0))
                images.append(name)
            plist.append(dict(caption=pst.get("caption", "").strip(), images=images))
        (out_dir / "posts" / "posts.json").write_text(json.dumps(plist, indent=1, ensure_ascii=False))
        manifest["posts"] = plist

    if jobs and not skip_render:
        log(f"[{code}] rendering {len(jobs)} job(s)…")
        run_render(jobs, out_dir)

    if not stills and preview and (out_dir / "video_preview.mp4").exists():
        pv = out_dir / f"{code} - PREVIEW {int(preview)}s.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out_dir / "video_preview.mp4"), "-i", str(out_dir / "mix_long.wav"),
                        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                        "-af", f"afade=t=out:st={max(0, preview - 1.2)}:d=1.2", "-t", str(preview), "-movflags", "+faststart", str(pv)], check=True)
        manifest["files"]["preview"] = pv.name
        log(f"[{code}] preview -> {pv}")
    elif not stills:
        title_slug = re.sub(r"[^A-Za-z0-9]+", "-", ep["title"].replace("*", "")).strip("-")[:60]
        if (out_dir / "video_long.mp4").exists():
            final = out_dir / f"{code} - {ep['series_name']} - {title_slug}.mp4"
            mux(out_dir / "video_long.mp4", out_dir / "mix_long.wav", final)
            manifest["files"]["long"] = final.name
        if (out_dir / "video_reel.mp4").exists():
            final = out_dir / f"{code} - REEL - {title_slug}.mp4"
            mux(out_dir / "video_reel.mp4", out_dir / "mix_reel.wav", final)
            manifest["files"]["reel"] = final.name
        if (out_dir / "thumbnail.png").exists():
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out_dir / "thumbnail.png"), "-q:v", "3",
                            str(out_dir / "thumbnail.jpg")], check=True)
            manifest["files"]["thumbnail"] = "thumbnail.jpg"
    yt = ep.get("youtube", {})
    manifest["youtube"] = dict(title=yt.get("title", ep["title"]).replace("*", ""), tags=yt.get("tags", []),
                               categoryId=str(cfg["publish"].get("youtube_category", 27)),
                               privacyStatus=cfg["publish"].get("youtube_privacy", "public"),
                               description_file="description.txt", captions_file=f"{code}.en.srt",
                               playlist=ep.get("playlist", ep["series_name"]))
    if ep.get("reel"):
        manifest["reel_post"] = dict(caption=ep["reel"].get("caption", ""), youtube_title=ep["reel"].get("title", ""))
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    log(f"[{code}] done -> {out_dir}")
    return out_dir


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--skip-render", action="store_true")
    ap.add_argument("--only", choices=["long", "reel", "thumb", "posts"])
    ap.add_argument("--preview", type=float, help="render only the first N seconds of the lesson")
    ap.add_argument("--frames", help="comma-separated frames to render as stills")
    a = ap.parse_args()
    sf_list = [int(x) for x in a.frames.split(",")] if a.frames else None
    build(Path(a.episode).resolve(), stills=a.stills or bool(sf_list), skip_render=a.skip_render, only=a.only, preview=a.preview,
          still_frames=sf_list)
