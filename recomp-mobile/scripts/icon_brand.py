#!/usr/bin/env python3
"""Shared Refactor logo → square app-icon helpers (chevron mark only)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "refactor-logo.png"
BG_COLOR = (235, 231, 219, 255)  # #EBE7DB


def _is_content(r: int, g: int, b: int, a: int) -> bool:
    if a < 200:
        return False
    return not (r > 210 and g > 205 and b > 190)


def background_color(img: Image.Image) -> tuple[int, int, int, int]:
    px = img.load()
    w, h = img.size
    samples = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    r = sum(s[0] for s in samples) // len(samples)
    g = sum(s[1] for s in samples) // len(samples)
    b = sum(s[2] for s in samples) // len(samples)
    return (r, g, b, 255)


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


def crop_chevron_mark(mark: Image.Image) -> Image.Image:
    """Left chevron stack only — readable at small icon sizes."""
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


def load_mark(logo_path: Path | None = None) -> Image.Image:
    path = logo_path or LOGO_PATH
    if not path.exists():
        raise FileNotFoundError(f"Logo not found: {path}")
    return crop_chevron_mark(trim_logo(Image.open(path)))


def square_mark_icon(
    mark: Image.Image,
    size: int,
    *,
    padding_ratio: float = 0.16,
    bg: tuple[int, int, int, int] | None = None,
) -> Image.Image:
    """Center the chevron mark on a square canvas."""
    mark = mark.convert("RGBA")
    background = bg or BG_COLOR
    canvas = Image.new("RGBA", (size, size), background)
    pad = int(size * padding_ratio)
    inner = size - pad * 2
    scale = min(inner / mark.width, inner / mark.height)
    nw, nh = max(1, int(mark.width * scale)), max(1, int(mark.height * scale))
    resized = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def foreground_mark_icon(mark: Image.Image, size: int, *, padding_ratio: float = 0.16) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * padding_ratio)
    inner = size - pad * 2
    scale = min(inner / mark.width, inner / mark.height)
    nw, nh = max(1, int(mark.width * scale)), max(1, int(mark.height * scale))
    resized = mark.convert("RGBA").resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas
