# Apple Design (/apple-design)

A Claude skill for making keynote-style motion videos (product reveals, launch
teasers, feature reels, app promos and social clips) in minutes.

Describe your product, and Claude writes the copy, storyboards the shots and builds
the video as a single HTML artifact with a player you can scrub. When it's ready,
one command exports a frame-exact MP4.

**What you get**

- 8 shot types: hook title, punch words, product reveal, count-up stat, feature
  tiles, split screen, line-by-line statement and end card
- CSS-drawn phone, tablet, laptop and watch, so a video works with no product photos
- 16:9, 9:16, 1:1 and 4:5 from the same script
- Dark and light looks, with brand-color gradients
- MP4 export through headless Chrome and ffmpeg, with optional music

## Install

Copy this folder into your skills directory:

```bash
git clone https://github.com/aronovdaniel14-cmd/apple-design ~/.claude/skills/apple-design
```

On claude.ai, zip the folder and upload it under **Settings → Capabilities → Skills**.

## Use

Type `/apple-design` in Claude Code, or just ask Claude something like:

> Make an Apple-style launch video for my app Driftwood, a journaling app with
> 4.9 stars and 200k users. 9:16 for Instagram.

## Export to MP4

Needs Node 18+, Google Chrome and ffmpeg.

```bash
cd ~/.claude/skills/apple-design && npm install
node scripts/export.mjs path/to/my-reel.html --out my-reel.mp4
```

| Option | Does |
|---|---|
| `--aspect 9:16` | Render in another format without editing the file |
| `--fps 60` | Frame rate (default 30) |
| `--audio track.mp3` | Add music, trimmed to length with a fade out |
| `--from 4 --to 9` | Render one section |
| `--png` | Lossless frames |

## Edit by hand

Open the HTML file and change the `VIDEO` object at the top of the script. Every
scene type and field is listed in [references/scene-types.md](references/scene-types.md).
Wrap a word in `*asterisks*` to give it the accent gradient.

## Note

"Apple-style" describes a look. Don't use Apple's logos, trademarks, product
names or fonts in your videos. The template uses Inter, a free font.

MIT License.
