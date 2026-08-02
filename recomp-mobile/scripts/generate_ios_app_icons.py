#!/usr/bin/env python3
"""Generate iOS + watchOS App Store / home-screen icons from refactor-app-icon.png."""

from __future__ import annotations

from pathlib import Path

from icon_brand import load_mark, square_mark_icon

ROOT = Path(__file__).resolve().parents[1]
IOS_ICONSET = (
    ROOT.parent
    / "RecompSwift/RecompApp/App/Refactor/Refactor/Assets.xcassets/AppIcon.appiconset"
)
WATCH_ICON = (
    ROOT.parent
    / "RecompSwift/RecompApp/App/Refactor/Refactor Watch App/Assets.xcassets/AppIcon.appiconset/watch-icon-1024.png"
)

# Filenames in AppIcon.appiconset → pixel size
IOS_SIZES: dict[str, int] = {
    "icon-20.png": 20,
    "icon-29.png": 29,
    "icon-40.png": 40,
    "icon-58.png": 58,
    "icon-60.png": 60,
    "icon-76.png": 76,
    "icon-80.png": 80,
    "icon-87.png": 87,
    "icon-120.png": 120,
    "icon-152.png": 152,
    "icon-167.png": 167,
    "icon-180.png": 180,
    "icon-1024.png": 1024,
}


def main() -> None:
    if not IOS_ICONSET.is_dir():
        raise FileNotFoundError(f"iOS icon set not found: {IOS_ICONSET}")

    mark = load_mark()

    for filename, px in IOS_SIZES.items():
        out = IOS_ICONSET / filename
        icon = square_mark_icon(mark, px)
        # App Store marketing icon: opaque RGB (no alpha channel).
        if px == 1024:
            icon.convert("RGB").save(out, format="PNG", optimize=True)
        else:
            icon.save(out, format="PNG", optimize=True)
        print(f"wrote {out} ({px}px)")

    WATCH_ICON.parent.mkdir(parents=True, exist_ok=True)
    watch = square_mark_icon(mark, 1024)
    watch.convert("RGB").save(WATCH_ICON, format="PNG", optimize=True)
    print(f"wrote {WATCH_ICON}")


if __name__ == "__main__":
    main()
