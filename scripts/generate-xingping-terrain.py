"""Generate bounded Xingping research terrain and source water geometry.

The DEM is a 1-arc-second Copernicus DSM crop. Water polygons are copied from
OSM multipolygon relations; river centerlines remain separate evidence and are
never buffered into an invented shoreline.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
import rasterio
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

BOUNDS = {"west": 110.45, "east": 110.56, "south": 24.90, "north": 24.96}
TILE_URL = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N24_00_E110_00_DEM/Copernicus_DSM_COG_10_N24_00_E110_00_DEM.tif"
OSM_URL = "https://api.openstreetmap.org/api/0.6/map?bbox=110.45,24.90,110.56,24.96"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_dem(source: Path, out_bin: Path, out_json: Path) -> None:
    with rasterio.open(source) as ds:
        # Select native pixel centres whose centres fall inside the requested bounds.
        resx, resy = abs(ds.transform.a), abs(ds.transform.e)
        assert ds.crs and ds.crs.to_epsg() == 4326 and np.isclose(resx, 1 / 3600) and np.isclose(resy, 1 / 3600)
        col0 = int(np.ceil((BOUNDS["west"] - ds.transform.c) / resx - 0.5))
        col1 = int(np.floor((BOUNDS["east"] - ds.transform.c) / resx - 0.5 - 1e-9))
        row0 = int(np.ceil((ds.transform.f - BOUNDS["north"]) / resy - 0.5))
        row1 = int(np.floor((ds.transform.f - BOUNDS["south"]) / resy - 0.5 - 1e-9))
        width, height = col1 - col0 + 1, row1 - row0 + 1
        data = ds.read(1, window=((row0, row0 + height), (col0, col0 + width)), boundless=False)
        assert data.shape == (height, width) and np.isfinite(data).all()
        transform = ds.transform * rasterio.Affine.translation(col0, row0)
        west = float(transform.c + transform.a * 0.5)
        east = float(transform.c + transform.a * (width - 0.5))
        north = float(transform.f + transform.e * 0.5)
        south = float(transform.f + transform.e * (height - 0.5))
        decimetres_float = np.rint(data * 10)
        assert (decimetres_float >= 0).all() and (decimetres_float <= 65535).all()
        decimetres = decimetres_float.astype('<u2')
        out_bin.parent.mkdir(parents=True, exist_ok=True)
        decimetres.tofile(out_bin)
        payload = {
            "width": width, "height": height, "west": west, "east": east,
            "north": north, "south": south,
            "unit": "decimetres, unsigned 16-bit little-endian",
            "encoding": "uint16le-decimetres",
            "minElevation": float(decimetres.min() / 10), "maxElevation": float(decimetres.max() / 10),
            "rawMinElevation": float(data.min()), "rawMaxElevation": float(data.max()),
            "source": {
                "dataset": "Copernicus DEM GLO-30", "product": "Copernicus_DSM_COG_10",
                "resolution": "1 arc-second native samples", "url": TILE_URL,
                "tileSha256": sha256(source), "tileBytes": source.stat().st_size,
                "verticalDatum": "EGM2008", "researchWindow": BOUNDS,
            },
            "limitations": "DSM surface values include vegetation/buildings and are not bare-ground, riverbed, bathymetry, or measured water level.",
        }
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def collect_water(osm_paths, out_path: Path) -> None:
    roots = [ET.parse(p).getroot() for p in osm_paths]
    nodes = {}; ways = {}; tags_by_way = {}; relations = {}
    for root in roots:
        nodes.update({n.get("id"): {"lon": float(n.get("lon")), "lat": float(n.get("lat"))} for n in root.findall("node")})
        ways.update({w.get("id"): [n.get("ref") for n in w.findall("nd")] for w in root.findall("way")})
        tags_by_way.update({w.get("id"): {t.get("k"): t.get("v") for t in w.findall("tag")} for w in root.findall("way")})
        relations.update({r.get("id"): r for r in root.findall("relation")})

    def ring_for(ids, relation_id):
        missing = [str(i) for i in ids if str(i) not in ways]
        if missing: raise ValueError(f"relation {relation_id} missing way members: {missing}")
        remaining = [list(ways[str(i)]) for i in ids]
        rings = []
        while remaining:
            ring = remaining.pop(0)
            if ring[0] != ring[-1]:
                while True:
                    end = ring[-1]
                    found = next((i for i, candidate in enumerate(remaining) if candidate[0] == end or candidate[-1] == end), None)
                    if found is None: raise ValueError(f"relation {relation_id} has an unclosed ring")
                    candidate = remaining.pop(found)
                    if candidate[-1] == end: candidate = list(reversed(candidate))
                    ring.extend(candidate[1:])
                    if ring[0] == ring[-1]: break
            if len(ring) >= 4 and ring[0] == ring[-1]:
                rings.append([nodes[n] for n in ring[:-1]])
        return rings

    polygons = []
    for rel in relations.values():
        rel_tags = {t.get("k"): t.get("v") for t in rel.findall("tag")}
        if rel_tags.get("type") != "multipolygon" or rel_tags.get("natural") != "water": continue
        members = [(m.get("role"), m.get("ref")) for m in rel.findall("member") if m.get("type") == "way"]
        if rel.get("id") not in ("13773143", "14524060"): continue
        outer = ring_for([ref for role, ref in members if role == "outer"], rel.get("id"))
        holes = ring_for([ref for role, ref in members if role == "inner"], rel.get("id"))
        def inside(point, ring):
            x, y = point["lon"], point["lat"]; hit = False
            for a, b in zip(ring, ring[1:] + ring[:1]):
                if (a["lat"] > y) != (b["lat"] > y) and x < (b["lon"]-a["lon"]) * (y-a["lat"]) / (b["lat"]-a["lat"]) + a["lon"]: hit = not hit
            return hit
        for index, ring in enumerate(outer):
            contained = [hole for hole in holes if inside(hole[0], ring)]
            polygons.append({"id": f"{rel.get('id')}-outer-{index}", "relationId": rel.get("id"), "outer": ring, "holes": contained, "source": {"osmType": "relation", "osmId": int(rel.get("id")), "url": f"https://www.openstreetmap.org/relation/{rel.get('id')}", "tags": rel_tags}})

    centerlines = []
    for way_id in ("238015554", "52252726"):
        assert way_id in ways and all(n in nodes for n in ways[way_id])
        pts = [nodes[n] for n in ways[way_id]]
        centerlines.append({"id": way_id, "points": pts, "tags": tags_by_way[way_id]})
    assert centerlines[0]["points"][-1] == centerlines[1]["points"][0]
    display = []
    dem_bounds = json.loads(out_path.with_name("xingping-dem.json").read_text())
    clip = box(dem_bounds["west"], dem_bounds["south"], dem_bounds["east"], dem_bounds["north"])
    for p in polygons:
        geom = Polygon([(x["lon"], x["lat"]) for x in p["outer"]], [[(x["lon"], x["lat"]) for x in h] for h in p["holes"]]).intersection(clip)
        for part in ([geom] if geom.geom_type == "Polygon" else list(geom.geoms) if geom.geom_type == "MultiPolygon" else []):
            display.append({"id": p["id"], "relationId": p["relationId"], "outer": [{"lon": x, "lat": y} for x, y in list(part.exterior.coords)[:-1]], "holes": [[{"lon": x, "lat": y} for x, y in list(h.coords)[:-1]] for h in part.interiors], "source": p["source"]})
    snapshots = [{"path": p.name, "sha256": sha256(p), "bytes": p.stat().st_size,
                  "retrieved": "2026-10-23" if i == 0 else "2026-10-31",
                  "url": OSM_URL if i == 0 else f"https://api.openstreetmap.org/api/0.6/relation/{p.stem.split('-')[-1]}/full"}
                 for i, p in enumerate(osm_paths)]
    result = {"source": {"dataset": "OpenStreetMap", "snapshot": [p.name for p in osm_paths], "sha256": [sha256(p) for p in osm_paths], "bytes": [p.stat().st_size for p in osm_paths], "retrieved": "2026-10-31", "snapshots": snapshots, "url": OSM_URL, "license": "Open Database License (ODbL) 1.0", "researchBounds": BOUNDS}, "polygons": polygons, "displayPolygons": display, "centerlines": centerlines, "limitations": {"bathymetry": False, "normalShoreline": False, "flowVelocity": False, "note": "Water polygons are mapped multipolygon evidence and do not establish a date-specific shoreline or riverbed."}}
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


def add_display_water_elevation(out_dir: Path) -> None:
    dem_meta_path = out_dir / "xingping-dem.json"
    water_path = out_dir / "xingping-water.json"
    dem = json.loads(dem_meta_path.read_text())
    water = json.loads(water_path.read_text())
    shapes = []
    for p in water["displayPolygons"]:
        shapes.append(Polygon([(x["lon"], x["lat"]) for x in p["outer"]], [[(x["lon"], x["lat"]) for x in h] for h in p["holes"]]))
    union = unary_union(shapes)
    values = np.fromfile(out_dir / "xingping-dem.bin", dtype="<u2").reshape(dem["height"], dem["width"])
    samples = []
    dx = (dem["east"] - dem["west"]) / (dem["width"] - 1)
    dy = (dem["north"] - dem["south"]) / (dem["height"] - 1)
    for row in range(dem["height"]):
        lat = dem["north"] - row * dy
        for col in range(dem["width"]):
            lon = dem["west"] + col * dx
            if union.contains(Point(lon, lat)): samples.append(int(values[row, col]))
    if not samples: raise ValueError("display water polygons contain no DEM samples")
    median = round(float(np.median(samples)) / 10, 1)
    water["waterElevation"] = {"value": median, "unit": "m", "datum": dem["source"]["verticalDatum"], "displayOnly": True, "method": "median of DEM pixels whose centres fall inside mapped display polygons"}
    dem["waterElevation"] = water["waterElevation"]
    dem_meta_path.write_text(json.dumps(dem, ensure_ascii=False, indent=2) + "\n")
    water_path.write_text(json.dumps(water, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dem", type=Path, required=True)
    parser.add_argument("--osm", type=Path, required=True)
    parser.add_argument("--water-relation", type=Path, action="append", required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("src/data"))
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    read_dem(args.dem, args.out_dir / "xingping-dem.bin", args.out_dir / "xingping-dem.json")
    collect_water([args.osm, *args.water_relation], args.out_dir / "xingping-water.json")
    add_display_water_elevation(args.out_dir)


if __name__ == "__main__": main()
