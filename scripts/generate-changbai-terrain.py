"""Build the Changbai crater DEM crop and OSM Heaven Lake shoreline.

The four source GeoTIFFs are intentionally kept outside the repository. See
docs/changbai-references/README.md for the exact download and regeneration
commands.
"""

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path
from xml.etree import ElementTree

import numpy as np
from PIL import Image


TILE_SIZE = 3600
REQUESTED_BOUNDS = {
    "west": 127.99,
    "east": 128.15,
    "south": 41.94,
    "north": 42.09,
}
TILE_IDS = (
    "N41_00_E127_00",
    "N41_00_E128_00",
    "N42_00_E127_00",
    "N42_00_E128_00",
)
OSM_RELATION_ID = 11650508
OSM_MEMBER_WAY_IDS = (849712562, 30769571)
AWS_ROOT = "https://copernicus-dem-30m.s3.amazonaws.com"
OSM_SNAPSHOT_URL = f"https://api.openstreetmap.org/api/0.6/relation/{OSM_RELATION_ID}/full"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tile_url(tile_id: str) -> str:
    name = f"Copernicus_DSM_COG_10_{tile_id}_DEM"
    return f"{AWS_ROOT}/{name}/{name}.tif"


def aligned_sample_range(low: float, high: float) -> tuple[int, int]:
    """Return inclusive global 1-arc-second sample indices inside bounds."""
    return math.ceil(low * TILE_SIZE - 0.5), math.floor(high * TILE_SIZE - 0.5)


def tile_coordinates(tile_id: str) -> tuple[int, int]:
    latitude = int(tile_id[1:3]) * (1 if tile_id[0] == "N" else -1)
    longitude = int(tile_id[8:11]) * (1 if tile_id[7] == "E" else -1)
    return longitude, latitude


def verify_georeferencing(image: Image.Image, longitude: int, latitude: int, path: Path) -> None:
    if image.size != (TILE_SIZE, TILE_SIZE) or image.mode != "F":
        raise ValueError(f"Unexpected raster layout in {path}: size={image.size}, mode={image.mode}")
    scale = tuple(image.tag_v2.get(33550, ()))
    tiepoint = tuple(image.tag_v2.get(33922, ()))
    expected_scale = 1 / TILE_SIZE
    if len(scale) < 2 or not math.isclose(scale[0], expected_scale) or not math.isclose(scale[1], expected_scale):
        raise ValueError(f"Unexpected pixel scale in {path}: {scale}")
    if len(tiepoint) < 6 or not math.isclose(tiepoint[3], longitude) or not math.isclose(tiepoint[4], latitude + 1):
        raise ValueError(f"Unexpected tiepoint in {path}: {tiepoint}")


def build_dem(dem_dir: Path) -> tuple[np.ndarray, dict, list[dict]]:
    west_index, east_index = aligned_sample_range(REQUESTED_BOUNDS["west"], REQUESTED_BOUNDS["east"])
    south_index, north_index = aligned_sample_range(REQUESTED_BOUNDS["south"], REQUESTED_BOUNDS["north"])
    width = east_index - west_index + 1
    height = north_index - south_index + 1
    mosaic = np.full((height, width), np.nan, dtype=np.float64)
    sources = []

    for tile_id in TILE_IDS:
        path = dem_dir / f"{tile_id}.tif"
        if not path.is_file():
            raise FileNotFoundError(f"Missing source tile: {path}")
        longitude, latitude = tile_coordinates(tile_id)
        with Image.open(path) as image:
            verify_georeferencing(image, longitude, latitude, path)
            tile_west = longitude * TILE_SIZE
            tile_east = (longitude + 1) * TILE_SIZE - 1
            tile_south = latitude * TILE_SIZE
            tile_north = (latitude + 1) * TILE_SIZE - 1
            overlap_west = max(west_index, tile_west)
            overlap_east = min(east_index, tile_east)
            overlap_south = max(south_index, tile_south)
            overlap_north = min(north_index, tile_north)
            if overlap_west <= overlap_east and overlap_south <= overlap_north:
                left = overlap_west - tile_west
                right = overlap_east - tile_west + 1
                top = tile_north - overlap_north
                bottom = tile_north - overlap_south + 1
                output_left = overlap_west - west_index
                output_right = overlap_east - west_index + 1
                output_top = north_index - overlap_north
                output_bottom = north_index - overlap_south + 1
                mosaic[output_top:output_bottom, output_left:output_right] = np.asarray(
                    image.crop((left, top, right, bottom)), dtype=np.float64
                )
        sources.append({
            "id": tile_id,
            "url": tile_url(tile_id),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        })

    if not np.isfinite(mosaic).all():
        raise ValueError("DEM crop contains uncovered or nodata samples")
    decimetres = np.rint(mosaic * 10)
    if (decimetres < 0).any() or (decimetres > np.iinfo(np.uint16).max).any():
        raise ValueError("DEM crop cannot be represented as unsigned 16-bit decimetres")
    actual_bounds = {
        "west": (west_index + 0.5) / TILE_SIZE,
        "east": (east_index + 0.5) / TILE_SIZE,
        "north": (north_index + 0.5) / TILE_SIZE,
        "south": (south_index + 0.5) / TILE_SIZE,
    }
    return decimetres.astype("<u2"), actual_bounds, sources


def parse_lake(osm_path: Path) -> tuple[list[dict], dict]:
    root = ElementTree.parse(osm_path).getroot()
    nodes = {
        element.get("id"): (element.get("lon"), element.get("lat"))
        for element in root.findall("node")
    }
    ways = {
        element.get("id"): [node.get("ref") for node in element.findall("nd")]
        for element in root.findall("way")
    }
    relation = next(
        (element for element in root.findall("relation") if element.get("id") == str(OSM_RELATION_ID)),
        None,
    )
    if relation is None:
        raise ValueError(f"Snapshot does not contain OSM relation {OSM_RELATION_ID}")
    member_ids = [
        int(member.get("ref"))
        for member in relation.findall("member")
        if member.get("type") == "way" and member.get("role") == "outer"
    ]
    if member_ids != list(OSM_MEMBER_WAY_IDS):
        raise ValueError(f"Unexpected lake outer ways: {member_ids}")

    remaining = [ways[str(member_id)] for member_id in member_ids]
    ring = list(remaining.pop(0))
    while remaining:
        end = ring[-1]
        for index, way in enumerate(remaining):
            if way[0] == end or way[-1] == end:
                joined = remaining.pop(index)
                ring.extend((joined if joined[0] == end else list(reversed(joined)))[1:])
                break
        else:
            raise ValueError(f"Lake outer ways do not join at node {end}")
    if ring[0] != ring[-1]:
        raise ValueError("Lake outer ways do not form a closed ring")
    points = [{"lon": float(nodes[node_id][0]), "lat": float(nodes[node_id][1])} for node_id in ring[:-1]]
    tags = {tag.get("k"): tag.get("v") for tag in relation.findall("tag")}
    source = {
        "osmType": "relation",
        "osmId": OSM_RELATION_ID,
        "url": f"https://www.openstreetmap.org/relation/{OSM_RELATION_ID}",
        "snapshotUrl": OSM_SNAPSHOT_URL,
        "snapshotFile": "docs/changbai-references/osm-relation-11650508.xml",
        "snapshotSha256": sha256(osm_path),
        "version": int(relation.get("version")),
        "timestamp": relation.get("timestamp"),
        "memberWayIds": member_ids,
        "license": "Open Database License (ODbL) 1.0",
        "licenseUrl": "https://www.openstreetmap.org/copyright",
        "name": tags.get("name:zh", tags.get("name")),
    }
    return points, source


def points_inside_polygon(metadata: dict, points: list[dict]) -> np.ndarray:
    rows, columns = np.indices((metadata["height"], metadata["width"]))
    longitude = metadata["west"] + columns * (metadata["east"] - metadata["west"]) / (metadata["width"] - 1)
    latitude = metadata["north"] - rows * (metadata["north"] - metadata["south"]) / (metadata["height"] - 1)
    inside = np.zeros(longitude.shape, dtype=bool)
    previous = points[-1]
    for point in points:
        crosses = (point["lat"] > latitude) != (previous["lat"] > latitude)
        boundary = ((previous["lon"] - point["lon"]) * (latitude - point["lat"])
                    / (previous["lat"] - point["lat"] + np.finfo(float).eps) + point["lon"])
        inside ^= crosses & (longitude < boundary)
        previous = point
    return inside


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dem-dir", type=Path, required=True, help="directory containing the four TILE_ID.tif files")
    parser.add_argument("--osm", type=Path, required=True, help="OSM relation/full XML snapshot")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    output_dir = root / "src" / "data"
    reference_dir = root / "docs" / "changbai-references"
    output_dir.mkdir(parents=True, exist_ok=True)
    reference_dir.mkdir(parents=True, exist_ok=True)

    dem, actual_bounds, tiles = build_dem(args.dem_dir)
    points, lake_source = parse_lake(args.osm)
    metadata = {
        "width": int(dem.shape[1]),
        "height": int(dem.shape[0]),
        **actual_bounds,
        "unit": "decimetres, unsigned 16-bit little-endian",
        "minElevation": float(dem.min()) / 10,
        "maxElevation": float(dem.max()) / 10,
        "source": {
            "dataset": "Copernicus DEM GLO-30",
            "product": "Copernicus_DSM_COG_10",
            "registryUrl": "https://registry.opendata.aws/copernicus-dem/",
            "resolution": "1 arc-second native samples",
            "tiles": tiles,
        },
        "limitations": "The lake surface contains DEM elevation samples and does not represent water depth or bathymetry.",
    }
    lake_mask = points_inside_polygon(metadata, points)
    lake_samples = dem[lake_mask]
    if lake_samples.size == 0:
        raise ValueError("OSM shoreline contains no DEM sample centers")
    metadata["lakeElevation"] = float(np.median(lake_samples)) / 10

    dem_path = output_dir / "changbai-dem.bin"
    metadata_path = output_dir / "changbai-dem.json"
    lake_path = output_dir / "changbai-lake.json"
    snapshot_path = reference_dir / "osm-relation-11650508.xml"
    dem_path.write_bytes(dem.tobytes(order="C"))
    write_json(metadata_path, metadata)
    write_json(lake_path, {
        "source": lake_source,
        "points": points,
        "closure": "Implicit: connect the last point to the first; the first point is not repeated.",
    })
    if args.osm.resolve() != snapshot_path.resolve():
        shutil.copyfile(args.osm, snapshot_path)

    manifest = {
        "schemaVersion": 1,
        "dem": {
            "dataset": metadata["source"]["dataset"],
            "product": metadata["source"]["product"],
            "registryUrl": metadata["source"]["registryUrl"],
            "requestedCrop": REQUESTED_BOUNDS,
            "actualPixelCenterBounds": actual_bounds,
            "tiles": tiles,
            "sourceFilesStoredInRepository": False,
        },
        "osm": lake_source,
        "outputs": {
            "src/data/changbai-dem.bin": {"sha256": sha256(dem_path), "bytes": dem_path.stat().st_size},
            "src/data/changbai-dem.json": {"sha256": sha256(metadata_path), "bytes": metadata_path.stat().st_size},
            "src/data/changbai-lake.json": {"sha256": sha256(lake_path), "bytes": lake_path.stat().st_size},
            "docs/changbai-references/osm-relation-11650508.xml": {
                "sha256": sha256(snapshot_path),
                "bytes": snapshot_path.stat().st_size,
            },
        },
        "processing": [
            "Crop native 1 arc-second pixel centers without resampling.",
            "Round source floating-point elevations to the nearest decimetre and write north-to-south rows.",
            "Calculate lakeElevation as the median stored DEM sample whose center lies inside the OSM shoreline.",
        ],
    }
    write_json(reference_dir / "manifest.json", manifest)


if __name__ == "__main__":
    main()
