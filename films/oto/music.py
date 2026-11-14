#!/usr/bin/env python3
"""Original house track for the Oto film, 120 BPM in F. Also writes the bass envelope that drives the animation."""
import json
import wave
import os
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR, DUR, FPS = 48000, 34.0, 60
N = int(SR * DUR)
BEAT, BAR, S16 = 0.5, 2.0, 0.125
rng = np.random.default_rng(23)
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)
tarr = lambda d: np.arange(int(d * SR)) / SR
buf = lambda: np.zeros((N, 2))


def put(bus, t, sig, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        bus[i : i + len(sig), 0] += sig * l * gain * 1.414
        bus[i : i + len(sig), 1] += sig * r * gain * 1.414
    else:
        bus[i : i + len(sig)] += sig * gain


def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR / 2.1), "low", fs=SR, output="sos"), x, axis=0)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x, axis=0)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, min(b, SR / 2.1)], "band", fs=SR, output="sos"), x, axis=0)


def saw(f, t, ph=0.0, n=None):
    n = n or int(min(32, 14000 / f))
    return sum(np.sin(2 * np.pi * f * h * t + ph * h) / h for h in range(1, n + 1)) * 0.55


def env(n, a, r):
    e = np.ones(n)
    na, nr = min(int(a * SR), n), min(int(r * SR), n)
    e[:na] = np.linspace(0, 1, na)
    e[n - nr :] *= np.linspace(1, 0, nr)
    return e


# ---- instruments
def kick(g=1.0):
    t = tarr(0.34)
    ph = 2 * np.pi * np.cumsum(50 + 150 * np.exp(-t * 38)) / SR
    s = np.sin(ph) * np.exp(-t * 9) + hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 500) * 0.25
    return np.tanh(s * 1.7) * g


def clap(g=1.0):
    t = tarr(0.26)
    n = bp(rng.standard_normal(len(t)), 1100, 6000)
    e = sum((t >= o) * np.exp(-np.clip(t - o, 0, None) * 190) for o in (0, 0.012, 0.024)) + (t >= 0.03) * np.exp(-np.clip(t - 0.03, 0, None) * 26)
    return n * e * 0.55 * g


def snare(g=1.0):
    t = tarr(0.16)
    return (bp(rng.standard_normal(len(t)), 1400, 8000) * np.exp(-t * 28) + np.sin(2 * np.pi * 210 * t) * np.exp(-t * 40) * 0.5) * 0.5 * g


def hat(d=0.04, g=1.0):
    t = tarr(d)
    return hp(rng.standard_normal(len(t)), 8500) * np.exp(-t * (5 / d)) * 0.34 * g


def bass(m, d):
    t = tarr(d)
    f = mtof(m)
    s = np.sin(2 * np.pi * f * t) * 1.0 + np.sin(2 * np.pi * 2 * f * t) * 0.32
    cut = saw(f, t, n=12)
    bright = lp(cut, 1100) * np.exp(-t * 11) * 0.65
    return np.tanh((s + bright) * 1.15) * env(len(t), 0.004, 0.03)


def stab(notes, d=0.2, cutoff=3400):
    t = tarr(d + 0.05)
    s = np.zeros((len(t), 2))
    for m in notes:
        for dt, pn in ((-0.08, 0), (0.08, 1), (0.0, None)):
            w = saw(mtof(m) * 2 ** (dt / 12), t, rng.uniform(0, 6), n=int(min(16, 7000 / mtof(m))))
            if pn is None:
                s += np.stack([w, w], 1) * 0.5
            else:
                s[:, pn] += w
    e = np.exp(-t * 9) * env(len(t), 0.003, 0.03)
    return lp(s * e[:, None], cutoff) / (len(notes) * 1.7)


def pad(notes, d, cutoff=1500, a=0.4, r=0.8):
    t = tarr(d + r)
    s = np.zeros((len(t), 2))
    for m in notes:
        for dt, pn in ((-0.1, 0), (0.1, 1), (-0.03, 0), (0.03, 1)):
            s[:, pn] += saw(mtof(m) * 2 ** (dt / 12), t, rng.uniform(0, 6), n=int(min(12, 6000 / mtof(m))))
    e = np.minimum(np.minimum(t / a, 1), np.clip((d + r - t) / r, 0, 1))
    return lp(s * e[:, None], cutoff) / (len(notes) * 1.8)


def vox(m, d=0.22, vowel="oh", slide=-0.5):
    """A sung-sounding chop: a saw through vowel formants."""
    t = tarr(d)
    f = mtof(m) * 2 ** (slide * np.exp(-t * 28) / 12)
    ph = np.cumsum(f) / SR
    src = 2 * (ph % 1) - 1 + 0.3 * np.sin(2 * np.pi * ph * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)))
    F = {"oh": ((430, 620), (820, 1080), (2450, 2800)), "ah": ((720, 980), (1120, 1420), (2500, 2900)), "ee": ((260, 380), (2150, 2500), (2850, 3300))}[vowel]
    s = sum(bp(src, a, b) * g for (a, b), g in zip(F, (1, 0.72, 0.22)))
    return s * env(len(t), 0.012, 0.05) * 0.9


def bell(m, d=1.4):
    t = tarr(d)
    f = mtof(m)
    return (np.sin(2 * np.pi * f * t + 1.4 * np.exp(-t * 9) * np.sin(2 * np.pi * f * 3.5 * t)) * np.exp(-t * 4.5) + 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 7)) * env(len(t), 0.002, 0.04) * 0.5


def thump(g=1.0, d=1.0):
    t = tarr(d)
    ph = 2 * np.pi * np.cumsum(38 + 90 * np.exp(-t * 16)) / SR
    return np.tanh((np.sin(ph) * np.exp(-t * 4.2) + lp(rng.standard_normal(len(t)), 700) * np.exp(-t * 28) * 0.8) * 1.5) * g


def riser(d, g=1.0, lo=350, hi=11000, shape=2.2):
    n = int(d * SR)
    x = rng.standard_normal((n, 2))
    pos = np.arange(n) / n
    out = np.zeros((n, 2))
    cs = np.geomspace(lo, hi, 13)
    for i, c in enumerate(cs):
        out += bp(x, c * 0.72, c * 1.38) * np.exp(-((pos * (len(cs) - 1) - i) ** 2))[:, None]
    return out * (pos ** shape)[:, None] * g


def hit(g=1.0):
    t = tarr(0.5)
    return hp(rng.standard_normal(len(t)), 2400) * np.exp(-t * 11) * 0.34 * g


def hum(d, g=1.0):
    t = tarr(d)
    s = np.sin(2 * np.pi * 87.3 * t) * (0.7 + 0.3 * np.sin(2 * np.pi * 3.1 * t)) + 0.2 * np.sin(2 * np.pi * 174.6 * t)
    return s * env(len(t), 0.25, 0.3) * g


def make_ir(sec, dec, cut=6500):
    n = int(sec * SR)
    x = rng.standard_normal((n, 2)) * np.exp(-np.arange(n) / SR * dec)[:, None]
    return lp(x, cut) * np.minimum(np.arange(n) / (0.01 * SR), 1)[:, None]


IR = make_ir(2.4, 2.6)


def verb(x):
    o = np.stack([fftconvolve(x[:, c], IR[:, c])[: len(x)] for c in (0, 1)], 1)
    return hp(o, 180) / np.sqrt(np.sum(IR ** 2))


def delay(x, time=0.375, fb=0.38):
    d = int(time * SR)
    out, tap = x.copy(), x.copy()
    for i in range(1, 6):
        tap = lp(tap, 4800) * fb
        side = i % 2
        sh = np.zeros_like(x)
        sh[d * i :, side] = tap[: -d * i, side] + tap[: -d * i, 1 - side] * 0.3
        out += sh
    return out


# ---- buses
kicks, drums, bassb, chords, lead, fx = buf(), buf(), buf(), buf(), buf(), buf()
duck = np.ones(N)
kick_times = []


def k(t, g=1.0, depth=0.68):
    put(kicks, t, kick(), gain=g)
    kick_times.append(round(float(t), 4))
    i, n = int(t * SR), int(0.24 * SR)
    j = min(i + n, N)
    duck[i:j] = np.minimum(duck[i:j], (1 - depth * (1 - np.linspace(0, 1, n) ** 0.65))[: j - i])


CH = [([53, 57, 60, 64, 67], 29), ([50, 57, 60, 65, 69], 26), ([46, 53, 57, 62, 65], 34), ([48, 55, 58, 62, 65], 36)]
BASS_PAT = [(0, 0, 3), (3, 0, 2), (6, 12, 2), (8, 0, 3), (11, 7, 2), (14, 12, 2)]
STAB_PAT = [2, 6, 9, 12, 14]
HOOK = [(0, 72), (3, 74), (6, 77), (8, 81), (11, 79), (14, 77),
        (16, 81), (19, 77), (22, 74), (24, 72), (27, 74), (30, 77),
        (32, 86), (35, 84), (38, 81), (40, 77), (43, 79), (46, 81),
        (48, 84), (51, 82), (54, 79), (56, 77), (59, 79), (62, 72)]
VOX = [(0, 69, "oh"), (3, 72, "oh"), (6, 69, "ah"), (10, 65, "oh"), (12, 67, "ee"), (14, 69, "ah")]


def bars(start, count, kick_on=True, clap_on=True, hats=True, bass_on=True, stabs=True, voxes=False, hook=False, stab_cut=3400, stab_g=0.55):
    for b in range(count):
        t0 = start + b * BAR
        notes, root = CH[int(round((t0 - 4) / BAR)) % 4]
        if kick_on:
            for i in range(4):
                k(t0 + i * BEAT)
        if clap_on:
            for i in (1, 3):
                put(drums, t0 + i * BEAT, clap(), gain=0.6)
        if hats:
            for i in range(16):
                if i % 4 == 2:
                    put(drums, t0 + i * S16, hat(0.16, 0.75), pan=0.1)
                else:
                    put(drums, t0 + i * S16, hat(0.035, 0.22 + 0.12 * (i % 2 == 0)), pan=0.3 * (-1) ** i)
        if bass_on:
            for s, off, ln in BASS_PAT:
                put(bassb, t0 + s * S16, bass(root + off + 12, ln * S16 * 0.92), gain=0.62)
        if stabs:
            for s in STAB_PAT:
                put(chords, t0 + s * S16, stab(notes, 0.2, stab_cut), gain=stab_g)
        if voxes:
            for s, m, v in VOX:
                put(lead, t0 + s * S16, vox(m + 12, 0.24, v), pan=0.2 * (-1) ** s, gain=0.32)
        if hook:
            idx = int(round((t0 - 4) / BAR)) % 4
            for s, m in HOOK:
                if idx * 16 <= s < (idx + 1) * 16:
                    put(lead, t0 + (s - idx * 16) * S16, bell(m + 12 if m < 86 else m), pan=0.35 * np.sin(s), gain=0.36)


# 0–4  white room: it drops, it floats, it hums
put(bassb, 0.95, hum(3.1, 0.2))
put(bassb, 1.0, thump(0.85))
put(lead, 1.0, bell(84), gain=0.28)
put(lead, 1.25, bell(77), pan=-0.3, gain=0.18)
put(lead, 1.5, bell(81), pan=0.3, gain=0.18)
put(chords, 2.0, pad(CH[3][0], 1.9, 1200, 0.5, 0.15), gain=0.75)
put(fx, 2.5, riser(1.45, 0.34))
roll = [3.0, 3.25, 3.375, 3.5, 3.5625, 3.625, 3.6875, 3.75, 3.8, 3.85, 3.9]
for i, t in enumerate(roll):
    put(drums, t, snare(0.4 + 0.06 * i))

# 4–8  the drop, one word per beat
put(kicks, 4.0, thump(0.95, 1.1))
bars(4, 2, voxes=True, stab_cut=3000)
for i in range(8):
    put(fx, 4 + i * BEAT, hit(1.0 + 0.12 * (i % 4 == 0)), pan=0.3 * (-1) ** i)
put(fx, 7.5, riser(0.5, 0.28, 700))

# 8–16  the hook
put(fx, 8.0, hit(1.3))
bars(8, 2, voxes=False, hook=True, stab_cut=3800)
bars(12, 2, voxes=True, hook=False, stab_cut=4400)
for s in range(4):
    put(lead, 15 + s * 0.25, vox(77 + s * 2, 0.2, "ah"), pan=0.3 * (-1) ** s, gain=0.3)

# 16–20  look inside: filtered, half-time, room to breathe
put(kicks, 16.0, thump(0.7))
for t in np.arange(16, 20, 1.0):
    k(t, 0.8, 0.45)
bars(16, 2, kick_on=False, clap_on=False, hats=False, bass_on=False, stabs=True, stab_cut=1100, stab_g=0.72)
for t in np.arange(16.0, 20.0, 0.25):
    put(drums, t + 0.125, hat(0.03, 0.26))
for t, m in zip(np.arange(16, 20, 0.5), [41, 41, 38, 38, 46, 46, 48, 48]):
    put(bassb, t, bass(m, 0.42), gain=0.55)
for i in range(7):
    put(lead, 17.0 + i * 0.25, bell(72 + [0, 2, 5, 7, 9, 12, 14][i]), pan=0.5 * np.sin(i * 2), gain=0.2)

# 20–24  louder lifts higher: everything climbs, then a breath
for i in range(8):
    k(20 + i * BEAT, 0.7 + i * 0.035, 0.55)
for i, t in enumerate(np.arange(20, 23.5, 0.25)):
    put(bassb, t, bass(41 + int(i / 2), 0.21), gain=0.56)
    put(chords, t, stab([60 + i // 2, 65 + i // 2, 69 + i // 2], 0.12, 1000 + i * 340), gain=0.42 + i * 0.012)
snares = list(np.arange(20, 22, 0.5)) + list(np.arange(22, 23, 0.25)) + list(np.arange(23, 23.5, 0.125))
for i, t in enumerate(snares):
    put(drums, t, snare(0.32 + i * 0.03))
for i in range(8):
    put(lead, 20 + i * BEAT, vox(69 + i, 0.3, "ah", -1.0), gain=0.2 + i * 0.016, pan=0.25 * (-1) ** i)
put(fx, 20.0, riser(3.5, 0.5, 200, 12000, 2.8))
t_ = tarr(3.5)
put(fx, 20.0, np.sin(2 * np.pi * np.cumsum(120 * 2 ** (t_ / 3.5 * 3)) / SR) * (t_ / 3.5) ** 2.6 * 0.16)

# 24–28  the big chorus
put(kicks, 24.0, thump(1.0, 1.1))
put(fx, 24.0, hit(1.6))
bars(24, 2, voxes=True, hook=True, stab_cut=5200, stab_g=0.6)
for i, m in enumerate([72, 74, 77, 79, 81, 84, 86, 89]):
    put(lead, 27 + i * S16, bell(m + 12), pan=0.5 * (-1) ** i, gain=0.2)

# 28–32  everything stops; it lands on the note
put(chords, 28.0, pad(CH[3][0], 1.9, 1300, 0.03, 0.4), gain=0.72)
put(lead, 28.0, bell(84), gain=0.3)
put(bassb, 28.0, hum(1.9, 0.18))
put(kicks, 30.0, thump(1.0, 1.4))
put(drums, 30.0, clap(), gain=0.5)
put(chords, 30.0, pad([41, 53, 60, 65, 69, 72, 76], 2.2, 3400, 0.01, 1.5), gain=1.15)
for dt, m, g in [(0, 84, .42), (0, 89, .3), (.25, 93, .26), (.5, 96, .22)]:
    put(lead, 30 + dt, bell(m, 1.7), pan=(dt - .25), gain=g)

# ---- mix
ch_d = chords * duck[:, None]
bs_d = bassb * (0.55 + 0.45 * duck)[:, None]
ld = delay(lead, 0.375, 0.34)
wet = verb(ch_d * 0.2 + ld * 0.4 + fx * 0.2 + drums * 0.05) * 0.42
mix = kicks * 0.9 + drums * 0.68 + bs_d * 0.78 + ch_d * 0.72 + ld * 0.75 + fx * 0.72 + wet
mix = hp(mix, 28)
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.8) / np.tanh(1.8)
fade = 1 - np.clip((np.arange(N) / SR - 33.0) / 0.95, 0, 1) ** 1.5
mix = mix * fade[:, None]
mix = mix / np.max(np.abs(mix)) * 0.94
with wave.open(os.path.join(HERE, "out", "score.wav"), "wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
    f.writeframes((mix * 32767).astype("<i2").tobytes())

# ---- envelope for the picture: low end, frame by frame
low = lp((kicks + bassb * 0.35).mean(axis=1), 180)
hop = SR // FPS
rms = np.array([np.sqrt(np.mean(low[i : i + hop] ** 2)) for i in range(0, N - hop + 1, hop)])
rms = rms / np.percentile(rms, 99.5)
e, out = 0.0, []
for v in rms:
    e = max(float(min(v, 1)), e * np.exp(-1 / (FPS * 0.13)))
    out.append(round(e, 3))
json.dump({"fps": FPS, "env": out, "kicks": sorted(x for x in set(kick_times))}, open(os.path.join(HERE, "env.json"), "w"))
print("score ok, kicks:", len(set(kick_times)), "rms", float(np.sqrt(np.mean(mix ** 2))))
