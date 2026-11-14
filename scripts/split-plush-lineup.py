"""Extract the visible plush silhouettes from the local homepage lineup.

Install scripts/requirements-images.txt first. No hidden/occluded parts are
reconstructed; the small source image limits the detail of these demo assets.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/images/plushies-home-3.png"
OUTPUT = ROOT / "public/images/catalog/lineup"

# Source-pixel outlines separate overlapping neighbours, not just bounding boxes.
SILHOUETTES = {
    "mochi-cloud": [(24, 132), (41, 101), (66, 91), (81, 74), (108, 70), (124, 81), (128, 67), (145, 62), (151, 68), (143, 80), (154, 91), (164, 90), (169, 109), (149, 117), (138, 126), (145, 149), (158, 168), (159, 204), (58, 204), (37, 176), (24, 161)],
    "blossom-fawn": [(145, 125), (157, 118), (172, 119), (164, 100), (165, 89), (176, 88), (183, 104), (196, 106), (209, 99), (208, 81), (214, 76), (225, 85), (226, 102), (239, 109), (252, 127), (254, 150), (268, 175), (267, 198), (253, 211), (197, 212), (181, 202), (177, 175), (170, 160), (151, 153)],
    "eucalyptus-koala": [(225, 79), (223, 57), (239, 39), (260, 39), (275, 48), (305, 41), (331, 46), (334, 32), (355, 24), (373, 30), (381, 45), (374, 66), (370, 86), (373, 111), (365, 139), (373, 154), (373, 181), (365, 206), (344, 214), (315, 208), (284, 213), (257, 204), (257, 173), (265, 150), (260, 124), (243, 107), (229, 100)],
    "apple-corgi": [(374, 85), (379, 56), (386, 28), (400, 18), (416, 28), (429, 36), (431, 25), (445, 27), (453, 21), (462, 28), (461, 40), (478, 28), (492, 24), (502, 39), (507, 78), (503, 107), (491, 123), (471, 133), (461, 158), (461, 194), (453, 209), (392, 211), (377, 202), (377, 166), (386, 143), (376, 123)],
    "vanilla-loaf-kitten": [(453, 164), (462, 145), (467, 122), (482, 126), (502, 140), (520, 139), (542, 121), (552, 125), (558, 153), (568, 172), (564, 203), (549, 213), (522, 212), (514, 207), (494, 213), (466, 212), (451, 199)],
    "buttercream-lamb": [(504, 82), (531, 72), (539, 50), (558, 37), (585, 34), (610, 39), (627, 52), (638, 74), (658, 91), (666, 113), (650, 126), (638, 128), (641, 151), (626, 174), (639, 182), (638, 200), (621, 207), (567, 206), (571, 183), (557, 158), (557, 139), (539, 125), (522, 115), (507, 112)],
    "moonlight-bat": [(620, 167), (632, 151), (651, 139), (662, 128), (662, 111), (658, 87), (666, 57), (678, 43), (690, 53), (704, 74), (730, 73), (748, 55), (758, 54), (769, 77), (768, 105), (766, 127), (785, 143), (808, 176), (795, 180), (783, 187), (765, 183), (769, 201), (755, 213), (683, 214), (669, 204), (667, 182), (648, 188), (637, 180), (614, 179)],
    "starlight-kitty": [(756, 60), (765, 37), (778, 29), (795, 33), (813, 50), (837, 52), (856, 50), (876, 54), (885, 68), (879, 93), (863, 119), (858, 136), (860, 143), (837, 148), (818, 163), (811, 185), (795, 207), (776, 210), (769, 197), (773, 183), (789, 183), (807, 176), (787, 141), (771, 129), (773, 106), (774, 78)],
    "clover-turtle": [(819, 179), (831, 156), (846, 149), (864, 137), (886, 129), (893, 104), (911, 86), (936, 82), (956, 90), (965, 109), (962, 130), (947, 146), (941, 157), (931, 180), (934, 200), (922, 214), (901, 212), (893, 203), (881, 207), (851, 215), (821, 207), (815, 195)],
    "pebble-otter": [(938, 171), (940, 155), (952, 142), (975, 136), (997, 143), (1008, 159), (1012, 183), (1015, 202), (1006, 212), (983, 215), (963, 212), (942, 214), (932, 206), (935, 189)],
}


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (1024, 216):
        raise ValueError("The outlines require the original 1024 × 216 lineup.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for slug, outline in SILHOUETTES.items():
        mask = Image.new("L", source.size)
        ImageDraw.Draw(mask).polygon(outline, fill=255)
        plush = source.copy()
        plush.putalpha(ImageChops.multiply(source.getchannel("A"), mask))
        bounds = plush.getbbox()
        if bounds is None:
            raise ValueError(f"Empty plush silhouette: {slug}")
        plush = plush.crop(bounds)
        plush.thumbnail((440, 440), Image.Resampling.LANCZOS)
        # Keep a consistent square frame, without upscaling the tiny source.
        edge = max(plush.size) + 24
        canvas = Image.new("RGBA", (edge, edge), (255, 255, 255, 0))
        canvas.alpha_composite(plush, ((edge - plush.width) // 2, edge - plush.height - 12))
        target = OUTPUT / f"{slug}.png"
        canvas.save(target, optimize=True)
        print(target.relative_to(ROOT))


if __name__ == "__main__":
    main()