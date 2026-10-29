"""
v2 "director": turns a plain timeline into a varied edit.

- section accent colours (light theme; orange stays the brand colour for chrome and captions)
- a different entry transition for each beat (never the same twice in a row)
- camera-drift variant per beat
- sound design: transition swishes, pops/clicks on reveals, dings on exam cards, marker scribbles,
  stamps and paper on documents, jet / cabin / airport ambience under 3D shots and airport maps
- music: a different style per chapter, crossfaded
"""
from __future__ import annotations

PALETTE = ["#1F6FB2", "#0E9F8E", "#6B5BD6", "#D94F70", "#C98800", "#EE6A1A"]
BRAND = "#EE6A1A"
ROTATION = ["slideL", "zoom", "wipe", "up", "slideR", "iris", "fade"]
BY_TYPE = {
    "chapter": "flash",
    "title3d": "flash",
    "examtip": "up",
    "kinetic": "zoom",
    "quiz": "iris",
    "doc": "slideL",
    "shot": "fade",
    "airspace3d": "fade",
    "airportmap": "zoom",
    "freedom": "wipe",
    "count": "zoom",
    "whiteboard": "wipe",
    "recap": "up",
    "outro": "fade",
    "split": "slideR",
}
TRANS_SFX = {"slideL": "swish", "slideR": "swish", "wipe": "swish", "up": "swish", "zoom": "whoosh", "iris": "pop", "flash": "shutter"}
MUSIC_ORDER = ["drive", "doc", "wonder", "drive", "doc", "pulse", "wonder"]


def style_scenes(scenes: list[dict], episode: int) -> None:
    """Mutates timeline scenes in place: accent, tin (entry transition), drift."""
    ch = -1
    k = episode % len(ROTATION)
    prev = None
    for i, s in enumerate(scenes):
        d = s.get("data") or {}
        if s["type"] == "chapter":
            ch += 1
        s["accent"] = d.get("accent") or (BRAND if ch < 0 else PALETTE[(ch + episode) % len(PALETTE)])
        t = d.get("tin") or BY_TYPE.get(s["type"])
        if not t or t == prev:
            for _ in range(len(ROTATION)):
                cand = ROTATION[k % len(ROTATION)]
                k += 1
                if cand != prev:
                    t = cand
                    break
        s["tin"] = t
        prev = t
        s["drift"] = (i * 5 + episode) % 6


def _shot_of(sc: dict) -> tuple[str, str] | None:
    d = sc.get("data") or {}
    t = sc["type"]
    if t in ("shot", "title3d"):
        return (d.get("shot", "cruise"), d.get("view", "side"))
    if t == "chapter" and d.get("bg3d"):
        return (d["bg3d"].get("shot", "cruise"), d["bg3d"].get("view", "front"))
    if t == "split":
        v = d.get("visual") or {}
        return (v.get("shot", "cruise"), v.get("view", "front"))
    return None


def sfx_events(recs: list[dict], scenes: list[dict]) -> tuple[list[tuple], list[tuple]]:
    """Returns (one-shot events, ambience events). recs carry absolute seconds; scenes carry styling."""
    ev: list[tuple] = []
    amb: list[tuple] = []
    for i, (r, s) in enumerate(zip(recs, scenes)):
        typ = r["sc"]["type"]
        d = r["sc"].get("data") or {}
        st = r["start"]
        lead = r["lead"]
        cues = dict(r["cues"])

        def ct(k):
            return st + lead + cues[k] if k in cues else None

        if i > 0:
            name = TRANS_SFX.get(s.get("tin", "fade"))
            if name:
                ev.append((max(0.0, st - 0.05), name))
        if typ == "title3d":
            ev += [(st + 0.02, "riser", 1.2, -4), (st + 0.05, "impact")]
        elif typ == "chapter":
            ev.append((st + 0.08, "impact", None, -8))
        elif typ == "kinetic":
            lines = d.get("lines") or []
            for li, ln in enumerate(lines):
                c = ln.get("cue") if isinstance(ln, dict) else None
                t = ct(c) if c is not None else (st + 0.15 if li == 0 else None)
                if t is not None:
                    ev.append((t, "pop"))
        elif typ == "doc":
            ev.append((st + 0.1, "paper"))
            hl = (d.get("hl") or {}).get("cue")
            if hl is not None and ct(hl) is not None:
                ev.append((ct(hl), "click"))
            sc = (d.get("stamp") or {}).get("cue")
            if sc is not None and ct(sc) is not None:
                ev.append((ct(sc) + 0.05, "stamp"))
        elif typ == "split":
            for k in sorted(cues):
                ev.append((ct(k), "click"))
        elif typ == "examtip":
            ev.append((st + 0.22, "ding"))
            if d.get("right") and ct(d.get("rightCue", -1)) is not None:
                ev.append((ct(d["rightCue"]), "chime"))
            if d.get("wrong") and ct(d.get("wrongCue", -1)) is not None:
                ev.append((ct(d["wrongCue"]) + 0.35, "click"))
        elif typ == "count":
            t0 = ct(d.get("cue", 0)) or st + 0.3
            n = int((d.get("countFrames", 40) / 30) / 0.09)
            for j in range(n):
                ev.append((t0 + j * 0.09, "tick", None, -4))
            ev.append((t0 + d.get("countFrames", 40) / 30, "ding", None, -3))
        elif typ == "whiteboard":
            nodes = d.get("nodes") or []
            for ni, nd in enumerate(nodes):
                c = nd.get("cue")
                t = ct(c) if c is not None else st + (8 + ni * 18) / 30
                if t is not None:
                    ev.append((t, "marker", 0.55))
            if d.get("drawing"):
                ev.append((st + 0.2, "marker", 2.2))
        elif typ == "airspace3d":
            if ct(3) is not None:
                ev.append((ct(3), "whoosh"))
            for k in (0, 1, 2, 4):
                if ct(k) is not None:
                    ev.append((ct(k), "click"))
        elif typ == "freedom":
            ev.append((st + 0.3, "whoosh", None, -6))
            amb.append((st, "jet", r["dur"] + 0.3, -14))
        elif typ == "airportmap":
            for k in sorted(cues):
                ev.append((ct(k), "pop"))
            amb.append((st, "airport", r["dur"] + 0.3, -2))
        elif typ == "globe":
            for k in sorted(cues):
                ev.append((ct(k), "pop"))
        elif typ == "quiz":
            if 1 in cues and 2 in cues:
                t0, t1 = ct(1), ct(2)
                k2 = t0
                while k2 < t1 - 0.3:
                    ev.append((k2, "tick"))
                    k2 += 1.0
                ev.append((t1, "chime"))
        elif typ in ("points", "stat", "timeline", "ladder", "org", "recap"):
            for k in sorted(cues):
                ev.append((ct(k), "pop"))
        elif typ == "outro":
            ev.append((st + 0.05, "whoosh"))
        shot = _shot_of(r["sc"])
        if shot:
            kind, view = shot
            dur = r["dur"] + 0.3
            if kind == "takeoff":
                amb.append((st, "jet", dur, 0))
            elif view == "wing":
                amb.append((st, "cabin", dur, 3))
            else:
                amb.append((st, "jet", dur, -9))
    return ev, amb


def music_sections(recs: list[dict], total: float, episode: int) -> list[tuple[float, float, str, int]]:
    """One music style per chapter (intro + chapters + outro), rotated per episode."""
    starts = [0.0]
    for r in recs:
        if r["sc"]["type"] == "chapter" and r["start"] > 1.0:
            starts.append(r["start"])
        if r["sc"]["type"] == "outro":
            starts.append(r["start"])
    starts = sorted(set(starts))
    out = []
    for i, s0 in enumerate(starts):
        s1 = starts[i + 1] if i + 1 < len(starts) else total
        style = MUSIC_ORDER[(i + episode) % len(MUSIC_ORDER)] if i else "drive"
        out.append((s0, s1, style, episode * 31 + i * 7 + 3))
    return out
