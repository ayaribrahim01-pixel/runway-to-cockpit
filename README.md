# Runway To Cockpit: a daily DGCA lesson, made and published automatically

Every day this project turns one lesson script into:

| Output | Spec |
|---|---|
| **Lesson video** | 1920×1080, 30 fps, 8–14 min: short beats that change every few seconds, original 3D shots, an illustrated airport, kinetic type, exam-tip cards, quizzes, chapters, word-by-word captions |
| **Reel / Short** | 1080×1920, 30–60 s, big word-synced captions |
| **Thumbnail** | 1280×720 |
| **Captions** | `.srt`, uploaded to YouTube as real closed captions |
| **Description** | intro, chapter timestamps, key exam facts, sources, hashtags |

The lesson and its Short go live on YouTube at **10:15 AM IST**; the Reel and 3 image posts go out on Instagram the same morning.

**Studio and daily run.** The Runway To Cockpit Studio page (a Claude artifact) holds the schedule, the upload sheet for
every lesson, growth reviews and the run log, plus a copy of this project. A scheduled Claude task runs every day at
**17:37 IST**: it restores the project from the Studio, writes and fact-checks scripts ahead, renders the next lesson,
checks it and sends the files to the owner to schedule (see `ops/DAILY_RUN.md`). When GitHub + YouTube are connected,
the workflows below take over the upload.

## How it works

```
series/<subject>/epNNN.yaml   the script: narration + what to show, beat by beat
        │
        ├─ engine/tts.py        voice (Kokoro, free and local), with a timestamp for every word
        ├─ engine/build.py      timing, chapters, captions, description, audio mix, render, mux
        ├─ engine/director.py   the "editor": section accent colours, a different transition into every beat,
        │                       camera drift, sound design (whooshes, pops, dings, stamps, marker scribbles,
        │                       jet / cabin / airport ambience), a different music style per chapter
        ├─ engine/music.py      original music generated in code (doc / drive / wonder / pulse)
        ├─ engine/sfx.py        original sound effects and ambiences, synthesized (no samples)
        ├─ engine/validate.py   script checks before building (fields, cues, pacing, acronyms, length)
        ├─ engine/qa.py         checks the finished video: still screens > 3 s, blank frames, loudness, silence
        └─ remotion/            the visuals (React → video), incl. 3D (three.js) rendered in software
        ▼
out/<subject>/<code>[-v2]/      lesson .mp4, reel .mp4, thumbnail, .srt, description.txt, manifest.json, qa_report.json
        ▼
upload/youtube_upload.py        scheduled publish, captions, thumbnail, playlist
upload/instagram_upload.py      the Reel and image posts (official Instagram Graph API)
```

The **visuals react to the narration word by word**: in a script, `{{2}}` before a word means
"show item 2 exactly when this word is spoken".

## Make an episode by hand

```bash
pip install -r requirements.txt
python engine/setup_models.py          # first time only: downloads + prepares the voice model
npm ci --prefix remotion
python engine/validate.py series/air-regulations/ep001-v2.yaml
python engine/build.py series/air-regulations/ep001-v2.yaml                # full build
python engine/build.py series/air-regulations/ep001-v2.yaml --preview 75   # first 75 s only
python engine/build.py series/air-regulations/ep001-v2.yaml --stills       # one frame per beat
python engine/qa.py out/air-regulations/AR-001-v2/
```

## Writing a script (YAML)

`style: v2` turns on the new editor. A lesson is a list of beats; keep most beats 3–10 s and put a
pattern interrupt (exam trap, did-you-know, quiz, kinetic line) every 30–45 s.

```yaml
style: v2
scenes:
  - type: airportmap               # our illustrated airport with numbered callouts
    say: "Land in Kochi. {{0}}The runway numbers look the same…"
    data:
      title: "Why does every runway look the *same*?"
      plane: {speed: 1}            # an aircraft lands and taxis to a stand
      callouts:
        - {n: 1, label: "Runway designator", sub: "*09* = magnetic heading ≈ 090°", at: designator, cue: 0, zoom: 3.2}
        - {overview: true, cue: 1}
  - type: kinetic                  # big words popping in
    say: "So who writes one rulebook for the whole sky?"
    data: {tone: accent, lines: ["Who writes *one rulebook*", "for the whole sky?"]}
  - type: examtip
    say: "{{0}}Exam trap! Most books say thirty-six. {{1}}It's forty."
    data: {variant: trap, q: "ICAO Council members?", wrong: "36", wrongCue: 0, right: "40", rightCue: 1}
```

Narration markup: `{{n}}` cue · `[[pause 0.8]]` silence · `{1944|nineteen forty-four}` show one thing, say another
(put trailing punctuation inside the braces) · `*word*` highlight.

**v2 beat types**: `title3d shot kinetic doc split examtip count whiteboard airspace3d airportmap`, plus the classic
`chapter (optionally with bg3d) globe points stat timeline ladder org compare quote grid quiz recap outro`.

- Exam-card variants: `exam trap key dyk easa remember`.
- 3D views: take-off `follow head-on spotter low`; cruise `side front rear below wing chase top orbit`.
- `airportmap` anchors: `designator threshold pre-threshold aiming-point touchdown-zone centreline edge-marking
  edge-lights threshold-lights approach-lights papi stopway holding-position rapid-exit taxiway apron stands terminal
  tower fire-station fuel-farm hangar de-icing windsock helipad ga-apron car-park` (or give `x`/`y`).
  Each callout can `zoom` the camera to it; `overview: true` flies back out; a legend builds up automatically.
- Reel beats: `rhook rglobe rstat rpoints rquote rtip rend`.

> YAML gotchas: quote any text that starts with `*` or `{`; never use `on:` / `yes:` / `no:` as keys.

Pronunciations live in `engine/lexicon.yaml`. Capital-letter acronyms not listed there are read letter by letter, crisply.

## Render speed

Live 3D needs software WebGL, so a frame with a 3D shot takes ~1–2 s to render without a graphics card, a 2D frame a
fraction of that. A 75-second preview takes ~25–35 min on 2 CPUs; a full lesson takes 1–2 hours on a GitHub runner.

## One-time setup (about 40 minutes)

### 1 · GitHub (runs the daily jobs in the cloud, even when your laptop is off)
1. Create a free account at github.com and a new **public** repository (e.g. `runway-to-cockpit`).
   Public repos get free Actions minutes. Never commit the study PDFs: scripts are written in our own words.
2. Put this project in it (or connect GitHub to Claude and Claude pushes it for you).

### 2 · YouTube upload permission
1. Phone-verify the channel at youtube.com/verify (allows videos longer than 15 min and custom thumbnails).
2. console.cloud.google.com: create a project → **Enable** "YouTube Data API v3" and "YouTube Analytics API".
3. **OAuth consent screen**: External; add your Gmail as a test user; then **Publish app** (*In production*,
   so the login doesn't expire after 7 days. Google's review isn't needed for your own channel).
4. **Credentials → Create OAuth client ID** → *Web application* → redirect URI
   `https://developers.google.com/oauthplayground`. Copy the Client ID and Client secret.
5. developers.google.com/oauthplayground → ⚙ → "Use your own OAuth credentials" → paste both →
   scopes `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly`
   (the last one lets the daily analytics job read your channel's numbers)
   → Authorize → **Exchange authorization code for tokens** → copy the **refresh token**.
6. GitHub repo → Settings → Secrets and variables → Actions → add `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

### 3 · Instagram permission (reels + image posts)
1. Switch Instagram to a **Professional** account (Creator) and link it to a **Facebook Page**.
2. developers.facebook.com → Create app (Business) → add **Instagram Graph API** and **Facebook Login for Business**.
3. Graph API Explorer: user token with `instagram_basic`, `instagram_content_publish`, `pages_show_list`,
   `pages_read_engagement`, `business_management` → long-lived token → Page token (`/me/accounts`) and your
   Instagram user id (`/{page-id}?fields=instagram_business_account`).
4. Add secrets `IG_USER_ID` and `IG_ACCESS_TOKEN`.

### 4 · Switch it on
GitHub → **Actions** → enable workflows → run **Daily lesson** once by hand to test.
From then on: **19:45 IST** build tomorrow's episode → YouTube scheduled for **10:15 IST** →
**10:15 IST** the Instagram job posts the reel.

## Daily rhythm
- **06:30 IST** `analytics.yml` saves the channel's numbers to `state/analytics/latest.json` and applies any title,
  description or thumbnail changes Claude requested in `state/youtube_updates.json`.
- Claude's daily review reads those numbers, compares the last episodes (views, watch time, average view %,
  subscribers gained, traffic sources) and adjusts the next titles, thumbnails, descriptions and topic order.
- `state/published.json` records what has gone out; `python engine/publish_queue.py status` shows the queue.
- The queue publishes `series/<subject>/epNNN.yaml` files in order (`plan.yaml` lists all 48 Air Regulations lessons).
- If no script is waiting, the daily job skips that day and publishes nothing.

## Content rules
- Scripts are written fresh in our own words. Books, notes and question banks are used to plan topics,
  check facts and see what the exam asks, never copied.
- Every number and date is checked against primary sources (ICAO, Gazette of India, DGCA, court records) and listed
  in the description with an "as of" date where rules are changing.
- Everything on screen is original: our 3D aircraft and airport, our drawings, our music and sound effects.
  Fonts: Inter (SIL OFL) and Source Serif 4 (OFL). SF Pro is not used: Apple's licence limits it to app mock-ups.
- Maps show no country borders (the globe uses coastline dots only).

## Voice
Kokoro voice blend chosen by the channel owner (am_michael + am_fenrir), ~148 words/min, natural pauses,
crisp acronyms. Switching to your own cloned voice later changes only `engine/tts.py`.
