---
name: apple-design
description: Make polished, keynote-style motion videos (product reveals, launch teasers, feature reels, app promos, social clips in 16:9, 9:16, 1:1 or 4:5) as a single HTML artifact with a built-in player, then export a frame-exact MP4. Use whenever the user wants an "Apple-style" or keynote-style video, a product or launch video, a promo or teaser, an animated reveal, kinetic typography, or a short motion-graphics clip, even if they don't say "artifact" or "reel".
---

# Apple Design

This skill turns a short script into a cinematic, keynote-style video. The video is a
plain HTML page: a deterministic animation engine plus one `VIDEO` object you fill in.
It plays as an artifact (with scrubbing and aspect switching) and exports to MP4 with
`scripts/export.mjs`.

The look: black (or white) stage, huge tight type, one idea per shot, soft blur-in
motion, slow push-ins, an accent gradient used sparingly, and a product that rises
into a light sweep.

## Workflow

1. **Get the brief in one pass.** You need: product or subject name, the one-line
   promise, 3–6 facts worth showing (numbers are gold), call to action, format
   (16:9 for web, 9:16 for Reels/TikTok/Shorts, 1:1 or 4:5 for feeds), and brand
   colors if any. If the user gave a rough idea only, write the copy yourself and
   don't stall on questions. Ask at most one question, and only if the product is unclear.

2. **Storyboard.** Write a beat list before touching code. Read
   `references/style-guide.md` for pacing, copy rules and proven arcs. Default arc
   (about 25–35 s): hook → words → reveal → stat → features → split → statement → end.
   Show the storyboard to the user as a short table (scene, seconds, on-screen text)
   only when they asked to review it; otherwise go straight to building.

3. **Build.** Copy `templates/reel.html` to a new file named after the product
   (for example `nimbus-one-reel.html`). Change only:
   - the `<title>` (the product name plus "Reel", e.g. `Nimbus One Reel`)
   - the `VIDEO` object at the top of the script (see `references/scene-types.md`
     for every scene type and field).
   Leave the engine alone unless the user asks for a new kind of shot. If you add a
   scene type, follow the existing pattern: a builder that returns
   `{ el, update(t, d) }` and sets styles purely from `t`. Never use CSS animations,
   transitions, `setTimeout` or `Date.now()` for motion, or MP4 export breaks.

4. **Images (optional).** Product shots go in `image` (replaces the device) or
   `screen` (fills the CSS device's screen). For an artifact, images must be `data:`
   URIs or files published alongside the page; remote URLs are blocked. With no
   images, the CSS phone, tablet, laptop or watch is drawn with a gradient wallpaper
   in the brand colors, which looks finished on its own.

5. **Publish and hand off.** Publish the page as an artifact (icon: `video`). In
   your reply, give the link, the runtime, and the one-line export command. Users
   iterate fastest by asking for copy or timing changes, so offer that.

6. **Export to MP4 (when asked, or when the user will post it).** The artifact sandbox
   can't record video, so export runs locally:
   ```bash
   cd ~/.claude/skills/apple-design && npm install          # once; uses the user's installed Chrome
   node scripts/export.mjs path/to/reel.html --out reel.mp4
   ```
   Options: `--aspect 9:16` (re-render in another format without editing),
   `--fps 60`, `--audio music.mp3` (trimmed to length with a 1.5 s fade out),
   `--from 4 --to 9` (render a section), `--png` (lossless frames).
   Needs `ffmpeg` on PATH. A 30 s 1080p reel at 30 fps takes roughly 1–3 minutes.

## Quality bar (check before publishing)

- Every on-screen line is short: titles ≤ 6 words, subs ≤ 12 words.
- Each scene's `dur` gives the viewer time to read: about 0.3 s per word plus
  1.2 s for the entrance. A text scene shorter than 2.5 s feels rushed.
- Only one or two `*gradient*` highlights per scene, never a whole paragraph.
- Numbers are specific and carry units (`5.1 mm`, `38 hrs`, `2×`), and the copy
  around them is plain.
- In 9:16, keep titles to two short lines; the engine stacks split scenes and tiles
  for you.
- The default poster frame (the paused frame before play) lands mid-reveal. If the
  reel has no reveal scene, set `VIDEO.poster` to a second where the screen is full.

## Brand and legal guardrails

"Apple-style" describes an aesthetic. Don't use Apple's logos, product names,
trademarks, SF Pro font files, or footage, and don't make the video look like an
official Apple ad for a real Apple product. The template ships with Inter, a free
font close in spirit. Use the user's own product, names and assets.

## Files

- `templates/reel.html` — player + engine + an example `VIDEO` (fictional "Nimbus One").
- `references/scene-types.md` — every scene type, its fields and timing.
- `references/style-guide.md` — pacing, copywriting, color and story arcs.
- `scripts/export.mjs` — frame-exact MP4 export via headless Chrome + ffmpeg.
