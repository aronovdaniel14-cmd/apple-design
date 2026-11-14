# Keynote-style video: style guide

## What makes it read as "keynote style"

- **One idea per shot.** If a scene says two things, split it into two scenes.
- **Type is the hero.** Huge, bold, tightly tracked, with lots of empty space around it.
- **Calm motion.** Things ease in fast and settle slowly (ease-out). Nothing bounces,
  spins or shakes. Blur-to-sharp entrances and a slow 3–4% push-in do most of the work.
- **Restraint with color.** A black or near-white stage, neutral greys, and one accent
  gradient used on one or two words or numbers per scene.
- **The product is lit, not decorated.** A single soft glow behind it and one light sweep
  across it.
- **Rhythm.** Alternate slow beats (reveal, statement) with fast ones (punch words, stats).

## Copywriting rules

- Short declaratives. Fragments are fine: "Thinner. Brighter. Faster."
- Use the three-beat pattern for punch words, with the strongest word last.
- Lead with the benefit, then the proof: "Brighter than the sun." then "3,000 nits peak."
- Specific numbers with units beat adjectives. "38 hours" beats "incredible battery".
- Avoid jargon, exclamation marks and the word "revolutionary".
- Titles ≤ 6 words. Supporting lines ≤ 12 words. End card: name, one line, one action.

## Pacing

| Beat | Typical length |
|---|---|
| Hook title | 2.8–3.5 s |
| Punch words (3) | 2.4–3 s total |
| Product reveal | 4–5 s |
| Stat | 2.8–3.5 s |
| Feature tiles (3) | 3.8–4.5 s |
| Split | 3.8–4.5 s |
| Statement (2 lines) | 3.2–4 s |
| End card | 3.2–4 s |

Social cuts (9:16) should be 12–20 s: hook → reveal → stat → end. Put the product on
screen within the first 3 s.

## Story arcs

**Product launch (25–35 s):** title → words → reveal → stat → features → split → statement → end
**Feature spotlight (15–20 s):** title → split → stat → end
**App promo (20–25 s):** title → reveal (device: phone, screen: app screenshot) → features → split → end
**Teaser (8–12 s):** words → reveal (no tagline) → end (date only)
**Event / announcement (15 s):** title → statement → end

## Color recipes (`accent2` → `accent`)

| Mood | accent2 | accent |
|---|---|---|
| Electric (default) | `#b44dff` | `#2f7bff` |
| Sunrise | `#ff5f6d` | `#ffc371` |
| Mint | `#00c6a7` | `#1e9cff` |
| Ember | `#ff3d00` | `#ff9a00` |
| Mono (light theme) | `#1d1d1f` | `#6e6e73` |

Use the brand's own colors when it has them. Keep both stops saturated and distinct in
hue so the gradient shows on short words.

## Music

Pick a track with a clear downbeat around the reveal (about 6–8 s in). Export with
`--audio track.mp3`; the exporter trims it to the video length and fades it out. Only use
music the user has rights to.
