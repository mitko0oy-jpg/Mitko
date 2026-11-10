"""Illustrations for the trainer: generated images (PNG with a transparent background) -> small WebP files in public/assets/trener/.
Usage: python3 -I tools/nvo-trener/art.py <name>=<png path or https URL> [...] [--size 512]
Each image is cut to its visible part (plus a small margin), scaled so the longer side is --size px and saved as <name>.webp."""
import io, os, sys, urllib.request
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.join(here, "..", "..", "public", "assets", "trener")
os.makedirs(out_dir, exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith("--")]
size = 512
if "--size" in sys.argv:
    size = int(sys.argv[sys.argv.index("--size") + 1])
    args = [a for a in args if a != str(size)]

for spec in args:
    name, src = spec.split("=", 1)
    raw = urllib.request.urlopen(src).read() if src.startswith("https://") else open(src, "rb").read()
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box:
        m = int(max(box[2] - box[0], box[3] - box[1]) * 0.04)
        box = (max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m))
        im = im.crop(box)
    im.thumbnail((size, size), Image.LANCZOS)
    path = os.path.join(out_dir, f"{name}.webp")
    im.save(path, "WEBP", quality=82, method=6)
    print(name, im.size, f"{os.path.getsize(path) // 1024} KB")
