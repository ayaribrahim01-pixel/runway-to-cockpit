# Writing a lesson script (v2 style)

A lesson is one YAML file: `series/<series>/epNNN-v2.yaml`. The three finished scripts are the reference. Open the one
closest to your topic and copy its shape, never its sentences:
- `ep001-v2.yaml` (overview, history, institutions): airportmap hook, whiteboard, count, doc, airspace3d, globe, grid, ladder, split, org
- `ep002-v2.yaml` (articles and rules): kinetic hook, doc pages, compare, ladder, grids for quick-fire facts
- `ep003-v2.yaml` (concepts with a pattern): freedom beats, globe routes, family whiteboard, 4 quizzes

The topic list for every lesson is in `series/<series>/plan.yaml` (`topics:`). `README.md` lists every beat type,
3D view, airport anchor and the narration markup.

## Research first (30 min)
1. List every fact the lesson needs: numbers, dates, article / section / rule numbers, definitions, limits.
2. Check each one online against a primary source: ICAO (Doc 7300, Annexes, Doc 4444, ICAO news), Gazette of India
   (egazette.gov.in) for Acts and Rules, DGCA (dgca.gov.in: CARs, AICs, AIP India), EASA Easy Access Rules, UK CAA.
   Use books and question banks only to see what the exam asks.
3. Indian law changes: Bharatiya Vayuyan Adhiniyam 2024 replaced the Aircraft Act 1934 (in force 1 Jan 2025); rules
   under it are being re-issued. For any rule number (Aircraft Rules 1937, etc.) check whether it is still in force
   and say "as of <month year>" where it is changing.
4. Put the sources in `sources:` and the key facts in `youtube.key_facts`.

## Shape of a lesson (8–10 min, ~1,150–1,450 spoken words at ~148 wpm)
1. **Hook (≤ 15 s):** a question or surprise the viewer feels, answered later. Visual from the first frame
   (airportmap, globe, kinetic). Promise what they'll be able to do.
2. **title3d** (5 s), then a one-line roadmap.
3. **3–4 chapters** (`chapter`, optional `bg3d`). Each chapter: 6–10 beats.
4. **Every 30–45 s a pattern interrupt:** `examtip` (variants `trap`, `exam`, `key`, `dyk`, `easa`, `remember`),
   `kinetic` line, `count`, a quick question.
5. **3 quizzes** (`quiz`, exam style, plausible wrong options), **recap** (5–7 lines), **outro**: next lesson + "A new
   lesson every day at ten fifteen in the morning", `nextSub: "Episode N · tomorrow, 10:15 AM IST"`.

Beats are 3–10 s (validate.py warns above ~12 s). Never the same beat type twice in a row. Keep 3D beats (`shot`,
`title3d`, `airspace3d`, chapter `bg3d`) under ~20 % of the running time: a 3D frame renders ~10× slower.

## Writing the narration
- Spoken English for a student pilot: short sentences, one idea per sentence, "you".
- India first (DGCA, BVA 2024, CARs, AIP India), then one line on EASA / UK CAA where they differ.
- Exam focus: say which facts are asked and the classic traps ("Most books say 36. It's 40 now.").
- Cues: `{{0}}`, `{{1}}`… in order, placed right before the word that should trigger the visual. Items revealed by cues
  (points, ladder, recap, airportmap callouts…) need one cue each.
- `[[pause 0.6]]` for a beat of silence; quizzes use `{{0}}` question, `{{1}}` "think", `[[pause 3]]`, `{{2}}` answer.
- `{shown|spoken}` when the screen and the voice differ: `{1944|nineteen forty-four}`,
  `{7 December 1944|the seventh of December, nineteen forty-four}`, `{Art. 29|Article Twenty-nine}`. Keep trailing
  punctuation inside the braces.
- `*word*` highlights in on-screen text.
- New acronyms the voice should say as a word go in `engine/lexicon.yaml` (others are spelled out letter by letter).
  Save that file to the Studio too.

## Reel (25–40 s) and posts
- `reel.scenes`: `rhook` (a question in the first 2 s), 2–3 of `rpoints` / `rquote` / `rstat` / `rglobe`, `rtip`
  (the exam line), `rend`. `reel.title` ends with `#DGCA #aviation`; `reel.caption` has 5–7 hashtags.
- `posts`: three: `tip` (kind `exam`, `trap`, `key`, `dyk`, `easa` or `remember`), `quiz` (q, 4 options, answer,
  explain: becomes 2 slides), `sheet` (cheat sheet, 5–7 items with icons). Captions: hook line, value line,
  "Full lesson: YouTube @runwaytocockpit · <Series> Ep N", 5–8 hashtags. Say "10:15 AM" where a time appears.

## YouTube fields
- `youtube.title` (≤ 100 characters): the searchable topic in the first ~60 characters, then
  `| DGCA Air Regulations Ep N`. Examples: "Chicago Convention Articles for DGCA: …", "Freedoms of the Air Explained: …".
- `youtube.description`: 2–3 sentences, keywords early (the build adds chapters, key facts, sources, hashtags).
- `youtube.tags`: 10–15. `thumbnail.line1`/`line2`: ≤ 4 words in total, the promise not the topic list.

## Before you save
```
python3 engine/validate.py series/<series>/epNNN-v2.yaml
```
No errors; read the warnings and fix the ones that matter (long beats, missing cues). Then save the file to the Studio
(`python3 ops/studio.py filedocs …` → ArtifactData `files/<doc id>`) and set the episode's `status: scripted`,
`script: <path>`.

YAML gotchas: quote text that starts with `*` or `{`; never use `on:` / `yes:` / `no:` as keys; use `>-` blocks for
`say:`.
