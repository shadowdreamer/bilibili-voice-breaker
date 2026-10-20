"""Create white-backed, palette-compressed logo PNGs. Requires Pillow."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/logo-source.png"
DESTINATION = ROOT / "public/icons"


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as source:
        # Premultiplied alpha avoids dark fringes along transparent edges.
        original = source.convert("RGBA").convert("RGBa")
        total = 0
        for size in (16, 32, 48, 128):
            resized = original.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
            canvas = Image.new("RGBA", resized.size, "white")
            canvas.alpha_composite(resized)
            # A small palette suits this monochrome mark and reduces PNG size.
            icon = canvas.convert("RGB").quantize(colors=64, dither=Image.Dither.NONE)
            target = DESTINATION / f"icon-{size}.png"
            icon.save(target, optimize=True, compress_level=9)
            total += target.stat().st_size
            print(f"{target.relative_to(ROOT)}: {size}x{size}, {target.stat().st_size:,} bytes")
        print(f"Original: {SOURCE.stat().st_size:,} bytes; all icons: {total:,} bytes")


if __name__ == "__main__":
    main()
