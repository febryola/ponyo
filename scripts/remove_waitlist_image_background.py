"""Remove the near-white connected canvas from the waitlist panorama."""

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/images/waiting-list.png"
OUTPUT = ROOT / "public/images/waiting-list-transparent.png"

# Current art uses a softly tinted white canvas. A conservative neutral-white
# key with edge-connected flood fill avoids punching holes in white plush.
KEY_MIN_CHANNEL = 224
KEY_MAX_SPREAD = 24


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    width, height = image.size
    rgb = image.convert("RGB").tobytes()
    background = bytearray(width * height)
    queue: deque[int] = deque()

    def is_backdrop(index: int) -> bool:
        offset = index * 3
        red, green, blue = rgb[offset], rgb[offset + 1], rgb[offset + 2]
        return min(red, green, blue) >= KEY_MIN_CHANNEL and max(red, green, blue) - min(red, green, blue) <= KEY_MAX_SPREAD

    def add_edge(index: int) -> None:
        if not background[index] and is_backdrop(index):
            background[index] = 1
            queue.append(index)

    for x in range(width):
        add_edge(x)
        add_edge((height - 1) * width + x)
    for y in range(height):
        add_edge(y * width)
        add_edge(y * width + width - 1)

    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        if x > 0:
            add_edge(index - 1)
        if x + 1 < width:
            add_edge(index + 1)
        if y > 0:
            add_edge(index - width)
        if y + 1 < height:
            add_edge(index + width)

    mask = Image.new("L", image.size)
    mask.putdata([0 if background[index] else 255 for index in range(width * height)])
    # Soften only the silhouette edge slightly to avoid a hard keying fringe.
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.7))
    image.putalpha(mask)
    # Trim the now-transparent canvas so the full-width banner renders at a
    # useful size on phones instead of reserving vertical space for blank sky.
    bounds = mask.getbbox()
    if bounds is not None:
        image = image.crop(bounds)
    image.save(OUTPUT, optimize=True)
    removed = sum(background)
    print(f"Saved {OUTPUT.relative_to(ROOT)} ({removed} backdrop pixels removed of {width * height})")


if __name__ == "__main__":
    main()
