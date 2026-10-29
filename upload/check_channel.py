"""
Safety check before anything touches YouTube: the key in the repository secrets must belong to the
Runway To Cockpit channel (config/channel.yaml -> channel.youtube_channel_id). If it belongs to another
channel (for example a personal one picked by mistake on Google's account chooser), stop before building
or uploading anything.

  python upload/check_channel.py            exit 1 if the key is for another channel
  python upload/check_channel.py --soft     print a warning and exit 0 (used by the analytics job)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    soft = "--soft" in sys.argv
    cfg = yaml.safe_load((ROOT / "config" / "channel.yaml").read_text())
    want = (cfg.get("channel") or {}).get("youtube_channel_id")
    creds = Credentials(
        token=None,
        refresh_token=os.environ["YT_REFRESH_TOKEN"],
        client_id=os.environ["YT_CLIENT_ID"],
        client_secret=os.environ["YT_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
    )
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
    items = yt.channels().list(part="id,snippet", mine=True).execute().get("items", [])
    got = [(c["id"], c["snippet"]["title"]) for c in items]
    if not want:
        print(f"No channel.youtube_channel_id in config/channel.yaml; key is for {got}")
        return 0
    if any(cid == want for cid, _ in got):
        print(f"YouTube key OK: {got}")
        return 0
    msg = (f"The YouTube key in the repository secrets is for {got}, not the Runway To Cockpit channel ({want}). "
           "Nothing was uploaded. Reconnect YouTube (README, one-time setup step 2) and pick the Runway To Cockpit "
           "channel on Google's account chooser, then update YT_REFRESH_TOKEN.")
    print(("::warning::" if soft else "::error::") + msg)
    return 0 if soft else 1


if __name__ == "__main__":
    sys.exit(main())
