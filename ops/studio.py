"""Runway To Cockpit: helper for the daily Claude run and the Studio page.

The Studio artifact's database holds the channel's live state:
  episodes/<code>    one per lesson: n, code, series, title, topics, status, script, publishDate, builtAt, deliveredAt
  uploads/<code>     the upload sheet: YouTube title/description/tags, Short, pinned comment, Instagram captions
  files/<id>         project files written after the snapshot (new scripts, fixes): {path, text, updatedAt}
  log/<id>           one line per run: {at, kind, title, detail}
  growth/<date>      daily review: numbers + what we change
  config/settings    times, mode, setup checklist

ArtifactData `list` with `out_dir=DIR` saves each document as DIR/<collection>/<doc_id>.json. These commands read that:

  python3 ops/studio.py apply-files DIR                    write every files/* doc over the project
  python3 ops/studio.py pick DIR [--today YYYY-MM-DD]      which episode to build today, and its publish date (JSON)
  python3 ops/studio.py filedocs OUT PATH [PATH...]        files/* docs for ArtifactData batch (file_path entries)
  python3 ops/studio.py filedocs OUT --all                 the same for the whole project (the studio's baseline copy)
  python3 ops/studio.py sheet BUILD_DIR SCRIPT DATE        upload sheet (.txt) + uploads doc (.json) for a finished build
  python3 ops/studio.py seed OUT                           episodes/* docs from the series plans (first-time setup)

Status flow: planned -> scripted -> built -> delivered (files sent to the owner) -> scheduled (owner put it on
YouTube) -> live.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
SERIES_ORDER = ["air-regulations"]
AHEAD_MAX = 3  # never build more than this many lessons ahead of the calendar


def now_ist() -> dt.datetime:
    return dt.datetime.now(IST)


def doc_id_for(path: str) -> str:
    return path.strip("/").replace("/", "~")


def load_docs(d: Path, collection: str) -> list[dict]:
    """Documents saved by ArtifactData (out_dir). Returns [{id, version, body}] whatever wrapper the tool used."""
    out = []
    folder = d / collection
    if not folder.exists():
        return out
    for f in sorted(folder.glob("*.json")):
        raw = json.loads(f.read_text())
        version = raw.get("version") if isinstance(raw, dict) else None
        body = raw
        for key in ("data", "body", "document", "fields"):
            if isinstance(raw, dict) and isinstance(raw.get(key), dict) and ("version" in raw or "id" in raw):
                body = raw[key]
                break
        out.append(dict(id=raw.get("id", f.stem) if isinstance(raw, dict) else f.stem, version=version, body=body))
    return out


def cmd_apply_files(d: Path):
    n = 0
    for doc in load_docs(d, "files"):
        b = doc["body"]
        p, text, b64 = b.get("path"), b.get("text"), b.get("b64")
        if not p or (text is None and b64 is None) or ".." in Path(p).parts or p.startswith("/"):
            continue
        dst = ROOT / p
        dst.parent.mkdir(parents=True, exist_ok=True)
        if b64 is not None:
            dst.write_bytes(base64.b64decode(b64))
        else:
            dst.write_text(text, encoding="utf-8")
        n += 1
    print(f"{n} file(s) restored from the studio into {ROOT}")


def script_path(series: str, n: int) -> str:
    return f"series/{series}/ep{n:03d}-v2.yaml"


def cmd_pick(d: Path, today: dt.date):
    eps = [e for e in load_docs(d, "episodes")]
    eps.sort(key=lambda e: (SERIES_ORDER.index(e["body"].get("series", SERIES_ORDER[0])) if e["body"].get("series") in SERIES_ORDER else 99, e["body"].get("n", 999)))
    ahead = [e for e in eps if e["body"].get("status") in ("built", "delivered", "scheduled")
             and (e["body"].get("publishDate") or "") > today.isoformat()]
    dates = [e["body"]["publishDate"] for e in eps if e["body"].get("publishDate")]
    last = max(dates) if dates else None
    pub = today + dt.timedelta(days=1)
    if last:
        pub = max(pub, dt.date.fromisoformat(last) + dt.timedelta(days=1))
    cand = next((e for e in eps if e["body"].get("status") in ("planned", "scripted")), None)
    if len(ahead) >= AHEAD_MAX:
        print(json.dumps(dict(skip=f"{len(ahead)} lessons already built ahead of the calendar (max {AHEAD_MAX})",
                              ahead=[e["body"]["code"] for e in ahead], next=cand and cand["body"]["code"])))
        return
    if not cand:
        print(json.dumps(dict(skip="every planned lesson is done: add the next subject's plan")))
        return
    b = cand["body"]
    sp = b.get("script") or script_path(b.get("series", "air-regulations"), b["n"])
    print(json.dumps(dict(code=b["code"], n=b["n"], series=b.get("series"), title=b.get("title"), topics=b.get("topics"),
                          script=sp, needsScript=not (ROOT / sp).exists(), publishDate=pub.isoformat(),
                          ahead=[e["body"]["code"] for e in ahead])))


BINARY = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".wav", ".mp3"}
SKIP_DIRS = {"node_modules", "out", "samples", "__pycache__", ".git"}


def file_doc(rel: str, stamp: str) -> dict:
    f = ROOT / rel
    if f.suffix.lower() in BINARY:
        doc = dict(path=rel, b64=base64.b64encode(f.read_bytes()).decode(), updatedAt=stamp)
    else:
        doc = dict(path=rel, text=f.read_text(encoding="utf-8"), updatedAt=stamp)
    if len(json.dumps(doc, ensure_ascii=False).encode()) > 250_000:
        sys.exit(f"{rel} is too large for one studio document (max ~240 KB)")
    return doc


def cmd_filedocs(out: Path, paths: list[str]):
    """One JSON per file, ready for ArtifactData set/batch with file_path. Prints: doc_id <TAB> json path <TAB> bytes."""
    out.mkdir(parents=True, exist_ok=True)
    stamp = now_ist().isoformat(timespec="seconds")
    for p in paths:
        rel = str((ROOT / p).resolve().relative_to(ROOT))
        doc = file_doc(rel, stamp)
        did = doc_id_for(rel)
        j = out / f"{did}.json"
        j.write_text(json.dumps(doc, ensure_ascii=False))
        print(f"{did}\t{j}\t{j.stat().st_size}")


def project_files() -> list[str]:
    """Every file the daily run needs to rebuild the project (no downloads, renders or brand images)."""
    out = []
    for f in sorted(ROOT.rglob("*")):
        if not f.is_file():
            continue
        rel = f.relative_to(ROOT)
        if set(rel.parts) & SKIP_DIRS or rel.parts[0] == "models" or f.suffix == ".pyc":
            continue
        if rel.parts[0] == "brand" and f.suffix.lower() in BINARY:
            continue
        out.append(str(rel))
    return out


def fmt_ts(sec: float) -> str:
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


def cmd_sheet(build: Path, script: Path, date: str):
    man = json.loads((build / "manifest.json").read_text())
    desc = (build / man["youtube"].get("description_file", "description.txt")).read_text(encoding="utf-8").strip()
    ep = yaml.safe_load(script.read_text())
    code = man["code"]
    yt = man["youtube"]
    day = dt.date.fromisoformat(date)
    hh, mm = map(int, str(yaml.safe_load((ROOT / "config" / "channel.yaml").read_text())["publish"]["time_ist"]).split(":"))
    when = f"{day.strftime('%a %d %b %Y')}, {(hh - 1) % 12 + 1}:{mm:02d} {'AM' if hh < 12 else 'PM'} IST"

    # pinned comment: the first quiz of the lesson, answer time from the timeline
    pinned = ""
    quiz = next((s for s in ep.get("scenes", []) if s.get("type") == "quiz"), None)
    if quiz:
        q = re.sub(r"\*([^*]+)\*", r"\1", quiz["data"]["q"])
        opts = quiz["data"].get("options", [])
        letters = "ABCDEFG"
        at = ""
        tl = build / "timeline_long.json"
        if tl.exists():
            t = json.loads(tl.read_text())
            s = next((s for s in t.get("scenes", []) if s.get("id") == quiz.get("id")), None)
            if s:
                at = f" (answer at {fmt_ts(s['start'] / t.get('fps', 30))})"
        pinned = (f"🧠 Quick check from today's lesson: {q}\n" + "\n".join(f"{letters[i]}) {o}" for i, o in enumerate(opts))
                  + f"\n\nComment your answer before you watch the quiz{at} 👇\nNew DGCA lesson every day at 10:15 AM IST.")

    reel = man.get("reel_post", {})
    short_title = reel.get("youtube_title") or (yt["title"] + " #Shorts")
    short_desc = (reel.get("caption", "").strip() + f"\n\nFull lesson on the channel: {yt['title']}").strip()

    posts = man.get("posts")
    if not posts and (build / "posts" / "posts.json").exists():
        posts = json.loads((build / "posts" / "posts.json").read_text())
    posts = posts or []

    files = dict(lesson=man["files"].get("long"), reel=man["files"].get("reel"), thumbnail=man["files"].get("thumbnail"),
                 captions=yt.get("captions_file"), posts=[i for p in posts for i in p.get("images", [])])

    doc = dict(code=code, n=ep.get("episode"), publishDate=date, publishAt=when, title=yt["title"], description=desc,
               tags=", ".join(yt.get("tags", [])), playlist=yt.get("playlist", ""), category="Education",
               short=dict(title=short_title, description=short_desc), pinnedComment=pinned,
               instagram=dict(reel=reel.get("caption", "").strip(), posts=[dict(caption=p.get("caption", "").strip(), images=p.get("images", [])) for p in posts]),
               files=files, uploaded=False, createdAt=now_ist().isoformat(timespec="seconds"))
    (build / "upload_doc.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))

    L = [f"RUNWAY TO COCKPIT · {code} · upload sheet", f"Goes live: {when}", "",
         "━━ YOUTUBE: LESSON ━━", f"File: {files['lesson']}", f"Thumbnail: {files['thumbnail']}   Subtitles (English): {files['captions']}",
         "", "TITLE", yt["title"], "", "DESCRIPTION", desc, "", "TAGS", doc["tags"], "",
         f"Playlist: {doc['playlist']}   Category: Education   Audience: not made for kids",
         f"Visibility: Schedule → {when}", "End screen: Subscribe + 'Best for viewer' video", "",
         "PINNED COMMENT", pinned or "(none)", "",
         "━━ YOUTUBE: SHORT ━━", f"File: {files['reel']}", "", "TITLE", short_title, "", "DESCRIPTION", short_desc, "",
         f"Schedule: {when} (same time as the lesson) · Related video: today's lesson", "",
         "━━ INSTAGRAM ━━", f"Reel: {files['reel']}", "", "REEL CAPTION", doc["instagram"]["reel"], ""]
    for i, p in enumerate(doc["instagram"]["posts"], 1):
        L += [f"POST {i} · images: {', '.join(p['images'])}", p["caption"], ""]
    (build / f"{code} upload sheet.txt").write_text("\n".join(L), encoding="utf-8")
    print(build / f"{code} upload sheet.txt")
    print(build / "upload_doc.json")


def cmd_seed(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    for s in SERIES_ORDER:
        plan = yaml.safe_load((ROOT / "series" / s / "plan.yaml").read_text())
        for e in plan["episodes"]:
            sp = script_path(s, e["ep"])
            have = (ROOT / sp).exists()
            doc = dict(n=e["ep"], code=e["code"], series=s, seriesName=plan.get("series_name", s), title=e["title"],
                       topics=e.get("topics", ""), status="scripted" if have else "planned", script=sp if have else "",
                       publishDate="", builtAt="", deliveredAt="", youtubeUrl="", note="")
            (out / f"{e['code']}.json").write_text(json.dumps(doc, ensure_ascii=False))
            print(f"{e['code']}\t{out / (e['code'] + '.json')}")


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    c = a[0]
    if c == "apply-files":
        cmd_apply_files(Path(a[1]))
    elif c == "pick":
        today = now_ist().date()
        if "--today" in a:
            today = dt.date.fromisoformat(a[a.index("--today") + 1])
        cmd_pick(Path(a[1]), today)
    elif c == "filedocs":
        cmd_filedocs(Path(a[1]), a[2:] if len(a) > 2 and a[2] != "--all" else project_files())
    elif c == "sheet":
        cmd_sheet(Path(a[1]), Path(a[2]), a[3])
    elif c == "seed":
        cmd_seed(Path(a[1]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
