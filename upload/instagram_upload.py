"""
Publish to Instagram through the official Instagram Graph API:
  - the episode's reel (Reels), and
  - the day's image posts (single images or carousels), from out/<…>/posts/posts.json

Secrets (see README "One-time setup"):
  IG_USER_ID       Instagram professional account ID
  IG_ACCESS_TOKEN  long-lived token with instagram_content_publish permission
Optional:
  IG_GRAPH_HOST    graph.facebook.com (default; Facebook Login for Business: direct file upload for video)
  IG_API_VERSION   default v23.0
  IMAGE_BASE_URL   public base URL where the post images are reachable (Instagram fetches images by URL);
                   the daily workflow publishes them as GitHub release assets and passes that URL.

Usage:
  python upload/instagram_upload.py reel  out/.../manifest.json
  python upload/instagram_upload.py posts out/.../posts/posts.json --base-url https://…/
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

HOST = os.environ.get("IG_GRAPH_HOST", "graph.facebook.com")
VER = os.environ.get("IG_API_VERSION", "v23.0")


def api(path: str) -> str:
    return f"https://{HOST}/{VER}/{path}"


def check(r: requests.Response) -> dict:
    try:
        j = r.json()
    except Exception:
        r.raise_for_status()
        raise
    if r.status_code >= 400 or "error" in j:
        raise SystemExit(f"Instagram API error: {json.dumps(j)}")
    return j


def wait_ready(container: str, token: str, timeout: int = 900):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = check(requests.get(api(container), params={"fields": "status_code,status", "access_token": token}, timeout=60))
        code = j.get("status_code")
        print(f"  container {container}: {code}", flush=True)
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise SystemExit(f"processing failed: {j}")
        time.sleep(8)
    raise SystemExit("timed out waiting for Instagram to process the media")


def publish(user: str, token: str, container: str) -> str:
    pub = check(requests.post(api(f"{user}/media_publish"), data={"creation_id": container, "access_token": token}, timeout=120))
    return pub["id"]


def post_reel(manifest: Path, video_url: str | None) -> dict:
    man = json.loads(manifest.read_text())
    user = os.environ["IG_USER_ID"]
    token = os.environ["IG_ACCESS_TOKEN"]
    caption = man.get("reel_post", {}).get("caption", "")
    yt = manifest.parent / "youtube_result.json"
    if yt.exists() and json.loads(yt.read_text()).get("long_id"):
        caption = caption.rstrip() + "\n\n▶ Full lesson on YouTube (link in bio)"
    params = {"media_type": "REELS", "caption": caption[:2200], "share_to_feed": "true", "thumb_offset": "1500", "access_token": token}
    if video_url:
        params["video_url"] = video_url
        container = check(requests.post(api(f"{user}/media"), data=params, timeout=120))["id"]
    else:
        reel = manifest.parent / man["files"]["reel"]
        params["upload_type"] = "resumable"
        container = check(requests.post(api(f"{user}/media"), data=params, timeout=120))["id"]
        size = reel.stat().st_size
        with open(reel, "rb") as fh:
            r = requests.post(f"https://rupload.facebook.com/ig-api-upload/{VER}/{container}",
                              headers={"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size)},
                              data=fh, timeout=1800)
        print(f"  uploaded {reel.name}: {check(r)}")
    wait_ready(container, token)
    mid = publish(user, token, container)
    print(f"  published reel: media id {mid}")
    return {"reel_media_id": mid}


def post_images(posts_json: Path, base_url: str) -> dict:
    """posts.json: [{"caption": "...", "images": ["post1_1.jpg", "post1_2.jpg", ...]}, ...]"""
    user = os.environ["IG_USER_ID"]
    token = os.environ["IG_ACCESS_TOKEN"]
    posts = json.loads(posts_json.read_text())
    out = []
    base = base_url.rstrip("/") + "/"
    for p in posts:
        imgs = p["images"]
        if len(imgs) == 1:
            c = check(requests.post(api(f"{user}/media"), data={"image_url": base + imgs[0], "caption": p["caption"][:2200],
                                                               "access_token": token}, timeout=120))["id"]
        else:
            children = []
            for im in imgs[:10]:
                ch = check(requests.post(api(f"{user}/media"), data={"image_url": base + im, "is_carousel_item": "true",
                                                                    "access_token": token}, timeout=120))["id"]
                children.append(ch)
            for ch in children:
                wait_ready(ch, token)
            c = check(requests.post(api(f"{user}/media"), data={"media_type": "CAROUSEL", "children": ",".join(children),
                                                               "caption": p["caption"][:2200], "access_token": token}, timeout=120))["id"]
        wait_ready(c, token)
        mid = publish(user, token, c)
        print(f"  published post ({len(imgs)} image{'s' if len(imgs) > 1 else ''}): {mid}")
        out.append(mid)
        time.sleep(5)
    return {"post_media_ids": out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["reel", "posts"])
    ap.add_argument("path")
    ap.add_argument("--video-url", default=None)
    ap.add_argument("--base-url", default=os.environ.get("IMAGE_BASE_URL"))
    a = ap.parse_args()
    p = Path(a.path).resolve()
    if a.what == "reel":
        res = post_reel(p, a.video_url)
    else:
        if not a.base_url:
            raise SystemExit("--base-url (public URL of the images) is required for image posts")
        res = post_images(p, a.base_url)
    (p.parent / f"instagram_{a.what}_result.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    sys.exit(main())
