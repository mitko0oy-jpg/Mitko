"""Sound effects for the trainer, made in code (no samples, no licences): bells, marimba, pops, sparkles, a whoosh and a stamp.
Usage: python3 -I tools/nvo-trener/sfx.py [fanfare.mp3]
Writes public/media/sfx/<name>.mp3 (mono, 64 kbit/s). The optional fanfare (generated elsewhere) is cleaned up and saved as fanfare.mp3.
Needs numpy and ffmpeg."""
import os, subprocess, sys, tempfile, wave
import numpy as np

SR = 44100
here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.join(here, "..", "..", "public", "media", "sfx")
os.makedirs(out_dir, exist_ok=True)
rng = np.random.default_rng(7)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack=0.004, decay=0.25):
    x = np.arange(n) / SR
    a = np.clip(x / attack, 0, 1)
    return a * np.exp(-x / decay)


def bell(f, sec=0.9, decay=0.35, bright=1.0):
    """A soft glockenspiel-like bell: fundamental plus a few inharmonic partials that fade faster."""
    x = t(sec)
    s = np.sin(2 * np.pi * f * x) * env(len(x), 0.002, decay)
    for ratio, amp, d in ((2.0, 0.35, 0.5), (3.01, 0.18 * bright, 0.3), (4.17, 0.10 * bright, 0.2), (5.43, 0.05 * bright, 0.12)):
        s += amp * np.sin(2 * np.pi * f * ratio * x) * env(len(x), 0.001, decay * d)
    return s


def marimba(f, sec=0.5, decay=0.12):
    x = t(sec)
    s = np.sin(2 * np.pi * f * x) * env(len(x), 0.003, decay)
    s += 0.25 * np.sin(2 * np.pi * f * 4 * x) * env(len(x), 0.001, decay * 0.25)
    s += 0.08 * np.sin(2 * np.pi * f * 9.9 * x) * env(len(x), 0.001, decay * 0.1)
    return s


def pop(f0=420, f1=980, sec=0.09):
    x = t(sec)
    k = np.clip(x / 0.045, 0, 1)
    phase = 2 * np.pi * np.cumsum(f0 + (f1 - f0) * k) / SR
    return np.sin(phase) * env(len(x), 0.002, 0.03)


def sparkle(n=5, sec=0.6, lo=2600, hi=5200, spread=0.35):
    out = np.zeros(int(SR * sec))
    for _ in range(n):
        st = int(rng.uniform(0, spread) * SR)
        g = bell(rng.uniform(lo, hi), 0.25, 0.05, 0.4) * rng.uniform(0.25, 0.5)
        out[st:st + len(g)] += g[: len(out) - st]
    return out


def noise(sec):
    return rng.standard_normal(int(SR * sec))


def bandsweep(sec=0.35, f0=300, f1=3200):
    """A whoosh: noise through a moving band-pass (done in short FFT blocks)."""
    n = noise(sec)
    out = np.zeros_like(n)
    blk = 1024
    for i in range(0, len(n), blk // 2):
        seg = n[i:i + blk]
        if len(seg) < blk:
            seg = np.pad(seg, (0, blk - len(seg)))
        spec = np.fft.rfft(seg * np.hanning(blk))
        fr = np.fft.rfftfreq(blk, 1 / SR)
        c = f0 * (f1 / f0) ** (i / len(n))
        spec *= np.exp(-((np.log(fr + 1) - np.log(c)) ** 2) / 0.18)
        y = np.fft.irfft(spec)
        out[i:i + blk] += y[: len(out) - i]
    x = np.arange(len(out)) / len(out)
    return out * np.sin(np.pi * x) ** 1.5


def lowpass(x, cutoff):
    spec = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 / (1 + (fr / cutoff) ** 4)
    return np.fft.irfft(spec, len(x))


def reverb(x, mix=0.18, sec=0.7):
    ir = noise(sec) * np.exp(-np.arange(int(SR * sec)) / (SR * sec / 5))
    ir = lowpass(ir, 5000)
    wet = np.convolve(x, ir)[: len(x) + len(ir)]
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = np.pad(x, (0, len(wet) - len(x)))
    return dry + mix * wet * np.max(np.abs(x))


def at(parts, sec):
    out = np.zeros(int(SR * sec))
    for start, s, gain in parts:
        s = s.copy()
        f = min(len(s), int(SR * 0.03))
        s[-f:] *= np.linspace(1, 0, f)  # no click where a part ends
        i = int(start * SR)
        out[i:i + len(s)] += gain * s[: len(out) - i]
    return out


def finish(x, peak_db=-3.0, tail=0.04):
    x = x - np.mean(x)
    # trim silence at the end, fade the last bit
    lim = np.max(np.abs(x)) * 10 ** (-60 / 20)
    idx = np.where(np.abs(x) > lim)[0]
    x = x[: (idx[-1] + int(SR * tail)) if len(idx) else len(x)]
    f = int(SR * 0.02)
    x[-f:] *= np.linspace(1, 0, f)
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)


def save(name, x, peak_db=-3.0):
    x = finish(x, peak_db)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fh:
        tmp = fh.name
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    path = os.path.join(out_dir, name + ".mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-ac", "1", "-b:a", "64k", path], check=True)
    os.remove(tmp)
    print(name, f"{len(x) / SR:.2f}s", f"{os.path.getsize(path) // 1024} KB")


E6, B6, G4, D4 = 1318.5, 1975.5, 392.0, 293.7
C5, E5, G5, C6, E6_, G6, C7 = 523.3, 659.3, 784.0, 1046.5, 1318.5, 1568.0, 2093.0

# right answer: two bright bells going up, a few sparkles
save("right", reverb(at([(0, bell(E6, 0.6, 0.18), 0.8), (0.085, bell(B6, 0.8, 0.25), 0.9), (0.1, sparkle(4, 0.6), 0.5)], 1.0), 0.15))
# wrong answer: two soft marimba notes going down – calm, never a buzzer
save("wrong", reverb(at([(0, marimba(G4, 0.45), 0.9), (0.13, marimba(D4, 0.55, 0.16), 0.9)], 0.8), 0.12), -6.0)
# tap / choose: a small bubble pop
save("tap", at([(0, pop(380, 900, 0.08), 1.0)], 0.12), -8.0)
# a word found in the grid: pop plus sparkle
save("found", reverb(at([(0, pop(500, 1300, 0.09), 1.0), (0.05, sparkle(5, 0.5, 3000, 6000, 0.2), 0.6)], 0.7), 0.15), -4.0)
# module finished well: a bell arpeggio up to a chord with shimmer
arp = [(i * 0.09, bell(f, 1.4, 0.45), 0.7) for i, f in enumerate((C5, E5, G5, C6))]
arp += [(0.36, bell(E6_, 1.4, 0.5), 0.45), (0.36, bell(G6, 1.4, 0.5), 0.35), (0.3, sparkle(8, 1.2, 3000, 6500, 0.7), 0.5)]
save("win", reverb(at(arp, 1.9), 0.22))
# level up: a fast run over two octaves and a whoosh up
run = [(i * 0.045, bell(f, 0.9, 0.25, 0.7), 0.55) for i, f in enumerate((C5, E5, G5, C6, E6_, G6, C7))]
run += [(0, bandsweep(0.4, 400, 5000), 0.25), (0.33, bell(C7, 1.2, 0.5), 0.6), (0.33, sparkle(10, 1.0, 3500, 7000, 0.6), 0.5)]
save("levelup", reverb(at(run, 1.6), 0.22))
# badge / coin: two quick high notes
save("badge", reverb(at([(0, bell(987.8, 0.4, 0.07, 1.3), 0.7), (0.075, bell(1318.5, 0.9, 0.3, 1.3), 0.9), (0.1, sparkle(5, 0.7), 0.5)], 1.0), 0.15))
# hero unlocked: card flip whoosh, then a glittering chord
rev = [(0, bandsweep(0.32, 250, 3500), 0.6)] + [(0.28 + i * 0.03, bell(f, 1.6, 0.6, 0.8), 0.45) for i, f in enumerate((C6, E6_, G6, C7))]
rev += [(0.3, sparkle(12, 1.3, 3000, 7500, 0.9), 0.55)]
save("reveal", reverb(at(rev, 2.0), 0.25))
# dossier solved: a rubber stamp on paper
x = t(0.25)
thump = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-x / 0.05) + 48) / SR) * env(len(x), 0.002, 0.07)
slap = lowpass(noise(0.25), 1800) * env(len(x), 0.001, 0.02)
paper = lowpass(noise(0.18), 6000) * env(int(SR * 0.18), 0.01, 0.05)
save("stamp", at([(0, thump, 1.0), (0, slap, 0.35), (0.06, paper, 0.08)], 0.4), -2.0)

# the fanfare made with an audio model (optional): trimmed, levelled, faded
if len(sys.argv) > 1:
    path = os.path.join(out_dir, "fanfare.mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", sys.argv[1], "-af",
                    "silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-2:LRA=7,afade=t=out:st=2.3:d=0.6",
                    "-ac", "1", "-b:a", "64k", path], check=True)
    print("fanfare", f"{os.path.getsize(path) // 1024} KB")
