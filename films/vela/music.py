#!/usr/bin/env python3
"""Original score for the Vela film. 100 BPM; every cut in the picture lands on this grid."""
import wave
import os
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 35.0
N = int(SR * DUR)
BEAT = 0.6
BAR = 2.4
rng = np.random.default_rng(14)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def buf():
    return np.zeros((N, 2))


def put(bus, t, sig, pan=0.0, gain=1.0):
    """Mix a mono or stereo signal into a bus at time t."""
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


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2.1), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, a, b, order=2):
    return sosfilt(butter(order, [a, min(b, SR / 2.1)], "band", fs=SR, output="sos"), x, axis=0)


def tarr(d):
    return np.arange(int(d * SR)) / SR


def adsr(n, a, d, s, r):
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    ns = max(n - na - nd - nr, 0)
    e = np.concatenate([np.linspace(0, 1, na, False), np.linspace(1, s, nd, False), np.full(ns, s), np.linspace(s, 0, nr)])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def saw(f, t, phase=0.0, harmonics=None):
    """Band-limited saw built additively."""
    n = harmonics or int(min(40, 15000 / f))
    out = np.zeros_like(t)
    for h in range(1, n + 1):
        out += np.sin(2 * np.pi * f * h * t + phase * h) / h
    return out * 0.55


# --------------------------------------------------------------- instruments
def pad(notes, dur, cutoff=1700, a=0.5, r=1.2, width=0.9):
    t = tarr(dur + r)
    L, R = np.zeros_like(t), np.zeros_like(t)
    for m in notes:
        f = mtof(m)
        for dt, pan in [(-0.09, -1), (0.09, 1), (-0.035, -0.4), (0.035, 0.4), (0.0, 0)]:
            s = saw(f * 2 ** (dt / 12), t, rng.uniform(0, 6.28), harmonics=int(min(14, 7000 / f)))
            L += s * (1 - pan * width) * 0.5
            R += s * (1 + pan * width) * 0.5
    e = adsr(len(t), a, 0.3, 0.85, r)
    st = np.stack([L * e, R * e], 1) / (len(notes) * 2.2)
    return lp(st, cutoff)


def pluck(m, d=0.55, bright=2.2, level=1.0):
    t = tarr(d)
    f = mtof(m)
    idx = bright * np.exp(-t * 15)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 2.0 * t))
    s += 0.28 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 11)
    return s * np.exp(-t * 7.5) * adsr(len(t), 0.002, 0.0, 1, 0.03) * level


def chime(m, d=3.2):
    t = tarr(d)
    f = mtof(m)
    s = np.zeros_like(t)
    for ratio, amp, dec in [(1, 1, 1.5), (2.0, .55, 2.2), (2.76, .3, 3.2), (5.4, .13, 5.5), (8.93, .05, 8)]:
        s += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return s * adsr(len(t), 0.002, 0, 1, 0.1) * 0.5


def bass(m, d, cutoff=520):
    t = tarr(d)
    f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.5 * saw(f, t, harmonics=9)
    env = adsr(len(t), 0.004, 0.08, 0.72, 0.05)
    return lp(s * env, cutoff) * 0.8


def kick(gain=1.0):
    t = tarr(0.42)
    ph = 2 * np.pi * np.cumsum(46 + 120 * np.exp(-t * 34)) / SR
    s = np.sin(ph) * np.exp(-t * 8.5)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 420) * 0.22
    return np.tanh((s + click) * 1.5) * gain


def hat(d=0.05, gain=1.0):
    t = tarr(d)
    return hp(rng.standard_normal(len(t)), 8000) * np.exp(-t * (5 / d)) * 0.3 * gain


def clap(gain=1.0):
    t = tarr(0.32)
    n = bp(rng.standard_normal(len(t)), 1000, 5200)
    env = np.zeros_like(t)
    for o in [0, 0.011, 0.023]:
        env += (t >= o) * np.exp(-np.clip(t - o, 0, None) * 170)
    env += (t >= 0.031) * np.exp(-np.clip(t - 0.031, 0, None) * 22)
    return n * env * 0.5 * gain


def tick(gain=1.0, f=3400):
    t = tarr(0.05)
    return (np.sin(2 * np.pi * f * t) * 0.6 + hp(rng.standard_normal(len(t)), 5000) * 0.3) * np.exp(-t * 170) * gain


def impact(gain=1.0, d=3.8):
    t = tarr(d)
    ph = 2 * np.pi * np.cumsum(30 + 62 * np.exp(-t * 7)) / SR
    sub = np.sin(ph) * np.exp(-t * 1.25)
    body = lp(rng.standard_normal(len(t)), 900) * np.exp(-t * 7) * 0.8
    air = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 4.4) * 0.16
    return np.tanh((sub * 1.3 + body + air) * 1.25) * gain


def riser(d, gain=1.0, lo=250, hi=9000, shape=2.2):
    """Noise sweep made from a crossfaded band-pass bank."""
    n = int(d * SR)
    x = rng.standard_normal((n, 2))
    pos = (np.arange(n) / n) ** 0.9
    cents = np.geomspace(lo, hi, 15)
    out = np.zeros((n, 2))
    for i, c in enumerate(cents):
        b = bp(x, c * 0.72, c * 1.38)
        w = np.exp(-((pos * (len(cents) - 1) - i) ** 2) / 1.0)
        out += b * w[:, None]
    env = (np.arange(n) / n) ** shape
    return out * env[:, None] * gain


def whoosh(d=1.1, gain=1.0):
    n = int(d * SR)
    x = riser(d, 1.0, 300, 5500, 1.0)
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    return x * env[:, None] * gain


def mech_click(gain=1.0):
    t = tarr(0.14)
    s = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * dc) for f, a, dc in [(2840, .5, 60), (4610, .35, 85), (7130, .22, 120), (1240, .35, 40)])
    n = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 200) * 0.35
    return (s + n) * gain


def projector_on(col=1.0, gain=1.0):
    """The rising 'light turns on' tone used on each surface cut."""
    t = tarr(1.3)
    f = 700 * col + 1200 * col * (1 - np.exp(-t * 16))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.8)
    return s * adsr(len(t), 0.005, 0, 1, 0.1) * 0.3 * gain


# --------------------------------------------------------------- reverb / delay
def make_ir(sec, decay, cutoff=6200):
    n = int(sec * SR)
    x = rng.standard_normal((n, 2))
    env = np.exp(-np.arange(n) / SR * decay)
    return lp(x * env[:, None], cutoff) * np.minimum(np.arange(n) / (0.012 * SR), 1)[:, None]


IR_HALL = make_ir(4.6, 1.5)
IR_PLATE = make_ir(1.8, 3.4, 7500)


def verb(x, ir):
    out = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in (0, 1)], 1)
    return hp(out, 120) / np.sqrt(np.sum(ir ** 2))


def pingpong(x, time=0.45, fb=0.42, cut=4500):
    d = int(time * SR)
    out = x.copy()
    tap = x.copy()
    for i in range(1, 7):
        tap = lp(tap, cut) * fb
        side = 1 if i % 2 else 0
        sh = np.zeros_like(x)
        sh[d * i :, side] = tap[: -d * i, side] + tap[: -d * i, 1 - side] * 0.25
        out += sh
    return out


# --------------------------------------------------------------- the arrangement
drums, sub_bus, pads, plucks, fx, sparkle = buf(), buf(), buf(), buf(), buf(), buf()
duck = np.ones(N)  # sidechain envelope


def duck_at(t, depth=0.72, rel=0.26):
    i = int(t * SR)
    n = int(rel * SR)
    e = 1 - depth * (1 - np.linspace(0, 1, n) ** 0.7)
    j = min(i + n, N)
    duck[i:j] = np.minimum(duck[i:j], e[: j - i])


DM9 = [50, 57, 60, 64, 65]
BB = [46, 53, 57, 60, 62]
F = [41, 57, 60, 65, 67]
C = [48, 55, 60, 64, 67]
GM = [43, 58, 62, 65, 69]
D_MAJ = [50, 57, 62, 66, 69, 76]
PROG = [(BB, 34), (F, 29), (DM9, 38), (C, 36)]  # chord, bass note
ARP = {id(BB): [70, 74, 77, 81, 77, 74, 72, 69], id(F): [65, 69, 72, 77, 79, 77, 72, 69],
       id(DM9): [69, 72, 74, 77, 81, 77, 76, 72], id(C): [67, 72, 76, 79, 84, 79, 76, 74]}

# ---- 0 – 4.8  dark: drone, one travelling light
put(pads, 0.0, pad([38, 45, 50], 4.9, cutoff=420, a=2.2, r=1.0, width=0.5), gain=1.5)
put(fx, 0.2, whoosh(3.7, 0.11), gain=1.0)
put(sparkle, 0.55, chime(86, 3.0), pan=-0.3, gain=0.2)
put(sparkle, 1.25, chime(93, 3.0), pan=0.35, gain=0.14)
put(sparkle, 3.0, chime(88, 3.0), pan=0.1, gain=0.13)

# ---- 4.8 – 7.2  "Until now."  a heartbeat, everything rising
for i in range(16):
    t = 4.8 + i * 0.15
    amp = 0.26 + 0.74 * (i / 16)
    put(sub_bus, t, bass(26 if i < 16 else 38, 0.13, cutoff=240 + 110 * i), gain=0.72 * amp)
    if i % 2 == 0:
        put(plucks, t, pluck(62 + [0, 7, 12, 3][(i // 2) % 4] + (12 if i > 8 else 0), 0.42, 1.4), pan=0.45 * np.sin(i), gain=0.13 + 0.17 * i / 16)
put(drums, 4.8, kick(1.0), gain=0.9)
put(pads, 4.8, pad(DM9, 2.4, cutoff=1500, a=2.0, r=0.1), gain=0.75)
put(fx, 4.8, riser(2.4, 0.32, 200, 11000, 2.6))
rt = tarr(2.4)
put(fx, 4.8, np.sin(2 * np.pi * np.cumsum(90 * 2 ** (rt / 2.4 * 2.6)) / SR) * (rt / 2.4) ** 2.6 * 0.22)

# ---- 7.2  IMPACT: reveal
put(sub_bus, 7.2, impact(1.0), gain=0.95)
put(drums, 7.2, kick(1.0), gain=1.0)
put(pads, 7.2, pad(DM9 + [74, 76], 2.5, cutoff=4200, a=0.012, r=2.2), gain=1.7)
put(sparkle, 7.2, chime(81, 3.2), pan=-0.2, gain=0.36)
put(sparkle, 7.2, chime(88, 3.2), pan=0.3, gain=0.26)
# stillness, then the mechanism
for i, m in enumerate([69, 72, 76, 81]):
    put(plucks, 8.4 + i * 0.3, pluck(m, 0.8, 1.5), pan=(-.5, .5, -.25, .25)[i], gain=0.2)
put(pads, 9.6, pad(BB, 2.4, cutoff=2400, a=0.45, r=1.3), gain=1.4)
put(fx, 9.6, whoosh(1.2, 0.2))
put(fx, 10.72, mech_click(0.75))
put(sparkle, 10.75, chime(93, 3.0), pan=0.0, gain=0.3)
put(sparkle, 10.9, chime(100, 3.0), pan=0.3, gain=0.13)
put(drums, 10.8, kick(0.8), gain=0.6)
for i in range(4):
    put(plucks, 10.8 + i * 0.15, pluck(70 + [0, 7, 12, 14][i], 0.5, 1.7), pan=(-.4, .4, -.2, .2)[i], gain=0.2)
put(fx, 11.3, riser(0.7, 0.16, 800, 9000, 2.0))


def groove(t0, chord, bassnote, drums_on=True, arp_gain=0.22, hats=True, cutoff=3000, claps=True, pad_gain=1.05):
    """One bar of the main groove."""
    put(pads, t0, pad(chord, BAR - 0.05, cutoff=cutoff, a=0.03, r=0.5), gain=pad_gain)
    for b in range(8):
        t = t0 + b * 0.3
        note = bassnote + (12 if b in (3, 6) else 0)
        put(sub_bus, t, bass(note, 0.26), gain=0.68)
    arp = ARP[id(chord)]
    for i in range(16):
        t = t0 + i * 0.15
        m = arp[i % 8] + (12 if i % 16 >= 12 else 0)
        put(plucks, t, pluck(m, 0.5, 1.2 + (i % 4 == 0) * 1.2), pan=0.55 * np.sin(i * 1.7), gain=arp_gain * (1.0 if i % 4 == 0 else 0.68))
    if drums_on:
        for b in range(4):
            put(drums, t0 + b * BEAT, kick(1.0), gain=0.88)
            duck_at(t0 + b * BEAT)
            if claps and b in (1, 3):
                put(drums, t0 + b * BEAT, clap(), gain=0.5)
    if hats:
        for i in range(16):
            g = 0.55 if i % 4 == 2 else 0.26 if i % 2 == 0 else 0.15
            put(drums, t0 + i * 0.15, hat(0.12 if i % 4 == 2 else 0.04, g), pan=0.2 * (-1) ** i)


# ---- 12 – 19.2  the three surfaces
for k, (ch, bn) in enumerate(PROG[:3]):
    t0 = 12.0 + k * BAR
    groove(t0, ch, bn, cutoff=2200 + k * 700)
    put(fx, t0, projector_on(1 + k * 0.25, 0.75), pan=[-.2, 0, .2][k])
    put(sparkle, t0 + 0.02, chime(81 + [0, 5, 12][k], 2.4), pan=[-.3, .3, 0][k], gain=0.26)
    put(sub_bus, t0, impact(0.42, 1.0))
put(fx, 18.6, riser(0.6, 0.2, 500, 10000, 2.2))

# ---- 19.2 – 24  exploded view: space opens, parts click into place
put(pads, 19.2, pad(C, BAR, cutoff=2600, a=0.08, r=0.8), gain=1.1)
put(pads, 21.6, pad(BB, BAR, cutoff=2900, a=0.25, r=0.8), gain=1.15)
put(sub_bus, 19.2, impact(0.5, 1.6))
put(drums, 19.2, kick(), gain=0.9)
put(fx, 19.5, whoosh(1.5, 0.16))
for t, f, p in zip([19.68, 19.84, 20.0, 20.16, 20.32, 20.48, 20.64], [2400, 2700, 3000, 3300, 3600, 4000, 4400], np.linspace(.6, -.6, 7)):
    put(fx, t, tick(0.42, f), pan=p)
for k, ch in [(0, C), (1, BB)]:
    arp = ARP[id(ch)]
    t0 = 19.2 + k * BAR
    bn = 36 if k == 0 else 34
    for i in range(16):
        put(plucks, t0 + i * 0.15, pluck(arp[i % 8] + 12 * (i % 8 > 5), 0.55, 1.1), pan=0.7 * np.sin(i * 1.3), gain=0.16 + 0.06 * (i % 4 == 0))
    for b in range(4):
        put(sub_bus, t0 + b * BEAT, bass(bn, 0.5, 340), gain=0.62)
        put(drums, t0 + b * BEAT, kick(0.8), gain=0.45)
        duck_at(t0 + b * BEAT, 0.45)
    for i in range(8):
        put(drums, t0 + 0.3 * i + 0.15, hat(0.05, 0.28))
# soft label ticks
for t in [20.8, 20.95, 21.1, 21.25, 21.4, 21.55, 21.7]:
    put(sparkle, t, tick(0.22, 5200), pan=rng.uniform(-.5, .5))
put(fx, 23.3, riser(0.7, 0.32, 300, 12000, 2.3))

# ---- 24 – 26.4  three stats, three hits (dotted hemiola across the bar)
for k, (t, ch, bn) in enumerate([(24.0, DM9, 38), (24.8, BB, 34), (25.6, GM, 31)]):
    put(pads, t, pad(ch, 0.72, cutoff=4600, a=0.008, r=0.32), gain=1.7)
    put(drums, t, kick(), gain=1.0)
    put(drums, t, clap(), gain=0.5)
    put(sub_bus, t, bass(bn, 0.7, 300), gain=0.8)
    put(sparkle, t, chime(86 + [0, 2, 5][k], 1.6), pan=[-.4, .4, 0][k], gain=0.3)
    duck_at(t, 0.5, 0.2)
put(fx, 25.8, riser(0.6, 0.24, 700, 11000, 2.0))

# ---- 26.4 – 28.8  finishes: full groove
groove(26.4, F, 29, cutoff=3800, arp_gain=0.24, pad_gain=1.15)
put(sub_bus, 26.4, impact(0.45, 1.0))
for k in range(3):
    put(fx, 26.45 + k * 0.09, whoosh(0.55, 0.1), gain=1)
    put(sparkle, 27.4 + k * 0.1, chime(84 + [0, 4, 7][k], 2.0), pan=[-.5, 0, .5][k], gain=0.2)

# ---- 28.8 – 31.2  everything falls away; the light rises
put(pads, 28.8, pad(C + [74], 2.4, cutoff=2200, a=0.08, r=0.12), gain=1.1)
put(sparkle, 28.8, chime(84, 2.5), pan=0, gain=0.3)
for i, m in enumerate([76, 79, 84, 86, 88, 91, 96, 100]):
    put(plucks, 29.1 + i * 0.3, pluck(m, 0.7, 1.2), pan=0.5 * (-1) ** i, gain=0.09 + i * 0.017)
put(fx, 29.6, riser(1.6, 0.42, 250, 13000, 3.0))
rt = tarr(1.6)
put(fx, 29.6, np.sin(2 * np.pi * np.cumsum(110 * 2 ** (rt / 1.6 * 3)) / SR) * (rt / 1.6) ** 3 * 0.2)

# ---- 31.2  home: D major, for the first time in the film
put(sub_bus, 31.2, impact(0.8, 3.6), gain=0.9)
put(drums, 31.2, kick(), gain=0.8)
put(pads, 31.2, pad(D_MAJ, 1.9, cutoff=3400, a=0.015, r=2.1), gain=1.75)
for m, g, p, dt in [(86, .4, 0, 0), (90, .26, -.35, .0), (93, .3, .35, .0), (98, .2, -.15, .55), (102, .13, .2, .95)]:
    put(sparkle, 31.2 + dt, chime(m, 3.6), pan=p, gain=g)


# --------------------------------------------------------------- mixdown
pads_d = pads * duck[:, None]
sub_d = sub_bus * (0.45 + 0.55 * duck)[:, None]
pl = pingpong(plucks * 0.9, 0.45, 0.34)
wet = verb(pads_d * 0.3 + pl * 0.5 + sparkle * 1.0 + fx * 0.3, IR_HALL) * 0.5 + verb(drums * 0.1, IR_PLATE) * 0.3
mix = pads_d * 0.72 + sub_d * 0.92 + pl * 0.8 + sparkle * 0.8 + fx * 0.82 + drums * 0.82 + wet
mix = hp(mix, 26, 2)
# gentle "air" tilt
mix = mix + hp(mix, 7000, 1) * 0.12
# bus glue + limiter
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.45) / np.tanh(1.45)
# end the piece cleanly with the picture
fade = 1 - np.clip((np.arange(N) / SR - 33.4) / 1.5, 0, 1) ** 1.6
mix = mix * fade[:, None]
mix[: int(.01 * SR)] *= np.linspace(0, 1, int(.01 * SR))[:, None]
mix = mix / np.max(np.abs(mix)) * 0.94

with wave.open(os.path.join(HERE, "out", "score.wav"), "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767).astype("<i2").tobytes())
print("score written", np.sqrt(np.mean(mix ** 2)))
