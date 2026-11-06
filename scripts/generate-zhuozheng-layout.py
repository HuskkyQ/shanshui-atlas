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
CONTEXT_BUILDING_IDS = {
    "daishuang-pavilion": ("485084799", "待霜亭", "pavilion"),
    "yiyu-hall": ("508113066", "倚玉轩", "hall"),
    "xiaocanglang": ("485084763", "小沧浪", "hall"),
    "lvyi-pavilion": ("485084752", "绿漪亭", "pavilion"),
    "linglong-hall": ("508113051", "玲珑馆", "hall"),
    "xiuqi-pavilion": ("508113052", "绣绮亭", "pavilion"),
    "jiashi-pavilion": ("508113045", "嘉实亭", "pavilion"),
    "dezhen-pavilion": ("508113041", "得真亭", "pavilion"),
}
COVERED_AREA_IDS = ("508113054", "508113063", "508113048", "508113037")
GROUND_AREA_IDS = ("508112874", "508112958", "508112961", "508112963", "508139034", "508112892", "508112959", "508139023")
VEGETATION_CLUSTER_IDS = (
    "508112875", "508112876", "508112877", "508112878", "508112879", "508112880",
    "508112943", "508112944", "508139018", "508139020", "508139021", "508138988",
    "508138989", "508138990", "508112947", "508139012",
    "508112887", "508112888", "508112899", "508112900", "508112901", "508112930",
    "508112941", "508112942", "508112945", "508112946", "508112949", "508112950",
    "508112951", "508112952", "508112953", "508112962", "508138991", "508138992",
    "508138993", "508139015", "508139024", "508139025", "508139032", "508139033",
    "508139035", "508142250",
)


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


def unique_ring(points):
    ring = []
    for point in points:
        rounded = [round(point[0], 3), round(point[1], 3)]
        if not ring or ring[-1] != rounded:
            ring.append(rounded)
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring.pop()
    return ring


def clip_polygon(points):
    """Clip one polygon ring to the rectangular display crop without filling concavities."""
    ring = unique_ring(points)
    minx, maxx, minz, maxz = CROP

    def inside(point, axis, bound, keep_greater):
        return point[axis] >= bound - 1e-9 if keep_greater else point[axis] <= bound + 1e-9

    def intersection(a, b, axis, bound):
        delta = b[axis] - a[axis]
        if abs(delta) < 1e-12:
            return [bound if axis == 0 else a[0], bound if axis == 1 else a[1]]
        t = (bound - a[axis]) / delta
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

    for axis, bound, keep_greater in ((0, minx, True), (0, maxx, False), (1, minz, True), (1, maxz, False)):
        output = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            a_inside, b_inside = inside(a, axis, bound, keep_greater), inside(b, axis, bound, keep_greater)
            if a_inside and b_inside:
                output.append(b)
            elif a_inside:
                output.append(intersection(a, b, axis, bound))
            elif b_inside:
                output.extend((intersection(a, b, axis, bound), b))
        ring = unique_ring(output)
        if len(ring) < 3:
            return []
    return ring + [ring[0]] if abs(ring_area(ring)) > 1e-6 else []


def self_test():
    # Leaving and re-entering the crop must produce separate segments.
    segments = clipped_segments([[0, 0], [10, 0], [160, 0], [160, 50], [0, 40]])
    assert len(segments) == 2 and all(len(s) >= 2 for s in segments)
    assert segments[0][-1] != segments[1][0]
    concave = clip_polygon([[0, 0], [20, 0], [20, 20], [10, 10], [0, 20]])
    assert len(concave) == 6 and concave[0] == concave[-1] and [10, 10] in concave


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

    def clipped_area(wid, kind):
        w = ways[wid]
        outline = clip_polygon(w["local"])
        assert outline, f"{wid} has no area inside the display crop"
        return {"key": f"osm-way-{wid}", "outline": outline, "source": source(kind, wid, w["wgs"])}

    context_buildings = []
    for key, (wid, name, typ) in CONTEXT_BUILDING_IDS.items():
        area = clipped_area(wid, "OSM building footprint clipped to central display crop")
        pos, width, depth, rotation = oriented_box(area["outline"])
        context_buildings.append({"key": key, "name": name, "position": [pos[0], 0.0, pos[1]], "width": width, "depth": depth, "rotation": rotation, "outline": area["outline"], "type": typ, "source": area["source"], "dimensionsAccuracy": "artistic-approximation"})
    assert all(ways[wid]["tags"].get("building") == "roof" for wid in COVERED_AREA_IDS)
    assert all(ways[wid]["tags"].get("area") == "yes" and ways[wid]["tags"].get("highway") == "pedestrian" for wid in GROUND_AREA_IDS)
    assert all(ways[wid]["tags"].get("natural") == "wood" for wid in VEGETATION_CLUSTER_IDS)
    covered_areas = [clipped_area(wid, "OSM building=roof footprint clipped to central display crop") for wid in COVERED_AREA_IDS]
    ground_areas = [clipped_area(wid, "OSM area=yes highway=pedestrian footprint clipped to central display crop") for wid in GROUND_AREA_IDS]
    vegetation_clusters = [clipped_area(wid, "OSM natural=wood footprint clipped to central display crop") for wid in VEGETATION_CLUSTER_IDS]

    paths = []
    for wid, w in ways.items():
        tags = w["tags"]
        if wid == bridge_id or not (tags.get("highway") in PATH_TAGS or tags.get("bridge") == "yes"):
            continue
        for n, points in enumerate(clipped_segments(w["local"])):
            paths.append({"key": f"osm-way-{wid}" + (f"-segment-{n + 1}" if n else ""), "points": points, "kind": "bridge" if tags.get("bridge") == "yes" else tags.get("highway", "footway"), "source": source("OSM path clipped to central display crop", wid, w["wgs"]), "crop": list(CROP)})
    paths.insert(0, {"key": "osm-way-485084818", "points": [a, b], "kind": "bridge", "source": source("OSM bridge line", bridge_id, bridge_way["wgs"]), "crop": list(CROP)})
    data = {"metadata": {"origin": list(ORIGIN), "bounds": {"minX": CROP[0], "maxX": CROP[1], "minZ": CROP[2], "maxZ": CROP[3]}, "coordinateSystem": "local metres; x east, z south; y up", "source": "OpenStreetMap main API map endpoint", "sourceURL": SOURCE_URL, "osmBbox": list(BBOX), "retrieved": "2026-10-05", "crop": "central display crop; paths are clipped to this rectangle", "accuracy": "WGS84 OSM geometry converted to local display metres; footprints retain source geometry; island heights, building dimensions and Xiaofeihong depth are artistic approximations; not surveyed"}, "ponds": ponds, "islands": islands, "buildings": buildings, "contextBuildings": context_buildings, "coveredAreas": covered_areas, "groundAreas": ground_areas, "vegetationClusters": vegetation_clusters, "paths": paths}
    assert len(buildings) == 7 and len(islands) == 2 and len(ponds) == 4
    assert len(context_buildings) == 8 and len(covered_areas) == 4 and len(ground_areas) == 8 and len(vegetation_clusters) == 42
    assert all(CROP[0] <= p[0] <= CROP[1] and CROP[2] <= p[1] <= CROP[3] for path in paths for p in path["points"])
    assert all(CROP[0] <= p[0] <= CROP[1] and CROP[2] <= p[1] <= CROP[3] for area in [*context_buildings, *covered_areas, *ground_areas, *vegetation_clusters] for p in area["outline"])
    assert abs(buildings[-1]["width"] - 9.0) < 1.0 and any(abs(b["rotation"]) > 0.05 for b in buildings)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
