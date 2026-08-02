#!/usr/bin/env python3
"""Shared Refactor app-icon helpers (square ring logo)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

APP_ICON_PATH = Path(__file__).resolve().parents[1] / "assets" / "refactor-app-icon.png"
LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "refactor-logo.png"
BG_COLOR = (235, 231, 219, 255)  # #EBE7DB


def _is_content(r: int, g: int, b: int, a: int) -> bool:
    if a < 200:
        return False
    return not (r > 210 and g > 205 and b > 190)


def background_color(img: Image.Image) -> tuple[int, int, int, int]:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size

    for x in range(w):
        r, g, b, a = px[x, 0]
        if a >= 200:
            return (r, g, b, 255)
    for y in range(h):
        r, g, b, a = px[0, y]
        if a >= 200:
            return (r, g, b, 255)

    samples = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    opaque = [s for s in samples if s[3] >= 200]
    if opaque:
        r = sum(s[0] for s in opaque) // len(opaque)
        g = sum(s[1] for s in opaque) // len(opaque)
        b = sum(s[2] for s in opaque) // len(opaque)
        return (r, g, b, 255)
    return BG_COLOR


def flatten_app_icon(icon: Image.Image, bg: tuple[int, int, int, int] | None = None) -> Image.Image:
    """Composite transparent corners onto the cream canvas used in the design."""
    icon = icon.convert("RGBA")
    background = bg or background_color(icon)
    canvas = Image.new("RGBA", icon.size, background)
    canvas.alpha_composite(icon)
    return canvas


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


def _matches_background(
    r: int,
    g: int,
    b: int,
    bg: tuple[int, int, int, int],
    *,
    tolerance: int = 24,
) -> bool:
    return (
        abs(r - bg[0]) <= tolerance
        and abs(g - bg[1]) <= tolerance
        and abs(b - bg[2]) <= tolerance
    )


def transparent_foreground(icon: Image.Image) -> Image.Image:
    """Drop the cream canvas so Android adaptive icons can use a solid background."""
    icon = icon.convert("RGBA")
    bg = background_color(icon)
    px = icon.load()
    w, h = icon.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if _matches_background(r, g, b, bg):
                px[x, y] = (r, g, b, 0)
    return icon


def load_mark(logo_path: Path | None = None) -> Image.Image:
    path = logo_path or APP_ICON_PATH
    if not path.exists():
        raise FileNotFoundError(f"App icon not found: {path}")
    return flatten_app_icon(Image.open(path).convert("RGBA"))


def square_mark_icon(
    mark: Image.Image,
    size: int,
    *,
    padding_ratio: float = 0.0,
    bg: tuple[int, int, int, int] | None = None,
) -> Image.Image:
    """Resize the full square app icon to the target pixel size."""
    mark = mark.convert("RGBA")
    if padding_ratio <= 0:
        return mark.resize((size, size), Image.Resampling.LANCZOS)

    background = bg or background_color(mark)
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


def foreground_mark_icon(mark: Image.Image, size: int, *, padding_ratio: float = 0.08) -> Image.Image:
    fg = transparent_foreground(mark)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * padding_ratio)
    inner = size - pad * 2
    scale = min(inner / fg.width, inner / fg.height)
    nw, nh = max(1, int(fg.width * scale)), max(1, int(fg.height * scale))
    resized = fg.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas
