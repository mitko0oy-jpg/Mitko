"""Section icons for the math cards (paper-style pictures on white, from the card page) -> transparent WebP in public/media/.
Usage: python3 -I tools/nvo-trener/icons.py <in.jpg> <out.webp>
The white paper and its soft shadow around the picture become transparent (a faint shadow stays), so the icon also sits well
on the dark theme; white parts inside the picture are kept. Then trimmed and scaled to 160 px."""
import sys, numpy as np
from PIL import Image, ImageFilter
from collections import deque
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.int16)
H, W, _ = a.shape
white = a.min(axis=2)            # how light a pixel is
sat = a.max(axis=2) - a.min(axis=2)
# background = light, unsaturated pixels connected to the border (paper + soft shadow)
bg = (white > 200) & (sat < 22)
seen = np.zeros((H, W), bool)
dq = deque([(y, x) for y in range(H) for x in (0, W - 1)] + [(y, x) for x in range(W) for y in (0, H - 1)])
while dq:
    y, x = dq.popleft()
    if seen[y, x] or not bg[y, x]:
        continue
    seen[y, x] = True
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = y + dy, x + dx
        if 0 <= yy < H and 0 <= xx < W and not seen[yy, xx]:
            dq.append((yy, xx))
alpha = np.where(seen, 0, 255).astype(np.uint8)
# keep the soft shadow as a faint shadow: darker background pixels get a little alpha
shadow = seen & (white < 242)
alpha[shadow] = np.clip((242 - white[shadow]) * 3.2, 0, 90).astype(np.uint8)
rgb = a.astype(np.uint8).copy()
rgb[shadow] = (40, 30, 80)
A = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.7))
out = Image.fromarray(rgb).convert("RGBA")
out.putalpha(A)
box = A.point(lambda v: 255 if v > 10 else 0).getbbox()
out = out.crop(box)
out.thumbnail((160, 160), Image.LANCZOS)
out.save(dst, "WEBP", quality=84, method=6)
print(dst, out.size)
