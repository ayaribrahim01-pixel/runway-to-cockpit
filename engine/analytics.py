"""
Daily YouTube numbers for the channel, saved where Claude's daily review can read them.

Runs in GitHub Actions (YouTube's APIs are not reachable from Claude's workspace). Writes:
  state/analytics/YYYY-MM-DD.json   today's snapshot
  state/analytics/latest.json       the same, always the newest

Contents: channel totals (subscribers, views, videos), the last 28 days by day, the last 28 days per video
(views, watch time, average view duration / percentage, subscribers gained), traffic sources and the
public numbers of every recent upload (views, likes, comments).

Needs the same secrets as the uploader (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN). The refresh token
must include the scope https://www.googleapis.com/auth/yt-analytics.readonly (see README, one-time setup).

  python engine/analytics.py
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "state" / "analytics"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


def creds() -> Credentials:
    return Credentials(
        token=None,
        refresh_token=os.environ["YT_REFRESH_TOKEN"],
        client_id=os.environ["YT_CLIENT_ID"],
        client_secret=os.environ["YT_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )


def rows(resp: dict) -> list[dict]:
    cols = [h["name"] for h in resp.get("columnHeaders", [])]
    return [dict(zip(cols, r)) for r in resp.get("rows", []) or []]


def main():
    c = creds()
    yt = build("youtube", "v3", credentials=c, cache_discovery=False)
    ya = build("youtubeAnalytics", "v2", credentials=c, cache_discovery=False)
    today = dt.date.today()
    start = (today - dt.timedelta(days=28)).isoformat()
    end = today.isoformat()

    ch = yt.channels().list(part="snippet,statistics,contentDetails", mine=True).execute()["items"][0]
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    stats = ch["statistics"]

    # recent uploads with public counters
    vids = []
    items = yt.playlistItems().list(part="contentDetails", playlistId=uploads, maxResults=50).execute().get("items", [])
    ids = [it["contentDetails"]["videoId"] for it in items]
    if ids:
        for v in yt.videos().list(part="snippet,statistics,contentDetails,status", id=",".join(ids)).execute().get("items", []):
            vids.append(
                dict(
                    id=v["id"],
                    title=v["snippet"]["title"],
                    published=v["snippet"].get("publishedAt"),
                    privacy=v["status"].get("privacyStatus"),
                    publishAt=v["status"].get("publishAt"),
                    duration=v["contentDetails"].get("duration"),
                    views=int(v["statistics"].get("viewCount", 0)),
                    likes=int(v["statistics"].get("likeCount", 0)),
                    comments=int(v["statistics"].get("commentCount", 0)),
                )
            )

    q = lambda **kw: rows(ya.reports().query(ids="channel==MINE", startDate=start, endDate=end, **kw).execute())  # noqa: E731
    by_day = q(metrics="views,estimatedMinutesWatched,subscribersGained,subscribersLost", dimensions="day", sort="day")
    by_video = q(
        metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,comments,shares",
        dimensions="video",
        sort="-views",
        maxResults=50,
    )
    traffic = q(metrics="views,estimatedMinutesWatched", dimensions="insightTrafficSourceType", sort="-views")
    countries = q(metrics="views", dimensions="country", sort="-views", maxResults=10)
    devices = q(metrics="views", dimensions="deviceType", sort="-views")
    titles = {v["id"]: v["title"] for v in vids}
    for r in by_video:
        r["title"] = titles.get(r.get("video"), "")

    snap = dict(
        date=end,
        window=[start, end],
        channel=dict(
            title=ch["snippet"]["title"],
            subscribers=int(stats.get("subscriberCount", 0)),
            views=int(stats.get("viewCount", 0)),
            videos=int(stats.get("videoCount", 0)),
        ),
        last28_by_day=by_day,
        last28_by_video=by_video,
        traffic_sources=traffic,
        top_countries=countries,
        devices=devices,
        uploads=vids,
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{end}.json").write_text(json.dumps(snap, indent=1, ensure_ascii=False))
    (OUT / "latest.json").write_text(json.dumps(snap, indent=1, ensure_ascii=False))
    print(f"saved analytics for {end}: {snap['channel']['subscribers']} subscribers, {snap['channel']['views']} views, {len(vids)} recent uploads")


if __name__ == "__main__":
    main()
