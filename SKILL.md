---
name: apple-design
description: Make Apple-style product launch films: a real 3D product built and lit in Three.js, bold cuts on the beat, giant kinetic type, cutaways with callout labels, a color or finish lineup, an end card, and an original soundtrack composed in code and synced to the picture. Renders a 1080p MP4 with audio. Use whenever the user wants an Apple-style, keynote-style or launch video, a product ad, reveal, teaser or promo film, or says "like the speaker" or "like Oto/Vela", even if they don't name this skill.
---

# Apple Design: launch films

This skill makes 30–35 second product films in the style of an Apple launch spot. Two
finished films ship with it, and every new film starts from one of them:

| Film | Look | Use it for |
|---|---|---|
| `films/oto` | **Pop.** Flat saturated color fields that swap on every beat, huge white words, a playful product that bounces to the bass, 120 BPM house track. | Consumer gadgets, speakers, earbuds, toys, anything fun or colorful. |
| `films/vela` | **Cinematic.** Black stage, studio-lit metal, bloom, slow camera moves, light beams and projected worlds, exploded view, 100 BPM score. | Premium hardware, cameras, wearables, anything "engineered". |

Open `out/sheet.jpg` in either folder (after a render) or just read `film.js` to see
every shot. `references/film-recipe.md` explains how a film is put together and lists
the reusable shot patterns. Read it before writing a new film.

## How a film works

- `films/<name>/index.html` sets up fonts and the type styles.
- `films/<name>/film.js` builds the product from Three.js primitives and defines
  `SHOTS`, a list of `{ a, b, f(t, p) }` time ranges. `renderAt(t)` resets the scene and
  calls the shot for that second. **Every frame is a pure function of `t`**: no
  `Date.now`, no CSS animation, no state carried between frames. That's what makes
  frame-exact rendering possible.
- `films/<name>/music.py` composes the soundtrack with numpy and writes
  `out/score.wav`. Oto's version also writes `env.json` (kick times and a per-frame bass
  envelope) so the product and rings react to the real track.
- `render.mjs` serves the folder, renders frames in headless Chrome with the GPU, and
  encodes the MP4.

## Workflow for a new film

1. **Brief.** Get the product name, what it is and the one surprising thing about it,
   3–5 real facts (numbers with units), colors or finishes, tagline, and launch line
   ("Coming 2027"). If the user only gives a rough idea, invent tasteful specifics and
   say so. Ask at most one question.
2. **Pick the base film** (Oto for pop, Vela for cinematic) and copy it:
   `cp -r films/oto films/<name>` (lowercase, no spaces). Delete the copied `out/` folder and `env.json`.
3. **Write the beat sheet first.** Choose a BPM (100–124). Lay out 8–11 shots on the
   bar grid (at 120 BPM a bar is 2 s, so shots are 2, 4 or 8 s long), with the on-screen
   words for each. Follow the arc in the recipe: cold open → drop → name → what it does →
   inside it → the one number → lineup → silence → end card. Show it to the user as a
   short table before building only if they asked to review; otherwise keep going.
4. **Model the product** in `film.js`, replacing `makeOto` / `makeDevice`. Build it from
   lathe profiles, spheres, tori and rounded boxes with `MeshPhysicalMaterial`
   (clearcoat, sheen, metalness), plus canvas textures for grilles, screens and labels.
   Give it a `pose(...)` or `setFinish(...)` function that shots can call. See the
   modeling section of the recipe.
5. **Rewrite the shots and type**: `SHOTS`, `CAPS`, labels, lineup names, end card.
   Keep cuts on beat boundaries. Reuse the helpers that are already there (`showWord`,
   `showRings`, `drawField`, `panels`, `cam`, the cutaway rig, label leader lines).
6. **Compose the music** by editing the copied `music.py`: set the BPM, the key or chord
   list, and the arrangement blocks so each section matches its shot (hit on the reveal,
   breakdown on the cutaway, silence before the end card). Keep `kick_times` and the
   envelope export if the film uses `env.json`.
7. **Check stills, then render** (from the skill folder):
   ```bash
   python3 films/<name>/music.py
   node render.mjs <name> sheet            # 8 frames → films/<name>/out/sheet.jpg
   node render.mjs <name> stills 4.2,9,17  # any exact seconds
   node render.mjs <name> final            # → <Name>_Launch_Film.mp4 with music
   ```
   Look at the sheet. Fix anything clipped, overlapping, off-center or unreadable before
   the full render. `final` at 60 fps takes about 3–8 minutes for 34 s; use
   `final 30` for a quick draft.
8. **Deliver.** Give the path of the final MP4 and the contact sheet, list the shots in
   one line each, and offer specific tweaks (copy, colors, timing, music).

## Setup (once)

```bash
cd ~/.claude/skills/apple-design && npm install
python3 -m pip install numpy scipy      # or use a venv
```
Needs Google Chrome and ffmpeg. Set `CHROME_PATH` if Chrome is somewhere unusual.

## Quality bar

- Every cut and every word lands on the beat grid of the track. Check the `a`/`b` times against the BPM.
- One idea per shot. Captions ≤ 7 words, giant words 1 word.
- The product is lit well enough to read its form: key light, rim light, soft contact
  shadow, environment reflections on metal.
- At least one shot only this product could have (Oto's cutaway and "louder lifts it
  higher", Vela's wall, table and ceiling).
- The end card has the name, one tagline and a launch line, then a fade on the last note.
- Look at a contact sheet before the final render, every time.

## Guardrails

"Apple-style" is the look. Don't use Apple's logos, product names, trademarks, SF Pro
files or real Apple footage. Fonts here are Inter and Inter Tight. Make up product names
and specs only when the user asked for a concept piece, and label it a concept.
