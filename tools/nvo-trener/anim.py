"""Short mascot clips on a green screen -> small animated WebP files with a transparent background (like GIFs, but sharp).
Usage: python3 -I tools/nvo-trener/anim.py <name>=<mp4 path or https URL> [...] [--size 320] [--fps 14]
Writes public/assets/trener/<name>.webp. Needs ffmpeg and Pillow."""
import glob, os, subprocess, sys, tempfile, urllib.request
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.join(here, "..", "..", "public", "assets", "trener")
args = [a for a in sys.argv[1:] if "=" in a]
opt = lambda k, d: int(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
size, fps = opt("--size", 260), opt("--fps", 10)

for spec in args:
    name, src = spec.split("=", 1)
    tmp = tempfile.mkdtemp()
    video = os.path.join(tmp, "in.mp4")
    if src.startswith("https://"):
        open(video, "wb").write(urllib.request.urlopen(src).read())
    else:
        video = src
    # the background colour, read from a corner of the first frame
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-frames:v", "1", os.path.join(tmp, "probe.png")], check=True)
    r, g, b = Image.open(os.path.join(tmp, "probe.png")).convert("RGB").getpixel((6, 6))
    key = f"0x{r:02X}{g:02X}{b:02X}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vf",
                    f"fps={fps},colorkey={key}:0.30:0.06,despill=type=green:mix=0.6:expand=0.1,format=rgba",
                    os.path.join(tmp, "f%03d.png")], check=True)
    frames = [Image.open(f).convert("RGBA") for f in sorted(glob.glob(os.path.join(tmp, "f[0-9]*.png")))]
    # remove leftover speckles: anything almost transparent becomes fully transparent
    frames = [Image.merge("RGBA", (*fr.split()[:3], fr.getchannel("A").point(lambda a: 0 if a < 40 else a))) for fr in frames]
    box = None
    for fr in frames:
        bb = fr.getchannel("A").getbbox()
        if bb:
            box = bb if not box else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    m = 8
    box = (max(0, box[0] - m), max(0, box[1] - m), min(frames[0].width, box[2] + m), min(frames[0].height, box[3] + m))
    frames = [fr.crop(box) for fr in frames]
    for fr in frames:
        fr.thumbnail((size, size), Image.LANCZOS)
    path = os.path.join(out_dir, f"{name}.webp")
    frames[0].save(path, "WEBP", save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0, quality=58, alpha_quality=70, method=6)
    print(name, frames[0].size, len(frames), "frames", f"{os.path.getsize(path) // 1024} KB")
