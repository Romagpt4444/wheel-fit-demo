#!/usr/bin/env python3
"""Prepare a client's wheel photo for the try-on.

Photo of a wheel shot face-on -> background removed (rembg) -> centred circular crop
-> 1024x1024 transparent PNG + WebP + 256px thumbnails in public/assets/wheels/.

Usage:
    python3 scripts/prepare-wheel.py photo.jpg --id apex-s5 [--no-rembg] [--tighten 0.98]

Install once:
    python3 -m venv .venv-wheels && .venv-wheels/bin/pip install "rembg[cpu]" pillow
    .venv-wheels/bin/python scripts/prepare-wheel.py photo.jpg --id my-wheel

Without rembg (--no-rembg) the script still makes the circular crop, which is enough
for studio shots on a plain background.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "wheels"
SIZE = 1024
RIM_RADIUS = 500  # the app expects the rim edge at r=500 inside a 1024 canvas (12px margin)


def remove_background(img: Image.Image, model: str) -> Image.Image:
    try:
        from rembg import new_session, remove  # type: ignore
    except ImportError:
        sys.exit("rembg не установлен. Поставьте его (см. docstring) или запустите с --no-rembg")
    # first run downloads the model (~170 MB for u2net) into ~/.u2net
    return remove(img.convert("RGBA"), session=new_session(model))


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    alpha = img.getchannel("A").point(lambda a: 255 if a > 40 else 0)
    box = alpha.getbbox()
    if not box:
        sys.exit("На фото не найден диск: после удаления фона изображение пустое")
    return box


def circle_crop(img: Image.Image, tighten: float) -> Image.Image:
    """Square around the wheel, scaled so the rim radius lands on 500px, round mask."""
    l, t, r, b = alpha_bbox(img)
    cx, cy = (l + r) / 2, (t + b) / 2
    radius = max(r - l, b - t) / 2 * tighten
    k = RIM_RADIUS / radius
    scaled = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(scaled, (round(SIZE / 2 - cx * k), round(SIZE / 2 - cy * k)))
    # soft round mask: tyre rubber or background leftovers outside the rim are cut away
    mask = Image.new("L", (SIZE * 4, SIZE * 4), 0)
    c, rr = SIZE * 2, RIM_RADIUS * 4
    ImageDraw.Draw(mask).ellipse((c - rr, c - rr, c + rr, c + rr), fill=255)
    mask = mask.resize((SIZE, SIZE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    canvas.putalpha(ImageChops.multiply(canvas.getchannel("A"), mask))
    return canvas


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photo", type=Path)
    ap.add_argument("--id", required=True, help="id диска из data/wheels.json, например apex-s5")
    ap.add_argument("--no-rembg", action="store_true", help="не удалять фон (фото уже на прозрачном или ровном фоне)")
    ap.add_argument("--tighten", type=float, default=0.98, help="<1 — срезать край шины, если она попала в кадр")
    ap.add_argument("--model", default="u2net", help="модель rembg: u2net (по умолчанию), isnet-general-use, birefnet-general…")
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()

    if not args.photo.exists():
        sys.exit(f"Файл не найден: {args.photo}")
    img = Image.open(args.photo)
    img = img.convert("RGBA") if args.no_rembg else remove_background(img, args.model)
    if args.no_rembg and img.getchannel("A").getextrema() == (255, 255):
        # opaque photo without rembg: treat near-white / near-black flat backgrounds as transparent
        bg = img.getpixel((2, 2))
        diff = ImageChops.difference(img.convert("RGB"), Image.new("RGB", img.size, bg[:3])).convert("L")
        img.putalpha(diff.point(lambda v: 255 if v > 18 else 0))

    out = circle_crop(img, args.tighten)
    args.out.mkdir(parents=True, exist_ok=True)
    png = args.out / f"{args.id}.png"
    out.save(png, optimize=True)
    out.save(args.out / f"{args.id}.webp", quality=88, method=5)
    thumb = out.resize((256, 256), Image.LANCZOS)
    thumb.save(args.out / f"{args.id}-thumb.webp", quality=82, method=5)
    try:
        thumb.save(args.out / f"{args.id}-thumb.avif", quality=55)
    except (KeyError, OSError):
        print("AVIF не поддерживается этой сборкой Pillow: превью только в WebP. В wheels.json это не мешает")
    print(f"Готово: {png.relative_to(Path.cwd()) if png.is_relative_to(Path.cwd()) else png}")
    print(f'В data/wheels.json: "image": "assets/wheels/{args.id}.webp", "thumb": "assets/wheels/{args.id}-thumb"')


if __name__ == "__main__":
    main()
