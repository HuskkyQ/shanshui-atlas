"""Crop the public Copernicus GLO-30 tile to Huangshan's core scenic area."""

import json
import struct
import sys
from pathlib import Path

from PIL import Image


# Source tile: Copernicus_DSM_COG_10_N30_00_E118_00_DEM.tif
# https://registry.opendata.aws/copernicus-dem/
WEST, EAST = 118.120, 118.192
SOUTH, NORTH = 30.104, 30.180
TILE_SIZE = 3600


def main(source: Path) -> None:
    image = Image.open(source)
    left = round((WEST - 118) * TILE_SIZE)
    right = round((EAST - 118) * TILE_SIZE)
    top = round((31 - NORTH) * TILE_SIZE)
    bottom = round((31 - SOUTH) * TILE_SIZE)
    crop = image.crop((left, top, right, bottom))

    target = Path(__file__).resolve().parents[1] / "src" / "data"
    target.mkdir(parents=True, exist_ok=True)
    heights = [round(value * 10) for value in crop.getdata()]
    (target / "huangshan-dem.bin").write_bytes(struct.pack(f"<{len(heights)}H", *heights))
    metadata = {
        "width": crop.width,
        "height": crop.height,
        "west": 118 + (left + 0.5) / TILE_SIZE,
        "east": 118 + (right - 0.5) / TILE_SIZE,
        "north": 31 - (top + 0.5) / TILE_SIZE,
        "south": 31 - (bottom - 0.5) / TILE_SIZE,
        "unit": "decimetres, unsigned 16-bit little-endian",
    }
    (target / "huangshan-dem.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/generate-terrain.py N30E118.tif")
    main(Path(sys.argv[1]))
