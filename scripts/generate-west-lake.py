"""Crop Copernicus N30E120 and extract West Lake's OSM multipolygon.

Usage: python3 scripts/generate-west-lake.py N30E120.tif west-lake.osm peaks.osm ...
The first OSM file must include relation 2308774 and all its nodes and ways.
"""

import json
import math
import statistics
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

WEST, EAST = 120.055, 120.171
SOUTH, NORTH = 30.166, 30.286
RELATION_ID = "2308774"
TARGET = Path(__file__).resolve().parents[1] / "src" / "data"
SIGHTS = [
    ("baoshi", "宝石山", "湖畔北侧", "西湖北岸的丘陵，可从这里观察宝石山与湖面的相对位置。", [8, 7, 9]),
    ("ge", "葛岭（东峰）", "湖北丘陵", "连接西湖北岸丘陵与西侧群山的山岭，与宝石山相邻。", [-7, 7, 9]),
    ("beigao", "北高峰", "湖西群山", "西湖西侧的山峰，可观察灵隐一带的山脊与谷地。", [8, 9, 10]),
    ("nangao", "南高峰", "湖西群山", "西湖西侧的山峰，与北高峰共同构成湖西群山的代表景观。", [9, 8, 10]),
    ("wuyun", "五云山", "西南山地", "西湖西南侧的山地，可从这里观察九溪一带连续的山脊与谷地。", [9, 9, 10]),
    ("yuhuang", "玉皇山", "湖南山地", "西湖南侧的山体，在模型中呈现湖面、南部丘陵与山脊的关系。", [9, 8, 10]),
]


def tags(element):
    return {item.attrib["k"]: item.attrib["v"] for item in element.findall("tag")}


def closed_rings(parts):
    """Join member ways by node IDs; never invent missing shoreline segments."""
    pending = [part[:] for part in parts]
    rings = []
    while pending:
        ring = pending.pop(0)
        while ring[0] != ring[-1]:
            for index, part in enumerate(pending):
                if part[0] == ring[-1]:
                    ring.extend(part[1:])
                    break
                if part[-1] == ring[-1]:
                    ring.extend(part[-2::-1])
                    break
            else:
                raise ValueError(f"Incomplete OSM shoreline at node {ring[-1]}")
            pending.pop(index)
        assert len(ring) >= 4
        rings.append(ring)
    return rings


def contains(point, ring):
    x, y = point
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def main(source, osm_paths):
    image = Image.open(source)
    dx, dy, _ = image.tag_v2[33550]
    _, _, _, tile_west, tile_north, _ = image.tag_v2[33922]
    left, right = round((WEST - tile_west) / dx), round((EAST - tile_west) / dx)
    top, bottom = round((tile_north - NORTH) / dy), round((tile_north - SOUTH) / dy)
    assert 0 <= left < right <= image.width and 0 <= top < bottom <= image.height
    crop = image.crop((left, top, right, bottom))
    west, east = tile_west + (left + 0.5) * dx, tile_west + (right - 0.5) * dx
    north, south = tile_north - (top + 0.5) * dy, tile_north - (bottom - 0.5) * dy
    heights = list(crop.getdata())
    assert all(math.isfinite(value) and -3276.8 <= value <= 3276.7 for value in heights)

    root = ET.parse(osm_paths[0]).getroot()
    nodes = {node.attrib["id"]: [float(node.attrib["lon"]), float(node.attrib["lat"])] for node in root.findall("node")}
    ways = {way.attrib["id"]: [node.attrib["ref"] for node in way.findall("nd")] for way in root.findall("way")}
    relation = next(item for item in root.findall("relation") if item.attrib["id"] == RELATION_ID)
    boundaries = {}
    for role in ["outer", "inner"]:
        parts = [ways[item.attrib["ref"]] for item in relation.findall("member") if item.attrib["role"] == role]
        boundaries[role] = [[nodes[node] for node in ring] for ring in closed_rings(parts)]
    polygons = [{"outer": outer, "holes": []} for outer in boundaries["outer"]]
    for hole in boundaries["inner"]:
        parent = next((polygon for polygon in polygons if contains(hole[0], polygon["outer"])), None)
        if parent is None:
            raise ValueError("OSM inner ring has no containing outer ring")
        parent["holes"].append(hole)

    # OSM currently has a land ring nested inside another land ring. Treat both
    # as one land region; passing nested holes to Earcut would fill part of it.
    merged_rings = 0
    for polygon in polygons:
        holes = polygon["holes"]
        polygon["holes"] = [hole for hole in holes if not any(
            other is not hole and all(contains(point, other) for point in hole[:-1]) for other in holes
        )]
        merged_rings += len(holes) - len(polygon["holes"])

    def pixel(point):
        lon, lat = point
        return ((lon - west) / dx, (north - lat) / dy)

    mask = Image.new("L", crop.size)
    for polygon in polygons:
        layer = Image.new("L", crop.size)
        draw = ImageDraw.Draw(layer)
        draw.polygon([pixel(point) for point in polygon["outer"]], fill=1)
        for hole in polygon["holes"]:
            draw.polygon([pixel(point) for point in hole], fill=0)
        mask = ImageChops.lighter(mask, layer)
    water = mask.tobytes()
    assert 1000 < sum(water) < len(water) / 2
    lake_level = round(statistics.median(value for value, wet in zip(heights, water) if wet), 1)

    peaks = {}
    for path in osm_paths[1:]:
        for node in ET.parse(path).getroot().findall("node"):
            info = tags(node)
            if info.get("natural") == "peak":
                peaks[info.get("name")] = node
    sights = []
    for sight_id, name, category, description, offset in SIGHTS:
        if name not in peaks:
            raise ValueError(f"Missing sourced OSM peak: {name}")
        node = peaks[name]
        longitude, latitude = float(node.attrib["lon"]), float(node.attrib["lat"])
        assert west <= longitude <= east and south <= latitude <= north
        sights.append({"id": sight_id, "name": name, "category": category, "description": description,
                       "longitude": longitude, "latitude": latitude, "viewOffset": offset,
                       "osm": f"https://www.openstreetmap.org/node/{node.attrib['id']}",
                       "official": "https://whc.unesco.org/en/list/1334/"})

    TARGET.mkdir(parents=True, exist_ok=True)
    quantized = [round(value * 10) for value in heights]
    (TARGET / "west-lake-dem.bin").write_bytes(struct.pack(f"<{len(quantized)}h", *quantized))
    (TARGET / "west-lake-water.bin").write_bytes(water)
    metadata = {"width": crop.width, "height": crop.height, "west": west, "east": east, "north": north, "south": south,
                "unit": "decimetres, signed 16-bit little-endian", "sourceTile": Path(source).name,
                "horizontalScale": 0.0025, "verticalExaggeration": 4,
                "lakeElevation": lake_level, "minElevation": round(min(heights), 1), "maxElevation": round(max(heights), 1)}
    for name, data in [("west-lake-dem", metadata), ("west-lake-shore", {"osmRelation": RELATION_ID, "mergedNestedLandRings": merged_rings, "polygons": polygons}),
                       ("west-lake-landmarks", sights)]:
        (TARGET / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {crop.width} x {crop.height} DEM; {len(polygons)} lake polygons; "
          f"{sum(len(polygon['holes']) for polygon in polygons)} island/land holes "
          f"({merged_rings} nested land rings merged); lake {lake_level} m; {len(sights)} peaks")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), [Path(path) for path in sys.argv[2:]])
