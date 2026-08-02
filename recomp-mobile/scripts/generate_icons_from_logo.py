#!/usr/bin/env python3
"""Generate Play Store + Android launcher PNGs from refactor-app-icon.png."""

from __future__ import annotations

from pathlib import Path

from icon_brand import background_color, foreground_mark_icon, load_mark, square_mark_icon

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "app" / "src" / "main" / "res"

MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def main() -> None:
    mark = load_mark()
    bg = background_color(mark)

    store = square_mark_icon(mark, 512)
    store_path = ROOT / "play-store-icon.png"
    store.convert("RGB").save(store_path, format="PNG", optimize=True)
    print(f"wrote {store_path}")

    bg_hex = f"#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}"
    colors_xml = RES / "values" / "ic_launcher_background.xml"
    colors_xml.write_text(
        "<resources>\n"
        f'    <color name="ic_launcher_background">{bg_hex}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print(f"updated ic_launcher_background -> {bg_hex}")

    for folder, size in MIPMAP_SIZES.items():
        out_dir = RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        icon = square_mark_icon(mark, size)
        icon.save(out_dir / "ic_launcher.png")
        icon.save(out_dir / "ic_launcher_round.png")
        print(f"wrote {folder} ({size}px)")

    for folder, scale in [
        ("drawable-mdpi", 108),
        ("drawable-hdpi", 162),
        ("drawable-xhdpi", 216),
        ("drawable-xxhdpi", 324),
        ("drawable-xxxhdpi", 432),
    ]:
        out_dir = RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        foreground_mark_icon(mark, scale).save(out_dir / "ic_launcher_foreground.png")
        print(f"wrote {folder}/ic_launcher_foreground.png ({scale}px)")


if __name__ == "__main__":
    main()
