#!/usr/bin/env python3
"""Generate web/PWA icons and favicon from the Refactor app icon."""

from __future__ import annotations

from pathlib import Path

from icon_brand import background_color, load_mark, square_mark_icon

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
PUBLIC = REPO_ROOT / "public"
APP_DIR = REPO_ROOT / "src" / "app"


def main() -> None:
    mark = load_mark()
    bg = background_color(mark)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)

    sizes = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon.png": 180,
    }
    for filename, px in sizes.items():
        out = PUBLIC / filename
        square_mark_icon(mark, px, bg=bg).convert("RGB").save(out, format="PNG", optimize=True)
        print(f"wrote {out} ({px}px)")

    favicon_sizes = [(16, 16), (32, 32), (48, 48)]
    favicon_images = [
        square_mark_icon(mark, px, bg=bg).convert("RGBA") for _, px in favicon_sizes
    ]
    favicon_path = APP_DIR / "favicon.ico"
    favicon_images[0].save(
        favicon_path,
        format="ICO",
        sizes=favicon_sizes,
        append_images=favicon_images[1:],
    )
    print(f"wrote {favicon_path}")

    # Keep legacy /icon.svg consumers working with a raster-backed SVG.
    icon_512 = PUBLIC / "icon-512.png"
    svg_path = PUBLIC / "icon.svg"
    svg_path.write_text(
        "\n".join(
            [
                '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
                '     viewBox="0 0 512 512" width="512" height="512">',
                f'  <image width="512" height="512" href="/icon-512.png" xlink:href="/icon-512.png"/>',
                "</svg>",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"wrote {svg_path} (references {icon_512.name})")


if __name__ == "__main__":
    main()
