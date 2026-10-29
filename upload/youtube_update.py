"""
Apply title / description / tag / thumbnail changes that Claude's daily review asks for.

Claude writes requests to state/youtube_updates.json:
  [{"videoId": "...", "title": "...", "description": "...", "tags": [...], "thumbnail": "path/to/new.jpg", "why": "..."}]
Every field except videoId is optional. This script applies them through the YouTube Data API, appends each
result to state/youtube_updates_done.json and empties the request file.

Runs in GitHub Actions (youtube-updates.yml), with the uploader's secrets.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

ROOT = Path(__file__).resolve().parent.parent
REQ = ROOT / "state" / "youtube_updates.json"
DONE = ROOT / "state" / "youtube_updates_done.json"


def client():
    c = Credentials(
        token=None,
        refresh_token=os.environ["YT_REFRESH_TOKEN"],
        client_id=os.environ["YT_CLIENT_ID"],
        client_secret=os.environ["YT_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/youtube.force-ssl"],
    )
    return build("youtube", "v3", credentials=c, cache_discovery=False)


def main():
    reqs = json.loads(REQ.read_text()) if REQ.exists() else []
    if not reqs:
        print("no update requests")
        return
    yt = client()
    done = json.loads(DONE.read_text()) if DONE.exists() else []
    for r in reqs:
        vid = r["videoId"]
        res = dict(r, at=dt.datetime.utcnow().isoformat(timespec="seconds") + "Z")
        try:
            if any(k in r for k in ("title", "description", "tags")):
                cur = yt.videos().list(part="snippet", id=vid).execute()["items"][0]["snippet"]
                snip = {"title": r.get("title", cur["title"])[:100], "description": r.get("description", cur.get("description", ""))[:4900],
                        "tags": r.get("tags", cur.get("tags", [])), "categoryId": cur["categoryId"]}
                if "defaultLanguage" in cur:
                    snip["defaultLanguage"] = cur["defaultLanguage"]
                yt.videos().update(part="snippet", body={"id": vid, "snippet": snip}).execute()
            if r.get("thumbnail"):
                yt.thumbnails().set(videoId=vid, media_body=MediaFileUpload(str(ROOT / r["thumbnail"]))).execute()
            res["ok"] = True
            print(f"updated {vid}: {r.get('why', '')}")
        except Exception as e:  # keep going, record the error
            res["ok"] = False
            res["error"] = str(e)[:500]
            print(f"FAILED {vid}: {e}")
        done.append(res)
    DONE.write_text(json.dumps(done, indent=1, ensure_ascii=False))
    REQ.write_text("[]\n")


if __name__ == "__main__":
    main()
