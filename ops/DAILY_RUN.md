# Daily run: Runway To Cockpit

The scheduled Claude task runs this every day at **17:37 IST**. By about **20:00 IST** the owner should have the next
lesson ready to schedule on YouTube for **10:15 AM IST**: the lesson video, the Short/Reel, the thumbnail, English
subtitles, 3 Instagram posts and a ready-to-paste upload sheet. The Studio page shows the same upload sheet with copy
buttons.

`STUDIO` below means the Studio artifact URL given in the task prompt. `DB=/home/claude/studio-db`. The prompt has
already restored the project from the Studio into `/home/claude/aviation-studio`, saved the `episodes` documents to
`$DB/episodes/` and started the install.

## Keep usage low
This runs on Ibrahim's Claude plan, and its usage limit is shared with all his other work: the first run (26 Oct)
stopped half-way when the limit was reached. Be economical so the run always finishes:
- Don't re-read files you already have; read only the parts of README/scripts you need.
- Look at images small: one contact sheet of stills for a new script, one 6-frame sheet after the build (scale ≤ 0.5).
- Print only the end of logs (`tail`), never whole files or long JSON.
- Web research only for the facts the script needs; at most one new script per run (step 6).
- Growth review: a few lines, and only when there are numbers to read.
If you are stopped anyway, the next run picks up where this one left off (the Studio keeps the state).

## Ground rules
- **Never upload, post, email or message anyone.** The only outgoing actions are SendUserFile / SendUserMessage to the
  owner. Uploading to YouTube/Instagram is done by the owner (or, once set up, by the owner's own GitHub Actions).
- **Facts are checked online the same day** against primary sources (ICAO, Gazette of India / egazette, DGCA and eGCA,
  CARs, AIP India, EASA, UK CAA, reputable news for anything recent). Every figure in a script needs a source listed
  under `sources:`. If two sources disagree, use the primary one and say "as of <date>" on screen.
- **Original words only.** Books, notes, question banks and other channels are for checking topics and facts, never
  copied. Mnemonics and examples are our own.
- **Keep the owner's time small.** One message at the end with the files. Write to them earlier only if a decision is
  theirs to make.
- **Save as you go.** Anything written in this session is lost when it ends unless it is saved to the Studio (step 8).

## 1 · Pick
```
python3 ops/studio.py pick $DB
```
Prints JSON. `skip` → no build today (the buffer is full or the plan is finished): do steps 6, 7 and 8, then finish
with one short line. Otherwise note `code`, `script`, `publishDate`; `needsScript: true` → step 2 first.

## 2 · Script (only when the picked lesson has none)
Follow `ops/WRITING_GUIDE.md`. Then `python3 engine/validate.py <script>` until there are no errors. Save the script
to the Studio right away (step 8, files).

## 3 · Visual check (about 10 min)
```
python3 engine/build.py <script> --stills
```
Make a contact sheet of `out/<series>/<code>-v2/stills/*.jpg` (PIL or ffmpeg tile, 4 per row, ~480 px wide each) and
look at it with Read. Fix text that overflows or overlaps, empty panels, wrong airport anchors, labels covering the
subject. Re-run `--stills` after a fix. (The narration is cached, so the full build reuses it.)

## 4 · Build (background, ~60–80 min)
Start it with Bash `run_in_background: true`, `timeout: 7200000`:
```
cd /home/claude/aviation-studio && python3 engine/build.py <script> > /home/claude/build.log 2>&1 \
  && python3 engine/qa.py out/<series>/<code>-v2/ >> /home/claude/build.log 2>&1
```
The full build renders the lesson, the Short/Reel, the thumbnail and the Instagram posts in one go. Use `--only
long|reel|thumb|posts` only to redo one part after a fix.
Do steps 6 and 7 while it renders. Don't start a second render at the same time.

## 5 · Check the result
- `qa_report.json`: static screens > 3 s, black frames, loudness (target −14 LUFS), silences. Look at 6 frames spread
  across the lesson (ffmpeg `-ss`) and 2 from the reel.
- Serious fault (black or frozen video, missing audio, garbled voice): fix and rebuild if it can finish by ~22:00 IST;
  otherwise deliver with a clear note of what is wrong.
- Then: `python3 ops/studio.py sheet out/<series>/<code>-v2 <script> <publishDate>` → `<code> upload sheet.txt` and
  `upload_doc.json`.

## 6 · Write ahead
If fewer than two lessons after today's have scripts, write **one**: the next one (`ops/WRITING_GUIDE.md`, validate,
save it to the Studio straight away). If two are ready, skip this step. Never write more than one script per run.

## 7 · Growth review (a few minutes)
Gather what is available, newest first:
1. Metricool connector (ToolSearch "metricool"): YouTube and Instagram metrics for the last 7 and 28 days
   (views, watch time, average view duration, subscribers, reach, saves, shares).
2. In GitHub mode: `state/analytics/latest.json` in the owner's repo (written daily by `analytics.yml`).
3. Otherwise public numbers: WebFetch `https://www.youtube.com/@runwaytocockpit/videos` and `.../shorts` (titles, views).
Then write `growth/<YYYY-MM-DD>` (step 8) with: the numbers, 2–4 observations and the concrete changes you are making,
e.g. a sharper title or thumbnail line for an upcoming lesson, a different hook style, moving a high-demand topic
earlier, a better Short hook. Apply the changes to the scripts you write or have written ahead. If there is no data
yet, say so in one line and keep the defaults.

What YouTube rewards (use this to judge): viewers who click (click-through rate on the thumbnail and title) and keep
watching (average view duration and percentage), viewers who come back, and session time. So: deliver the title's
promise in the first 30 s; searchable titles ("DGCA", "Air Regulations", "CPL", the topic) with the keyword in the
first 60 characters; thumbnails with ≤ 4 big words; chapters; a daily Short that points to the lesson; playlists and
end screens; a pinned quiz comment for engagement; a steady daily time.

## 8 · Save to the Studio and deliver
Use ArtifactData (url = STUDIO). One `batch` call (≤ 50 writes, ≤ 1 MB) where possible; pin `if_version` for
documents that already exist (each document's version is printed in the `list` result; or `get` it just before
writing). New documents need none.
- `files/<doc id>`: every script or project file you created or changed. Make the JSON with
  `python3 ops/studio.py filedocs /home/claude/filedocs <path> [<path>…]` and pass each as `file_path`.
- `episodes/<code>` update: `status` (`built`, then `delivered` once sent), `script`, `publishDate`, `builtAt`,
  `deliveredAt` (ISO, IST), `note` if something is off. Newly scripted lessons: `status: scripted`, `script`.
- `uploads/<code>` set from `upload_doc.json` (`file_path`).
- `log/<YYYYMMDD-HHMM>` set: `{at, kind: "build"|"skip"|"error"|"review", title, detail}` (2–3 short lines).
- `growth/<YYYY-MM-DD>` set from step 7: `{date, source, numbers, observations: [...], changes: [...]}`.

Deliver with **SendUserFile**, `status: "proactive"`, one call, files in this order: lesson .mp4, Short/Reel .mp4,
thumbnail.jpg, `<code>.en.srt`, the Instagram post .jpg files, `<code> upload sheet.txt`. Caption:
"<code> · goes live <weekday d Mon> at 10:15 AM IST".

Finish with a short message (3–5 lines): which lesson is ready and when it goes live; "schedule both the lesson and the
Short for 10:15 AM; copy the title, description and tags from the upload sheet or the Studio page"; anything that
needs their attention. No step-by-step recap.

## If something breaks
- Install fails: retry once; `pip install --break-system-packages`, `npm ci --prefix remotion`.
- Render fails: read the end of `/home/claude/build.log`. `SPLIT_RENDER=0` turns off segment rendering;
  `REMOTION_GL=none` renders 3D without SwiftShader (fast, but 3D shots may be black: check stills).
- Anything you fix in code: save the changed files to the Studio (`files/`) so tomorrow's run has the fix.
- Can't deliver a lesson today: log it, send one line saying so and when the next one will be ready.

## GitHub mode (after the owner connects GitHub + YouTube)
When `config/settings.mode` is `"github"` and `githubRepo` is set: clone the repo, write/fix scripts there, commit and
push; the repo's Actions build at 19:45 IST, upload to YouTube for 10:15 and save analytics. Then this run only writes
scripts, reviews growth (`state/analytics/latest.json`), requests title/description/thumbnail changes through
`state/youtube_updates.json`, and updates the Studio. It does not render or send video files.
