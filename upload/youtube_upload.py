"""
Upload a built episode to YouTube: the lesson (scheduled), its captions, thumbnail and playlist,
plus the vertical reel as a YouTube Short.

Needs three secrets (see README "One-time setup"):
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
Scopes used: youtube.upload + youtube.force-ssl (captions, thumbnails, playlists).

Usage:
  python upload/youtube_upload.py out/air-regulations/AR-001/manifest.json [--publish-at 10:15] [--now]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import random
import sys
import time
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"]


def client():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["YT_REFRESH_TOKEN"],
        client_id=os.environ["YT_CLIENT_ID"],
        client_secret=os.environ["YT_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def resumable(request, label: str):
    response, retry = None, 0
    while response is None:
        try:
            status, response = request.next_chunk()
            if status:
                print(f"  {label}: {int(status.progress() * 100)}%", flush=True)
        except HttpError as e:
            if e.resp.status in (500, 502, 503, 504) and retry < 8:
                retry += 1
                time.sleep(min(64, 2**retry) + random.random())
                continue
            raise
    return response


def publish_time(hhmm: str, now: dt.datetime | None = None) -> str:
    """Next occurrence of HH:MM IST (today if still ahead, else tomorrow), as RFC3339 UTC."""
    now = now or dt.datetime.now(IST)
    h, m = map(int, hhmm.split(":"))
    t = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if t <= now + dt.timedelta(minutes=15):
        t += dt.timedelta(days=1)
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def upload_video(yt, path: Path, title: str, description: str, tags: list[str], category: str, publish_at: str | None,
                 made_for_kids: bool = False) -> str:
    status = {"selfDeclaredMadeForKids": made_for_kids, "embeddable": True, "license": "youtube"}
    if publish_at:
        status.update(privacyStatus="private", publishAt=publish_at)
    else:
        status.update(privacyStatus="public")
    body = {
        "snippet": {
            "title": title[:100],
            "description": description[:4900],
            "tags": tags[:30],
            "categoryId": category,
            "defaultLanguage": "en",
            "defaultAudioLanguage": "en",
        },
        "status": status,
    }
    media = MediaFileUpload(str(path), mimetype="video/mp4", chunksize=8 * 1024 * 1024, resumable=True)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    res = resumable(req, path.name)
    print(f"  uploaded {path.name} -> https://youtu.be/{res['id']}" + (f" (goes live {publish_at})" if publish_at else ""))
    return res["id"]


def ensure_playlist(yt, title: str) -> str:
    page = None
    while True:
        r = yt.playlists().list(part="snippet", mine=True, maxResults=50, pageToken=page).execute()
        for p in r.get("items", []):
            if p["snippet"]["title"] == title:
                return p["id"]
        page = r.get("nextPageToken")
        if not page:
            break
    r = yt.playlists().insert(part="snippet,status", body={"snippet": {"title": title, "defaultLanguage": "en"},
                                                           "status": {"privacyStatus": "public"}}).execute()
    return r["id"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--publish-at", default=None, help="HH:MM IST to go live (default from config/channel.yaml)")
    ap.add_argument("--now", action="store_true", help="publish immediately")
    ap.add_argument("--reel-offset-min", type=int, default=0, help="minutes after the lesson for the Short")
    a = ap.parse_args()
    man_path = Path(a.manifest).resolve()
    d = man_path.parent
    man = json.loads(man_path.read_text())
    yt_meta = man["youtube"]
    yt = client()
    when = None
    if not a.now:
        import yaml
        cfg = yaml.safe_load((Path(__file__).resolve().parent.parent / "config" / "channel.yaml").read_text())
        when = publish_time(a.publish_at or cfg["publish"]["time_ist"])
    result = dict(published_at=when or "now")
    desc = (d / yt_meta["description_file"]).read_text(encoding="utf-8")
    long_file = d / man["files"]["long"]
    vid = upload_video(yt, long_file, yt_meta["title"], desc, yt_meta.get("tags", []), yt_meta.get("categoryId", "27"), when)
    result["long_id"] = vid
    thumb = d / man["files"].get("thumbnail", "thumbnail.jpg")
    if thumb.exists():
        try:
            yt.thumbnails().set(videoId=vid, media_body=MediaFileUpload(str(thumb), mimetype="image/jpeg")).execute()
            print("  thumbnail set")
        except HttpError as e:
            print(f"  thumbnail skipped (phone-verify the channel to allow custom thumbnails): {e}")
    srt = d / yt_meta["captions_file"]
    if srt.exists():
        try:
            yt.captions().insert(part="snippet",
                                 body={"snippet": {"videoId": vid, "language": "en", "name": "English", "isDraft": False}},
                                 media_body=MediaFileUpload(str(srt), mimetype="application/octet-stream")).execute()
            print("  captions uploaded")
        except HttpError as e:
            print(f"  captions skipped: {e}")
    if yt_meta.get("playlist"):
        try:
            pl = ensure_playlist(yt, yt_meta["playlist"])
            yt.playlistItems().insert(part="snippet", body={"snippet": {"playlistId": pl, "resourceId": {"kind": "youtube#video", "videoId": vid}}}).execute()
            print(f"  added to playlist '{yt_meta['playlist']}'")
        except HttpError as e:
            print(f"  playlist skipped: {e}")
    if man["files"].get("reel"):
        reel = man.get("reel_post", {})
        short_when = when
        if when and a.reel_offset_min:
            t = dt.datetime.strptime(when, "%Y-%m-%dT%H:%M:%S.000Z").replace(tzinfo=dt.timezone.utc) + dt.timedelta(minutes=a.reel_offset_min)
            short_when = t.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        caption = reel.get("caption", "")
        sdesc = caption + f"\n\nFull lesson: https://youtu.be/{vid}\n"
        sid = upload_video(yt, d / man["files"]["reel"], reel.get("youtube_title") or (yt_meta["title"] + " #Shorts"), sdesc,
                           yt_meta.get("tags", []), yt_meta.get("categoryId", "27"), short_when)
        result["short_id"] = sid
    (d / "youtube_result.json").write_text(json.dumps(result, indent=1))
    print(json.dumps(result))


if __name__ == "__main__":
    sys.exit(main())
