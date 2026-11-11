"""An audio lesson from separate voice pieces -> one mp3 + its chapters (for the player and the text that follows the voice).
The lesson is a script (JSON, not in git): parts ("действия") made of pieces, each piece one voice and one text, in its own mp3
(<dir>/<piece>.mp3). To fix or improve a lesson, replace only the piece that is wrong and run this again – the rest stays as it is.
Each run makes a new file name (<name>-v<version>.mp3), because browsers keep /media/ 30 days.

Usage: python3 -I tools/nvo-trener/audio_lesson.py <script.json> <out-dir> [--speed 1.0]
The script: {"version": 1, "dir": "<folder of the pieces, next to the script>", "parts": [{"t": "…", "segs": ["E01", …]}],
             "segs": {"E01": {"who": "Ерчо", "text": "…"}, …}}
Writes <out-dir>/<name>-v<version>.mp3 and <out-dir>/<name>-v<version>.json
({"audio", "dur", "version", "parts": [{"t", "at"}], "segs": [{"id", "who", "text", "at", "end"}]}).
Needs numpy and ffmpeg."""
import json, os, subprocess, sys, tempfile, wave
import numpy as np

SR = 44100
args = sys.argv[1:]
speed = 1.0
if "--speed" in args:
    i = args.index("--speed")
    speed = float(args[i + 1])
    del args[i:i + 2]
script_path, out_dir = args
script = json.load(open(script_path, encoding="utf8"))
src_dir = os.path.join(os.path.dirname(os.path.abspath(script_path)), script.get("dir", "."))
name = os.path.splitext(os.path.basename(script_path))[0]
version = script.get("version", 1)
tmp = tempfile.mkdtemp()


def load(path):
    """One piece: gentle trim of the silence at both ends (soft first sounds stay), its loudness levelled."""
    wav = os.path.join(tmp, os.path.basename(path) + ".wav")
    trimmed = wav + ".trim.wav"
    # two steps: trimming and levelling in one ffmpeg run sometimes hangs
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", path, "-af",
                    "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.08,areverse,"
                    "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.12,areverse",
                    "-ac", "1", "-ar", str(SR), trimmed], check=True, timeout=60)
    af = "loudnorm=I=-17:TP=-2:LRA=9" + (f",atempo={speed}" if speed != 1.0 else "")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", trimmed, "-af", af, "-ac", "1", "-ar", str(SR), wav], check=True, timeout=60)
    with wave.open(wav) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768


def bell(f, sec=0.9, decay=0.35):
    x = np.arange(int(SR * sec)) / SR
    env = lambda d: np.clip(x / 0.003, 0, 1) * np.exp(-x / d)
    s = np.sin(2 * np.pi * f * x) * env(decay)
    for ratio, amp, d in ((2.0, 0.3, 0.5), (3.01, 0.12, 0.3)):
        s += amp * np.sin(2 * np.pi * f * ratio * x) * env(decay * d)
    return s


# between the parts: two soft bells going down, like a theatre gong, quieter than the voice
gong = np.zeros(int(SR * 1.1))
for i, f in enumerate((659.3, 523.3)):
    b = bell(f) * (0.7 if i == 0 else 0.9)
    st = int(i * 0.18 * SR)
    gong[st:st + len(b)] += b[: len(gong) - st]
gong = gong / np.max(np.abs(gong)) * 10 ** (-14 / 20)
silence = lambda s: np.zeros(int(SR * s), np.float32)

out, parts, segs, t = [], [], [], 0.0
add = lambda a: (out.append(a), len(a) / SR)[1]
for pi, part in enumerate(script["parts"]):
    if pi:
        t += add(silence(0.35))
        t += add(gong.astype(np.float32))
    parts.append({"t": part["t"], "at": round(t, 2)})
    for si, sid in enumerate(part["segs"]):
        if si:
            t += add(silence(0.3))
        a = load(os.path.join(src_dir, f"{sid}.mp3"))
        seg = script["segs"][sid]
        segs.append({"id": sid, "who": seg.get("who", ""), "text": seg["text"], "at": round(t, 2)})
        t += add(a)
        segs[-1]["end"] = round(t, 2)
t += add(silence(0.6))

pcm = np.clip(np.concatenate(out), -1, 1)
mix = os.path.join(tmp, "mix.wav")
with wave.open(mix, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((pcm * 32767).astype(np.int16).tobytes())
os.makedirs(out_dir, exist_ok=True)
base = f"{name}-v{version}"
mp3 = os.path.join(out_dir, base + ".mp3")
# speech only: mono 56 kbit/s is clear and keeps 4 minutes under 2 MB
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", mix, "-af", "alimiter=limit=0.9", "-ac", "1", "-b:a", "56k", mp3], check=True)
meta = {"audio": base + ".mp3", "dur": round(t, 2), "version": version, "parts": parts, "segs": segs}
json.dump(meta, open(os.path.join(out_dir, base + ".json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(f"{mp3}: {int(t // 60)}:{int(t % 60):02d}, {os.path.getsize(mp3) // 1024} KB, {len(parts)} parts, {len(segs)} pieces")
