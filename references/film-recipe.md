# Film recipe

## The arc (30–35 s)

| # | Beat | Oto (pop, 120 BPM) | Vela (cinematic, 100 BPM) | Music |
|---|---|---|---|---|
| 1 | Cold open: the problem in one line | 0–4 s, white room. "Every speaker just sits there." It drops, bounces, then refuses to land. | 0–4.8 s, a stripe of light traces the edge. "Every screen has an edge." | Sparse: drone, single bell, riser into the drop |
| 2 | Turn | "Not this one." | Into the lens. "Until now." | Snare roll or heartbeat |
| 3 | The drop | 4–8 s, one word and one color field per beat: Big. Round. Loud. Sound. Off the ground. | 7.2 s, hero reveal: wordmark behind, device opens | Full groove starts, impact hit |
| 4 | The name | 8–12 s, the two speakers become the o's in "oto" | Wordmark + "The first cinema that fits in your palm." | Hook melody |
| 5 | What it does, shown, not told | 12–16 s, a field of spheres ripples with every kick | 12–19 s, wall → cinema, table → studio, ceiling → sky | Groove continues, variations per shot |
| 6 | Inside it | 16–20 s, it splits open; labels draw in with leader lines | 19–24 s, exploded view, parts click into place | Breakdown: filtered, half-time, room to breathe |
| 7 | The number | 20–24 s, "Louder lifts it higher." Volume counter climbs, product rises each beat | 24–26.4 s, three stats on three hits | Build, risers, rising pitch |
| 8 | Lineup | 24–28 s, five colors on five color panels | 26.4–28.8 s, three finishes | Biggest chorus |
| 9 | Silence, then home | 28–30 s, everything stops, it lands | Light turns toward you | Stop. One held chord |
| 10 | End card | 30–34 s, name, tagline, "Coming 2027", fade to white | Name with mark, tagline, fade to black | Final chord rings out |

## Timing rules

- Beat length = 60 / BPM. At 120 BPM: beat 0.5 s, bar 2 s. At 100 BPM: beat 0.6 s, bar 2.4 s.
- Shot boundaries go on bars. Word swaps, color swaps and hops go on beats.
- Captions enter word by word, 0.045 s apart, with a small overshoot (`outBack`), and
  leave in the last 0.12 s of their window.
- Leave 0.3 s of silence before the end card's chord. It sells the ending.

## Reusable shot patterns (with where to find them)

| Pattern | What it is | Source |
|---|---|---|
| Drop and refuse to land | Product falls, damped bounce, then lifts a little | `films/oto/film.js` shot 0–4 |
| Word-per-beat color drop | Background, product color and a giant word swap every beat; slight camera roll alternates | Oto `BEATS` + shot 4–8 |
| Product as letters | Products stand in for letters of the name | Oto shot 8–12 |
| Reactive field | Instanced spheres ride outward waves from each kick | Oto `drawField` |
| Cutaway with labels | Shell halves slide apart, internals visible, SVG leader lines track projected 3D points | Oto shot 16–20, `LABS`, `drawLabs` |
| Counter shot | A huge number counts up per beat while the product reacts | Oto shot 20–24 |
| Lineup on panels | Color panels wipe in with a stagger; products hop in sequence | Oto shot 24–28 |
| Light-trace open | A thin specular highlight travels across a dark object | Vela shot 0 |
| Fly into the lens | Camera dives through concentric rings into white | Vela shot 1 |
| Projected worlds | Beam cone from the device onto a wall, table or ceiling, with shader or canvas content | Vela shots 3–5, `aimBeam`, `drawUI` |
| Exploded view | Parts spread along one axis with labels above and below | Vela shot 6, `drawLabels` |
| Gradient stat | Large number with a warm gradient, short supporting line, device turning beside it | Vela shot 7, `drawStats` |
| Finishes | Three or more copies with different materials, names fade up | Vela shot 8 |

## Modeling products from primitives

- **Round bodies**: `SphereGeometry` with high segment counts (128×96). Use partial spheres for caps and feet.
- **Turned shapes** (pucks, lenses, bottles, watch cases, earbuds): `LatheGeometry` from a 2D profile. `discProfile` in Oto and `ringProfile` in Vela build rounded edges.
- **Slabs** (phones, tablets, laptops): `RoundedBoxGeometry` from `three/addons/geometries/RoundedBoxGeometry.js`; put a screen texture on a plane just in front.
- **Surface detail** comes from canvas textures: Oto's Fibonacci grille (`grille()`) as map + bumpMap, Vela's `canvasTex` for circuit boards and UI.
- **Materials**: `MeshPhysicalMaterial`. Fabric: roughness .6, sheen .25. Anodized or painted: roughness .3–.4, clearcoat .5. Polished metal: metalness 1, roughness .15–.3, and it needs an environment (`RoomEnvironment` in Oto, `makeEnv` light boxes in Vela) or it looks black.
- **Glow** (LED rings, lenses): `emissive` + `emissiveIntensity`; Vela adds `UnrealBloomPass`.
- **Contact shadow**: a ground `ShadowMaterial` plane under a shadow-casting key light.
- Group parts so a shot can animate them: `{ group, ball, base, pose(), setColor() }` in Oto, `makeDevice(finish)` in Vela.

## Music

- Each `music.py` is a small synth: instruments are numpy functions (`kick`, `clap`, `hat`, `bass`, `stab`, `pad`, `bell`, `vox`, `riser`, `impact`), written into buses with `put(bus, t, signal)`, then mixed with sidechain ducking, reverb and delay.
- The arrangement is written as blocks keyed to the shot times. Change the times when the shots change.
- Pop films: four-on-the-floor house, stabs, vocal chops, a bell hook. Cinematic films: pads, plucks, impacts, mechanical clicks, a slower groove.
- Oto writes `env.json` with `kicks` (seconds) and `env` (bass envelope at 60 fps). In the film, `E(t)` reads the envelope to squash the product and brighten LEDs, and `showRings` draws one ring per kick.
- The track must be exactly the film's length, with a fade on the last chord.
