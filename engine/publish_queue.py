"""Publishing queue: which episode goes out next, and recording what has been published.

  python engine/publish_queue.py next               -> prints the next scripted, unpublished episode file (or nothing)
  python engine/publish_queue.py done <code> <json> -> records a published episode (YouTube/Instagram ids) in state/published.json
  python engine/publish_queue.py status             -> how many scripts are ready ahead of today
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state" / "published.json"
ORDER = ["air-regulations"]  # subjects run in this order; add the next subject when one finishes


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"published": []}


def scripted() -> list[Path]:
    """Episode scripts in order, one per episode code. A '-v2' (new style) file wins over an older one."""
    out = []
    for s in ORDER:
        best: dict[str, Path] = {}
        for p in sorted((ROOT / "series" / s).glob("ep[0-9][0-9][0-9]*.yaml")):
            key = p.name[:5]  # epNNN
            if key not in best or "-v2" in p.stem:
                best[key] = p
        out += [best[k] for k in sorted(best)]
    return out


def code_of(p: Path) -> str:
    return yaml.safe_load(p.read_text()).get("code", p.stem)


def next_episode() -> Path | None:
    done = {e["code"] for e in load_state()["published"]}
    for p in scripted():
        if code_of(p) not in done:
            return p
    return None


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "next"
    if cmd == "next":
        p = next_episode()
        print(p.relative_to(ROOT) if p else "")
    elif cmd == "done":
        code, info = sys.argv[2], json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 else {}
        st = load_state()
        st["published"] = [e for e in st["published"] if e["code"] != code]
        st["published"].append({"code": code, "date": dt.date.today().isoformat(), **info})
        STATE.parent.mkdir(exist_ok=True)
        STATE.write_text(json.dumps(st, indent=1))
        for s in ORDER:
            plan = ROOT / "series" / s / "plan.yaml"
            if plan.exists():
                txt = plan.read_text()
                pat = re.compile(r"^(\s*- \{ep: \d+, code: " + re.escape(code) + r", status: )(\w+)", re.M)
                plan.write_text(pat.sub(r"\1published", txt))
    elif cmd == "status":
        done = {e["code"] for e in load_state()["published"]}
        ready = [p for p in scripted() if code_of(p) not in done]
        print(f"{len(ready)} script(s) ready: " + ", ".join(code_of(p) for p in ready))


if __name__ == "__main__":
    main()
