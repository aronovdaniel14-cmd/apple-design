# Apple Design (`/apple-design`)

A Claude skill that makes Apple-style product launch films: a real 3D product built
and lit in Three.js, bold cuts on the beat, giant kinetic type, cutaways with callout
labels, a color lineup, an end card, and an original soundtrack composed in code and
synced to the picture. Output is a 1080p MP4 with audio.

It ships with two finished films that every new film starts from:

- **Oto**: pop. A levitating speaker on flat color fields that change every beat, with a 120 BPM house track.
- **Vela**: cinematic. A palm-sized projector, studio-lit metal on black, an exploded view and a 100 BPM score.

## Install

```bash
git clone https://github.com/aronovdaniel14-cmd/apple-design ~/.claude/skills/apple-design
cd ~/.claude/skills/apple-design && npm install && python3 -m pip install -r requirements.txt
```

Needs Google Chrome, ffmpeg, Node 18+ and Python 3 with numpy and scipy.

## Use

In Claude Code, type `/apple-design`, or just ask:

> Make an Apple-style launch film for my smart water bottle, Drift. It glows when you
> need to drink. Three colors: Glacier, Moss, Ember.

Claude copies the closest film, models your product, rewrites the shots and the music,
checks a contact sheet, and renders the MP4.

## Render the examples yourself

```bash
python3 films/oto/music.py
node render.mjs oto sheet      # 8-frame contact sheet in films/oto/out/
node render.mjs oto final      # Oto_Launch_Film.mp4, about 4 minutes at 60 fps
```

`node render.mjs <film> stills 4,9.5,17` renders exact seconds. `final 30` renders a faster 30 fps draft.

## Note

"Apple-style" describes the look. Don't use Apple's logos, trademarks, product names or
fonts. The films use Inter and Inter Tight.

MIT License.
