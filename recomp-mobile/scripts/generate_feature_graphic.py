#!/usr/bin/env python3
"""Generate Google Play feature graphic (1024x500) from the Refactor logo."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from icon_brand import APP_ICON_PATH, load_mark, square_mark_icon

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "assets" / "refactor-logo.png"
OUTPUT_PATH = ROOT / "play-feature-graphic.png"

WIDTH, HEIGHT = 1024, 500
BG_COLOR = (235, 231, 219, 255)  # #EBE7DB
BRAND_GREEN = (102, 106, 71, 255)  # sampled from logo
TAGLINE_GRAY = (120, 122, 110, 255)


def _is_content(r: int, g: int, b: int, a: int) -> bool:
    if a < 200:
        return False
    return not (r > 210 and g > 205 and b > 190)


def trim_logo(logo: Image.Image) -> Image.Image:
    logo = logo.convert("RGBA")
    px = logo.load()
    w, h = logo.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if _is_content(r, g, b, a):
                minx, maxx = min(minx, x), max(maxx, x)
                miny, maxy = min(miny, y), max(maxy, y)
    return logo.crop((minx, miny, maxx + 1, maxy + 1))


def crop_icon(mark: Image.Image) -> Image.Image:
    """Left chevron stack from the trimmed wordmark (before the REFACTOR letterforms)."""
    mark = mark.convert("RGBA")
    w, h = mark.size
    cols = [
        sum(1 for y in range(h) if _is_content(*mark.getpixel((x, y))))
        for x in range(w)
    ]
    peak = max(cols[: max(1, w // 2)])
    split = w
    for x in range(8, min(w, 140)):
        if cols[x] < peak * 0.2 and cols[min(x + 1, w - 1)] < peak * 0.2:
            split = x + 6
            break
    split = max(40, min(split, int(w * 0.22)))
    return mark.crop((0, 0, split, h))


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental") / name,
        Path("/Library/Fonts") / name,
        Path("/usr/share/fonts/truetype/dejavu") / name.replace("Arial", "DejaVuSans"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main() -> None:
    if not LOGO_PATH.exists():
        raise FileNotFoundError(f"Logo not found: {LOGO_PATH}")
    if not APP_ICON_PATH.exists():
        raise FileNotFoundError(f"App icon not found: {APP_ICON_PATH}")

    app_icon = square_mark_icon(load_mark(), 320)

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    # Left: app icon
    icon_target = 300
    icon_resized = app_icon.resize((icon_target, icon_target), Image.Resampling.LANCZOS)
    icon_x = 88
    icon_y = (HEIGHT - icon_target) // 2 - 24
    canvas.paste(icon_resized, (icon_x, icon_y), icon_resized)

    # Right: brand typography from horizontal wordmark
    logo = trim_logo(Image.open(LOGO_PATH))
    text_x = icon_x + icon_target + 56
    title_font = load_font("Arial Bold.ttf", 92)
    subtitle_font = load_font("Arial.ttf", 34)
    features_font = load_font("Arial.ttf", 28)

    draw.text((text_x, 118), "REFACTOR", font=title_font, fill=BRAND_GREEN)
    draw.text((text_x, 218), "body recomposition", font=subtitle_font, fill=TAGLINE_GRAY)
    draw.text(
        (text_x, 318),
        "AI coach  ·  Meals  ·  Workouts  ·  Macros",
        font=features_font,
        fill=TAGLINE_GRAY,
    )

    # Soft accent line under features
    line_y = 368
    draw.line((text_x, line_y, WIDTH - 88, line_y), fill=(102, 106, 71, 60), width=2)

    canvas.convert("RGB").save(OUTPUT_PATH, format="PNG", optimize=True)
    print(f"wrote {OUTPUT_PATH} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
