"""
Check an episode script before it is built or published.

  python engine/validate.py series/air-regulations/ep002.yaml [more files…]

Checks: required fields, known scene types, each scene's data, cue markers the visuals rely on,
acronyms the voice will spell out (so you can add word-acronyms to engine/lexicon.yaml),
the estimated running time, and (for v2 scripts) pacing: beats longer than ~12 s get a warning
because a static screen loses viewers.
Exit code 1 if any ERROR.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
LONG_TYPES = {"hook", "title", "chapter", "points", "stat", "tip", "recap", "timeline", "ladder", "org", "compare",
              "quote", "grid", "globe", "diagram", "quiz", "outro", "shot",
              "title3d", "kinetic", "doc", "split", "examtip", "count", "whiteboard", "airspace3d", "airportmap", "freedom"}
REEL_TYPES = {"rhook", "rglobe", "rstat", "rpoints", "rquote", "rtip", "rend"}
NEEDS = {
    "hook": ["lines"], "title": ["title"], "chapter": ["n", "title"], "points": ["items"], "stat": ["stats"],
    "tip": ["lines"], "recap": ["items"], "timeline": ["events"], "ladder": ["tiers"], "org": ["root", "nodes"],
    "compare": ["left", "right"], "quote": ["text"], "grid": ["tiles"], "globe": ["globe"], "diagram": ["variant"],
    "quiz": ["q", "options", "answer"], "outro": ["next"], "shot": ["shot"],
    "title3d": ["title"], "kinetic": ["lines"], "doc": ["lines"], "split": ["items"], "examtip": [],
    "count": ["value"], "whiteboard": [], "airspace3d": [], "airportmap": ["callouts"], "freedom": ["n"],
    "rhook": ["lines"], "rglobe": ["globe"], "rstat": ["value", "label"],
    "rpoints": ["items"], "rquote": ["text"], "rtip": ["text"], "rend": [],
}
# scene types whose items are revealed by cue markers (so the visuals land on the right words)
CUES = {"points": "items", "stat": "stats", "timeline": "events", "ladder": "tiers", "recap": "items", "rpoints": "items",
        "airportmap": "callouts"}
WPM = 148


def words_of(say: str) -> list[str]:
    s = re.sub(r"\{\{\d+\}\}|\[\[pause [\d.]+\]\]", " ", say)
    s = re.sub(r"\{([^{}|]+)\|([^{}]+)\}", r"\2", s)
    return s.split()


def check(path: Path) -> int:
    errors = 0
    lex = set((yaml.safe_load((HERE / "lexicon.yaml").read_text()) or {}).keys())
    ep = yaml.safe_load(path.read_text())
    v2 = ep.get("style") == "v2"

    def err(msg):
        nonlocal errors
        errors += 1
        print(f"  ERROR  {msg}")

    def warn(msg):
        print(f"  warn   {msg}")

    print(f"{path}")
    for k in ("series", "series_name", "code", "episode", "title", "scenes", "youtube", "thumbnail"):
        if k not in ep:
            err(f"missing top-level '{k}'")
    spelled = set()
    for part, types in (("scenes", LONG_TYPES), ("reel", REEL_TYPES)):
        scenes = ep.get("scenes") if part == "scenes" else (ep.get("reel") or {}).get("scenes")
        if not scenes:
            if part == "reel":
                warn("no reel")
            continue
        words_part = 0
        for i, sc in enumerate(scenes):
            t = sc.get("type")
            where = f"{part}[{i}] {t}"
            if t not in types:
                err(f"{where}: unknown scene type")
                continue
            data = sc.get("data") or {}
            for need in NEEDS.get(t, []):
                if need not in data:
                    err(f"{where}: data.{need} missing")
            say = sc.get("say") or ""
            cues = sorted({int(c) for c in re.findall(r"\{\{(\d+)\}\}", say)})
            if cues and cues != list(range(len(cues))):
                err(f"{where}: cue markers must be 0,1,2… in order (found {cues})")
            if t in CUES and isinstance(data.get(CUES[t]), list):
                n = len(data[CUES[t]])
                if len(cues) < n and t != "recap":
                    warn(f"{where}: {n} items but only {len(cues)} cue markers, items without a cue appear evenly spaced")
            if t == "quiz" and len(cues) < 3:
                err(f"{where}: quiz needs {{{{0}}}} options, {{{{1}}}} countdown start, [[pause …]], {{{{2}}}} answer")
            if t == "org" and len(cues) < len(data.get("nodes", [])) + 1:
                warn(f"{where}: org uses cue 0 for the root and 1..n for nodes")
            ws = words_of(say)
            words_part += len(ws)
            secs = len(ws) / WPM * 60
            if v2 and part == "scenes" and t not in ("quiz",) and secs > 13 and len(cues) < secs / 4:
                warn(f"{where}: ~{secs:.0f} s of narration with only {len(cues)} cue(s); split it or add reveals every 2–4 s")
            for w in ws:
                core = w.strip(".,;:!?\"'()“”")
                if core.endswith("'s"):
                    core = core[:-2]
                if re.fullmatch(r"[A-Z]{2,6}s?", core) and core not in lex:
                    spelled.add(core)
            if re.search(r"\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
                         re.sub(r"\{[^{}]*\}", "", say)):
                warn(f"{where}: write spoken dates as {{7 December 1944|the seventh of December, nineteen forty-four}}")
        mins = words_part / WPM
        print(f"  {part}: {len(scenes)} scenes, {words_part} words, about {mins:.1f} min")
        if part == "scenes" and not (7 <= mins <= 20):
            warn("lesson length is usually 8 to 16 minutes")
        if part == "reel" and words_part / WPM * 60 > 85:
            warn("reel narration longer than ~85 s")
    if spelled:
        print(f"  info   spelled letter-by-letter: {', '.join(sorted(spelled))}  (add to lexicon.yaml if said as a word)")
    print(f"  {'OK' if not errors else str(errors) + ' error(s)'}")
    return errors


if __name__ == "__main__":
    bad = sum(check(Path(p)) for p in sys.argv[1:])
    sys.exit(1 if bad else 0)
