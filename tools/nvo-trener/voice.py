"""Erčo's voice lines for the trainer -> public/media/voice/<line>-<version>.mp3.
The greetings (hello, back, math) start with a short bell chime; every line has its silence trimmed and its loudness
levelled to the other sounds, mono 64 kbit/s. The lines were made with a text-to-speech voice (ElevenLabs v4 through Higgsfield);
the words are in trener.js (Hello.LINES). A new voice gets a new version number, because browsers keep /media/ 30 days.
Usage: python3 -I tools/nvo-trener/voice.py <version> hello=<mp3> back=<mp3> math=<mp3> ok-0=<mp3> ...
       python3 -I tools/nvo-trener/voice.py <version> --dir <folder with <line>.mp3 files>
Needs numpy and ffmpeg."""
import os, subprocess, sys, tempfile, wave
import numpy as np

SR = 44100
here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.join(here, "..", "..", "public", "media", "voice")
os.makedirs(out_dir, exist_ok=True)
version = sys.argv[1]


def bell(f, sec=0.8, decay=0.3):
    x = np.arange(int(SR * sec)) / SR
    env = lambda d: np.clip(x / 0.002, 0, 1) * np.exp(-x / d)
    s = np.sin(2 * np.pi * f * x) * env(decay)
    for ratio, amp, d in ((2.0, 0.35, 0.5), (3.01, 0.16, 0.3), (4.17, 0.08, 0.2)):
        s += amp * np.sin(2 * np.pi * f * ratio * x) * env(decay * d)
    return s


# the chime: three quick bells going up (G5, C6, E6), like a door bell in a cartoon
chime = np.zeros(int(SR * 0.9))
for i, f in enumerate((784.0, 1046.5, 1318.5)):
    b = bell(f, 0.8, 0.22 if i < 2 else 0.35) * (0.6 if i < 2 else 0.8)
    st = int(i * 0.11 * SR)
    chime[st:st + len(b)] += b[: len(chime) - st]
chime = chime / np.max(np.abs(chime)) * 10 ** (-9 / 20)  # softer than the voice
f = int(SR * 0.05)
chime[-f:] *= np.linspace(1, 0, f)

tmp = tempfile.mkdtemp()
chime_wav = os.path.join(tmp, "chime.wav")
with wave.open(chime_wav, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((chime * 32767).astype(np.int16).tobytes())

GREET = {"hello", "back", "math"}
specs = sys.argv[2:]
if specs[:1] == ["--dir"]:
    specs = [f"{f[:-4]}={os.path.join(specs[1], f)}" for f in sorted(os.listdir(specs[1])) if f.endswith(".mp3")]
for spec in specs:
    line, src = spec.split("=", 1)
    voice_wav = os.path.join(tmp, f"{line}.wav")
    # trim the silence at both ends, but gently: soft first sounds (х, н, в) stay – keep 0.1 s before the first sound
    # and 0.15 s after the last; then level the loudness
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af",
                    "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.1,areverse,"
                    "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.15,areverse,"
                    "loudnorm=I=-16:TP=-2:LRA=9,afade=t=in:d=0.005",
                    "-ac", "1", "-ar", str(SR), voice_wav], check=True)
    path = os.path.join(out_dir, f"{line}-{version}.mp3")
    if line in GREET:  # chime, then the voice 0.12 s after the last bell starts to ring out
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", chime_wav, "-i", voice_wav, "-filter_complex",
                        "[1]adelay=420|420[v];[0][v]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9",
                        "-ac", "1", "-b:a", "64k", path], check=True)
    else:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", voice_wav, "-af", "alimiter=limit=0.9", "-ac", "1", "-b:a", "64k", path], check=True)
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout)
    print(line, f"{d:.2f}s", f"{os.path.getsize(path) // 1024} KB")
