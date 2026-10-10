#!/usr/bin/env python3
"""Regenerate the central Zhuozheng layout from the reviewed OSM XML.

This deliberately keeps the artistic display dimensions separate from the
WGS84 geometry.  It is a small, deterministic converter rather than a survey
tool: OSM footprints are retained, then projected to local east/south metres.
"""
from __future__ import annotations

import argparse
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

ORIGIN = (120.6235, 31.3262)
BBOX = (120.622, 31.3245, 120.628, 31.328)
SOURCE_URL = "https://api.openstreetmap.org/api/0.6/map?bbox=120.622,31.3245,120.628,31.328"
CROP = (4.0, 152.0, -81.0, 44.0)
BUILDING_IDS = {
    "yuanxiang-hall": ("485084803", "远香堂", "hall"),
    "xuexiang-pavilion": ("485084802", "雪香云蔚亭", "pavilion"),
    "hefeng-pavilion": ("485084751", "荷风四面亭", "hexagonal-pavilion"),
    "xiangzhou": ("485084785", "香洲", "boat-hall"),
    "wuzhu-pavilion": ("508113044", "梧竹幽居", "pavilion"),
    "jianshan-lou": ("485084793", "见山楼", "multi-storey-pavilion"),
}
WATER_WAYS = ("508112956", "508113046", "508113053")
PATH_TAGS = {"footway", "path", "steps", "pedestrian"}


def project(lon: float, lat: float) -> list[float]:
    x = (lon - ORIGIN[0]) * 111320.0 * math.cos(math.radians(ORIGIN[1]))
    z = -(lat - ORIGIN[1]) * 110540.0
    return [round(x, 3), round(z, 3)]


def ring_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def convex_hull(points):
    pts = sorted(set((p[0], p[1]) for p in points))
    if len(pts) <= 2:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo = []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    hi = []
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def oriented_box(points):
    """Return centroid, width, depth, and Three.js y rotation from polygon edges."""
    hull = convex_hull(points)
    best = None
    for a, b in zip(hull, hull[1:] + hull[:1]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz)
        if length < 1e-6:
            continue
        ux, uz = dx / length, dz / length
        vx, vz = -uz, ux
        us = [p[0] * ux + p[1] * uz for p in hull]
        vs = [p[0] * vx + p[1] * vz for p in hull]
        width, depth = max(us) - min(us), max(vs) - min(vs)
        area = width * depth
        if best is None or area < best[0]:
            # local x follows the long edge; local z follows its perpendicular
            angle = math.atan2(-uz, ux)
            center_u = (min(us) + max(us)) / 2
            center_v = (min(vs) + max(vs)) / 2
            center = [center_u * ux + center_v * vx, center_u * uz + center_v * vz]
            best = (area, width, depth, angle, center)
    if best is None:
        raise ValueError("footprint has no usable edge")
    _, width, depth, angle, center = best
    if width < depth:
        width, depth = depth, width
        angle += math.pi / 2
    return [round(center[0], 3), round(center[1], 3)], round(width, 2), round(depth, 2), round(angle, 4)


def clip_segment(a, b):
    minx, maxx, minz, maxz = CROP
    dx, dz = b[0] - a[0], b[1] - a[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, a[0] - minx), (dx, maxx - a[0]), (-dz, a[1] - minz), (dz, maxz - a[1])):
        if abs(p) < 1e-12:
            if q < 0:
                return None
        else:
            t = q / p
            if p < 0:
                if t > t1: return None
                t0 = max(t0, t)
            else:
                if t < t0: return None
                t1 = min(t1, t)
    return [[round(a[0] + t0 * dx, 3), round(a[1] + t0 * dz, 3)], [round(a[0] + t1 * dx, 3), round(a[1] + t1 * dz, 3)]]


def clipped_segments(points):
    segments = []
    current = []
    for a, b in zip(points, points[1:]):
        part = clip_segment(a, b)
        if part is None:
            if len(current) >= 2: segments.append(current)
            current = []
            continue
        if current and current[-1] != part[0]:
            if len(current) >= 2: segments.append(current)
            current = []
        if not current: current = [part[0]]
        current.append(part[1])
    if len(current) >= 2: segments.append(current)
    return segments


def self_test():
    # Leaving and re-entering the crop must produce separate segments.
    segments = clipped_segments([[0, 0], [10, 0], [160, 0], [160, 50], [0, 40]])
    assert len(segments) == 2 and all(len(s) >= 2 for s in segments)
    assert segments[0][-1] != segments[1][0]


def main():
    self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=Path("docs/zhuozheng-layout-source.osm"))
    ap.add_argument("--output", type=Path, default=Path("src/data/zhuozheng-layout.json"))
    args = ap.parse_args()
    root = ET.parse(args.source).getroot()
    nodes = {n.attrib["id"]: (float(n.attrib["lon"]), float(n.attrib["lat"])) for n in root.findall("node")}
    ways = {}
    for way in root.findall("way"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        refs = [n.attrib["ref"] for n in way.findall("nd")]
        if all(ref in nodes for ref in refs):
            ways[way.attrib["id"]] = {"tags": tags, "wgs": [list(nodes[ref]) for ref in refs], "local": [project(*nodes[ref]) for ref in refs]}

    def source(kind, osm_id, wgs):
        return {"kind": kind, "osmId": osm_id, "sourceURL": SOURCE_URL, "wgs84": wgs}

    outer_id = "508113067"
    relation = next(r for r in root.findall("relation") if r.attrib["id"] == "7399712")
    members = {m.attrib["role"]: m.attrib["ref"] for m in relation.findall("member") if m.attrib.get("type") == "way"}
    assert members.get("outer") == outer_id and {m.attrib["ref"] for m in relation.findall("member") if m.attrib.get("role") == "inner"} == {"508113070", "508113071"}
    outer = ways[outer_id]
    holes = [ways[i] for i in ("508113071", "508113070")]
    ponds = [{"key": "central-pond", "outline": outer["local"], "holes": [h["local"] for h in holes], "source": source("OSM natural=water multipolygon outer", outer_id, outer["wgs"]), "holesSource": [source("OSM multipolygon inner island", h_id, ways[h_id]["wgs"]) for h_id in ("508113071", "508113070")] }]
    for wid in WATER_WAYS:
        w = ways[wid]
        ponds.append({"key": {"508112956": "small-water-courtyard-west", "508113046": "small-water-courtyard-center", "508113053": "small-water-courtyard-east"}[wid], "outline": w["local"], "holes": [], "source": source("OSM natural=water way", wid, w["wgs"])})

    islands = []
    for key, wid, height in (("west-island", "508113071", 0.85), ("east-island", "508113070", 1.15)):
        w = ways[wid]
        islands.append({"key": key, "outline": w["local"], "height": height, "heightAccuracy": "artistic-approximation", "source": source("OSM relation 7399712 inner island ring", wid, w["wgs"])})

    buildings = []
    for key, (wid, name, typ) in BUILDING_IDS.items():
        w = ways[wid]
        pos, width, depth, rotation = oriented_box(w["local"])
        y = 2.4 if key == "xuexiang-pavilion" else 0.0
        buildings.append({"key": key, "name": name, "position": [pos[0], y, pos[1]], "width": width, "depth": depth, "rotation": rotation, "outline": w["local"], "type": typ, "source": source("OSM building footprint; dimensions are display estimates", wid, w["wgs"]), "dimensionsAccuracy": "artistic-approximation"})
    bridge_id = "485084818"
    bridge_way = ways[bridge_id]
    a, b = bridge_way["local"][0], bridge_way["local"][-1]
    center = [round((a[0] + b[0]) / 2, 3), round((a[1] + b[1]) / 2, 3)]
    dx, dz = b[0] - a[0], b[1] - a[1]
    buildings.append({"key": "xiaofeihong", "name": "小飞虹", "position": [center[0], 0, center[1]], "width": round(math.hypot(dx, dz), 2), "depth": 2.2, "rotation": round(math.atan2(-dz, dx), 4), "outline": [a, b], "type": "covered-bridge", "source": source("OSM bridge endpoint line; depth artistic estimate", bridge_id, bridge_way["wgs"]), "dimensionsAccuracy": "width from OSM endpoints; depth artistic approximation"})

    paths = []
    for wid, w in ways.items():
        tags = w["tags"]
        if wid == bridge_id or not (tags.get("highway") in PATH_TAGS or tags.get("bridge") == "yes"):
            continue
        for n, points in enumerate(clipped_segments(w["local"])):
            paths.append({"key": f"osm-way-{wid}" + (f"-segment-{n + 1}" if n else ""), "points": points, "kind": "bridge" if tags.get("bridge") == "yes" else tags.get("highway", "footway"), "source": source("OSM path clipped to central display crop", wid, w["wgs"]), "crop": list(CROP)})
    paths.insert(0, {"key": "osm-way-485084818", "points": [a, b], "kind": "bridge", "source": source("OSM bridge line", bridge_id, bridge_way["wgs"]), "crop": list(CROP)})
    data = {"metadata": {"origin": list(ORIGIN), "bounds": {"minX": CROP[0], "maxX": CROP[1], "minZ": CROP[2], "maxZ": CROP[3]}, "coordinateSystem": "local metres; x east, z south; y up", "source": "OpenStreetMap main API map endpoint", "sourceURL": SOURCE_URL, "osmBbox": list(BBOX), "retrieved": "2026-10-05", "crop": "central display crop; paths are clipped to this rectangle", "accuracy": "WGS84 OSM geometry converted to local display metres; footprints retain source geometry; island heights, building dimensions and Xiaofeihong depth are artistic approximations; not surveyed"}, "ponds": ponds, "islands": islands, "buildings": buildings, "paths": paths}
    assert len(buildings) == 7 and len(islands) == 2 and len(ponds) == 4
    assert all(CROP[0] <= p[0] <= CROP[1] and CROP[2] <= p[1] <= CROP[3] for path in paths for p in path["points"])
    assert abs(buildings[-1]["width"] - 9.0) < 1.0 and any(abs(b["rotation"]) > 0.05 for b in buildings)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
