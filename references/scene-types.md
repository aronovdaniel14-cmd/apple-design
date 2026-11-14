# Scene types

Every scene has `type` and `dur` (seconds, minimum 1). Neighbouring scenes overlap by
0.55 s for a blurred crossfade, so the total runtime is a little less than the sum of
`dur`. In any text field, `*word*` gives that run the accent gradient.

## Top-level `VIDEO` fields

| Field | Default | Notes |
|---|---|---|
| `title` | — | For your reference. |
| `aspect` | `"16:9"` | `16:9` (1920×1080), `9:16` (1080×1920), `1:1` (1080×1080), `4:5` (1080×1350). |
| `fps` | `30` | Used by the exporter. |
| `theme` | `"dark"` | `dark` (black stage) or `light` (off-white stage). |
| `accent`, `accent2` | blue, violet | Gradient runs `accent2 → accent`. Also tints the background glow and device wallpaper. |
| `poster` | mid-reveal | Second shown while paused before first play. |
| `loop` | `false` | Loop playback and skip the final fade to black. |

## `title` — the hook
Words blur in one after another.
`{ type: "title", dur: 3, eyebrow?: "", text: "Everything you love. *Now lighter.*", sub?: "" }`
Timing: about 0.9 s + 0.09 s per word to settle. Good for the first and only line of a cold open.

## `words` — punch words
One big word at a time, swapping in place. Split `dur` evenly across the words.
`{ type: "words", dur: 2.8, words: ["Thinner.", "Brighter.", "*Faster.*"] }`
Use 2–4 words, about 0.8–1 s each. Put the gradient on the last one.

## `reveal` — the product moment
Eyebrow, then the product rises with a light sweep, then the name and tagline.
`{ type: "reveal", dur: 4.5, eyebrow?: "Introducing", name: "Nimbus One", tagline?: "", device?: "phone|tablet|laptop|watch|none", screen?: "img", image?: "img" }`
`image` replaces the device entirely (use a transparent PNG product shot). `screen` fills the device screen.
Needs at least 4 s. The name settles at 2.4 s and the tagline at 2.9 s.

## `stat` — the big number
Counts up from `from` (default 0) to `value`.
`{ type: "stat", dur: 3, eyebrow?: "", value: 5.1, decimals?: 1, prefix?: "", suffix: "mm", label?: "", from?: 0 }`
Labels read best as a plain sentence that explains why the number matters.

## `features` — tiles
Up to 6 tiles stagger in. 3 per row in landscape, 1 per row in 9:16 (keep to 3 there).
`{ type: "features", dur: 4, title?: "", items: [{ icon?: "38", title: "All-day battery", text?: "" }] }`
`icon` is a short glyph shown in a gradient chip: a number, two letters, or one symbol character.
Allow about 1.2 s + 0.14 s per tile, plus reading time.

## `split` — copy beside the product
Text on one side, device or image sliding in from the other. Stacks vertically in 9:16.
`{ type: "split", dur: 4, eyebrow?: "", title: "", text?: "", device?: "phone", screen?: "", image?: "", flip?: false }`
`flip: true` puts the media on the left.

## `statement` — the closing thought
Lines wipe up one by one. Separate lines with `\n`.
`{ type: "statement", dur: 3.5, text: "Small enough to forget.\n*Powerful enough to remember.*" }`
Two lines is ideal; each line enters 0.45 s after the previous one.

## `end` — the end card
`{ type: "end", dur: 3.5, eyebrow?: "", name: "Nimbus One", tagline?: "Available this spring.", cta?: "Pre-order now", foot?: "nimbus.example" }`
The last scene fades to black over its final 0.7 s, unless `loop` is on.
