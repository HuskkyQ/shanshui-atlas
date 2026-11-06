#!/usr/bin/env python3
"""Generate the sourced, walkable Zhouzhuang old-town skeleton."""
from __future__ import annotations

import argparse
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

ORIGIN = (120.8458221, 31.1163909)
STREET_Y = 2.1
SOURCE_OSM = "docs/zhouzhuang-references/zhouzhuang-osm-2026-10-20.osm.xml"
SOURCE_STUDY = "docs/zhouzhuang-followup-study-2026-10-21.md"
BOUNDS = {"minX": -460.0, "maxX": 360.0, "minZ": -650.0, "maxZ": 690.0}
WATER_SOURCE_OSM = "docs/zhouzhuang-references/zhouzhuang-water-relation-62435-2026-10-22.osm.xml"
NORTH_SOURCE_OSM = "docs/zhouzhuang-references/zhouzhuang-north-extension-2026-10-22.osm.xml"
WALKABLE_HIGHWAYS = {"footway", "pedestrian", "path", "service", "alley", "residential", "living_street", "unclassified"}
ORIGINAL_BRIDGES = {
    "287819684": {"id": "shide-bridge", "name": "世德桥", "type": "arch", "width": 3.0, "openingSpan": 5.9, "nameConfidence": "cross-source-match", "typeConfidence": "photo-confirmed"},
    "608391000": {"id": "yongan-bridge", "name": "永安桥", "type": "beam", "width": 2.4, "openingSpan": 3.5, "nameConfidence": "cross-source-match", "typeConfidence": "photo-confirmed"},
    "608673062": {"id": "taiping-bridge-candidate", "name": "太平桥候选", "type": "arch", "width": 2.4, "openingSpan": 5.6, "nameConfidence": "candidate-not-confirmed-by-osm", "typeConfidence": "photo-guided-candidate"},
}
ORIGINAL_PROFILES = {
    "287819684": {"rise": 2.0, "segments": 10},
    "608391000": {"rise": 0.65, "segments": 6, "flat_top": True},
    "608673062": {"rise": 1.4, "segments": 8},
    # OSM way covers the bridge span, while the official 17.4m length includes approaches.
    "608390993": {"rise": 0.8, "segments": 6, "flat_top": True},
}
ORIGINAL_ROAD_WIDTHS = {"287819684": 3.0, "608391000": 2.4, "608673062": 2.4, "608390993": 3.8}
ROAD_WIDTHS = {"287819687": 3.8, "287819694": 2.5, "287819690": 2.5}


def project(lon: float, lat: float) -> dict[str, float]:
    return {"x": (lon - ORIGIN[0]) * 111320.0 * math.cos(math.radians(ORIGIN[1])), "z": (ORIGIN[1] - lat) * 110540.0}


def inside(p: dict[str, float]) -> bool:
    return BOUNDS["minX"] <= p["x"] <= BOUNDS["maxX"] and BOUNDS["minZ"] <= p["z"] <= BOUNDS["maxZ"]


def distance(a: dict[str, float], b: dict[str, float]) -> float:
    return math.hypot(a["x"] - b["x"], a["z"] - b["z"])


def clip_line(refs: list[str], projected: dict[str, dict[str, float]], way_id: str) -> tuple[list[str], list[dict[str, float]]]:
    """Clip a line to the fixed bbox with stable synthetic boundary IDs."""
    runs: list[tuple[list[str], list[dict[str, float]]]] = []
    out_refs: list[str] = []
    out_points: list[dict[str, float]] = []
    for index, (ra, rb) in enumerate(zip(refs, refs[1:])):
        a, b = projected[ra], projected[rb]
        candidates = [(0.0, a), (1.0, b)]
        dx, dz = b["x"] - a["x"], b["z"] - a["z"]
        for axis, low, high in (("x", BOUNDS["minX"], BOUNDS["maxX"]), ("z", BOUNDS["minZ"], BOUNDS["maxZ"])):
            delta = dx if axis == "x" else dz
            start = a[axis]
            if abs(delta) < 1e-12:
                continue
            for value, edge in ((low, "low"), (high, "high")):
                t = (value - start) / delta
                if 0 < t < 1:
                    candidates.append((t, {"x": a["x"] + dx * t, "z": a["z"] + dz * t}))
        candidates.sort(key=lambda item: item[0])
        for (ta, pa), (tb, pb) in zip(candidates, candidates[1:]):
            mid = {"x": (pa["x"] + pb["x"]) / 2, "z": (pa["z"] + pb["z"]) / 2}
            if not inside(mid):
                continue
            start_id = ra if ta == 0 else f"clip:{way_id}:{index}:{ta:.6f}"
            end_id = rb if tb == 1 else f"clip:{way_id}:{index}:{tb:.6f}"
            if out_refs and out_refs[-1] != start_id:
                runs.append((out_refs, out_points)); out_refs, out_points = [], []
            if not out_refs or out_refs[-1] != start_id:
                out_refs.append(start_id); out_points.append({"x": round(pa["x"], 3), "z": round(pa["z"], 3)})
            if out_refs[-1] != end_id:
                out_refs.append(end_id); out_points.append({"x": round(pb["x"], 3), "z": round(pb["z"], 3)})
    if out_refs: runs.append((out_refs, out_points))
    if not runs: return [], []
    return max(runs, key=lambda run: sum(distance(a, b) for a, b in zip(run[1], run[1][1:])))


def bridge_points(a: dict[str, float], b: dict[str, float], rise: float, segments: int, flat_top: bool = False) -> list[dict[str, float]]:
    def height(t):
        return STREET_Y + rise * (min(1, t * 3, (1 - t) * 3) if flat_top else math.sin(math.pi * t))
    return [{"x": round(a["x"] + (b["x"] - a["x"]) * i / segments, 3), "y": round(height(i / segments), 3), "z": round(a["z"] + (b["z"] - a["z"]) * i / segments, 3)} for i in range(segments + 1)]


def segment_intersection(a, b, c, d):
    denominator = (b["x"] - a["x"]) * (d["z"] - c["z"]) - (b["z"] - a["z"]) * (d["x"] - c["x"])
    if abs(denominator) < 1e-9: return None
    t = ((c["x"] - a["x"]) * (d["z"] - c["z"]) - (c["z"] - a["z"]) * (d["x"] - c["x"])) / denominator
    u = ((c["x"] - a["x"]) * (b["z"] - a["z"]) - (c["z"] - a["z"]) * (b["x"] - a["x"])) / denominator
    if 0 <= t <= 1 and 0 <= u <= 1:
        return {"x": round(a["x"] + t * (b["x"] - a["x"]), 3), "z": round(a["z"] + t * (b["z"] - a["z"]), 3)}
    return None


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--source", type=Path, default=Path(SOURCE_OSM)); parser.add_argument("--output", type=Path, default=Path("src/data/zhouzhuang-layout.json")); args = parser.parse_args()
    root = ET.parse(args.source).getroot()
    north_root = ET.parse(Path(NORTH_SOURCE_OSM)).getroot()
    nodes = {n.attrib["id"]: (float(n.attrib["lon"]), float(n.attrib["lat"])) for n in root.findall("node")}
    # The original snapshot owns all existing anchors.  The north extension
    # contributes only missing nodes, so the double-bridge frame cannot drift.
    for node in north_root.findall("node"):
        nodes.setdefault(node.attrib["id"], (float(node.attrib["lon"]), float(node.attrib["lat"])))
    projected = {node_id: project(*wgs) for node_id, wgs in nodes.items()}
    ways: dict[str, dict] = {}
    for way in root.findall("way"):
        refs = [n.attrib["ref"] for n in way.findall("nd")]
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        if refs and all(ref in nodes for ref in refs): ways[way.attrib["id"]] = {"refs": refs, "tags": tags}
    for way in north_root.findall("way"):
        if way.attrib["id"] in ways: continue
        refs = [n.attrib["ref"] for n in way.findall("nd")]
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        if refs and all(ref in nodes for ref in refs): ways[way.attrib["id"]] = {"refs": refs, "tags": tags}

    selected = []
    for way_id, way in ways.items():
        tags, refs = way["tags"], way["refs"]
        pts = [projected[r] for r in refs]
        if tags.get("highway") in WALKABLE_HIGHWAYS and any(inside(p) for p in pts):
            if tags.get("access") in {"private", "no", "customers"} or tags.get("service") == "parking_aisle": continue
            selected.append((way_id, way, False))
    # All mapped bridge=yes ways in the walking set become explicit bridge entries.
    for index, (way_id, way, _) in enumerate(selected):
        selected[index] = (way_id, way, way["tags"].get("bridge") == "yes")

    roads = []
    for way_id, way, is_bridge in selected:
        refs, points2d = clip_line(way["refs"], projected, way_id)
        if len(refs) < 2: continue
        source_points2d = list(points2d)
        if is_bridge and way_id in ORIGINAL_PROFILES:
            # The three established bridges retain their original two endpoint controls and profiles.
            refs = way["refs"]
            source_points2d = [projected[ref] for ref in refs]
            points = bridge_points(projected[refs[0]], projected[refs[-1]], **ORIGINAL_PROFILES[way_id])
        else:
            if is_bridge:
                # Schematic bridges use a stable five-sample deck profile;
                # their source way still controls the exact endpoints.
                if len(points2d) < 3:
                    points = bridge_points(points2d[0], points2d[-1], 0.35, 4)
                else:
                    dense = []
                    for a, b in zip(points2d, points2d[1:]):
                        if not dense: dense.append(a)
                        dense.append({"x": (a["x"] + b["x"]) / 2, "z": (a["z"] + b["z"]) / 2})
                        dense.append(b)
                    points2d = dense
                    path = sum(distance(a, b) for a, b in zip(points2d, points2d[1:])) or 1
                    walked = 0.0
                    points = [{**p, "y": round(STREET_Y + 0.35 * math.sin(math.pi * (walked / path)), 3)} for i, p in enumerate(points2d) for walked in [sum(distance(a, b) for a, b in zip(points2d[:i], points2d[1:i + 1]))]]
            else:
                points = [{**p, "y": STREET_Y} for p in points2d]
        node_source = source_points2d
        roads.append({"id": way_id, "osmWayId": way_id, "kind": "bridge" if is_bridge else "street", "width": ORIGINAL_ROAD_WIDTHS.get(way_id, ROAD_WIDTHS.get(way_id, 2.2 if not is_bridge else 2.4)), "nodeIds": refs, "points": points, "nodePoints": [{"nodeId": ref, "x": round(p["x"], 3), "z": round(p["z"], 3)} for ref, p in zip(refs, node_source)], "widthAccuracy": "photo-guided-artistic-approximation"})

    channels = []
    legacy_channel_ids = {
        "99205653": ("main-canal-north", "main-canal-south"),
        "99211133": ("side-canal-east",),
        "99211134": ("side-canal-west",),
    }
    for way_id, way in ways.items():
        if way["tags"].get("waterway") not in {"canal", "stream"}: continue
        if not any(inside(projected[r]) for r in way["refs"]): continue
        source_refs = [way["refs"]]
        if way_id == "99205653" and "1147679967" in way["refs"]:
            junction = way["refs"].index("1147679967")
            # Keep the historical north/south labels used by the consumers:
            # north is the forward (negative-z) arm, south the reversed arm.
            source_refs = [way["refs"][junction:], list(reversed(way["refs"][:junction + 1]))]
        ids = legacy_channel_ids.get(way_id, (f"waterway-{way_id}",))
        for part_index, part_refs in enumerate(source_refs):
            refs, points = clip_line(part_refs, projected, f"{way_id}-{part_index}")
            if len(points) < 2: continue
            channel_id = ids[part_index] if part_index < len(ids) else f"waterway-{way_id}-{part_index}"
            channels.append({"id": channel_id, "width": 7.0 if way["tags"].get("waterway") == "canal" else 3.0, "points": points, "sourceWayId": way_id, "widthAccuracy": "visual-approximation"})

    # Record source-line crossings explicitly.  Only roads that approach a
    # water line without crossing its centre may receive a narrow land-path
    # correction band; real centre-line crossings remain unresolved footways.
    land_paths = []
    bank_correction_ids = {"287819694", "608390994", "608391002", "608665209", "608669703", "608673061", "1058431799", "1302689250"}
    for road in roads:
        if road["kind"] == "bridge": continue
        crossings = []
        near_water = False
        for channel in channels:
            for a, b in zip(road["points"], road["points"][1:]):
                for c, d in zip(channel["points"], channel["points"][1:]):
                    hit = segment_intersection(a, b, c, d)
                    if hit: crossings.append({"waterwayId": channel["sourceWayId"], "point": hit, "bridgeMapped": False})
                    # A close parallel segment is an approximated bank overlap.
                    if min(distance(a, c), distance(a, d), distance(b, c), distance(b, d)) < channel["width"] / 2 + road["width"] / 2: near_water = True
        if crossings: road["waterCrossings"] = crossings
        elif near_water or road["id"] in bank_correction_ids:
            land_paths.append({"roadId": road["id"], "sourceWayId": road["osmWayId"], "width": round(road["width"] + 0.6, 2), "points": [{"x": p["x"], "z": p["z"]} for p in road["points"]], "reason": "bank-overlap-correction; no source water-centre crossing"})

    water_areas = []
    for way_id, way in ways.items():
        if way["tags"].get("natural") != "water" or way["refs"][0] != way["refs"][-1]: continue
        points = [projected[r] for r in way["refs"]]
        if any(inside(p) for p in points): water_areas.append({"id": f"water-area-{way_id}", "sourceWayId": way_id, "points": [{"x": round(p["x"], 3), "z": round(p["z"], 3)} for p in points], "holes": []})
    # The separately downloaded relation supplies the large northern water
    # surface and its island holes; its loops are retained as source geometry.
    relation_root = ET.parse(Path(WATER_SOURCE_OSM)).getroot()
    relation_nodes = {n.attrib["id"]: project(float(n.attrib["lon"]), float(n.attrib["lat"])) for n in relation_root.findall("node")}
    relation_ways = {}
    for way in relation_root.findall("way"):
        refs = [n.attrib["ref"] for n in way.findall("nd")]
        if refs and all(ref in relation_nodes for ref in refs): relation_ways[way.attrib["id"]] = refs
    relation = next((rel for rel in relation_root.findall("relation") if rel.attrib["id"] == "62435"), None)
    if relation:
        outer_ref = next((m.attrib["ref"] for m in relation.findall("member") if m.attrib["role"] == "outer"), None)
        holes = [relation_ways[m.attrib["ref"]] for m in relation.findall("member") if m.attrib["role"] == "inner" and m.attrib["ref"] in relation_ways]
        if outer_ref in relation_ways:
            water_areas.append({"id": "water-relation-62435", "sourceRelationId": "62435", "sourceWayId": outer_ref, "points": [{"x": round(relation_nodes[r]["x"], 3), "z": round(relation_nodes[r]["z"], 3)} for r in relation_ways[outer_ref]], "holes": [[{"x": round(relation_nodes[r]["x"], 3), "z": round(relation_nodes[r]["z"], 3)} for r in hole] for hole in holes], "water": "river", "geometryNote": "OSM multipolygon outer/inner loops; loops are source geometry and not field-surveyed."})

    building_areas = []
    landmarks = []
    for way_id, way in ways.items():
        if "building" not in way["tags"]: continue
        points = [projected[r] for r in way["refs"]]
        area = {"id": f"building-area-{way_id}", "sourceWayId": way_id, "points": [{"x": round(p["x"], 3), "z": round(p["z"], 3)} for p in points]}
        building_areas.append(area)
        name = way["tags"].get("name:zh")
        if name and any(inside(p) for p in points): landmarks.append({"id": f"landmark-{way_id}", "sourceWayId": way_id, "name": name, "heightApprox": 6.0 if way["tags"].get("tourism") == "museum" else 5.0, "points": area["points"]})

    bridges = []
    for road in roads:
        if road["kind"] != "bridge": continue
        way_id = road["osmWayId"]
        info = ORIGINAL_BRIDGES.get(way_id, {"id": f"mapped-bridge-{way_id}", "name": "富安桥" if way_id == "608390993" else None, "type": "arch" if way_id == "608390993" else "beam", "width": 3.8 if way_id == "608390993" else road["width"], "openingSpan": 6.6 if way_id == "608390993" else max(2.0, min(5.0, sum(distance(a, b) for a, b in zip(road["points"], road["points"][1:])) - 1.2)), "length": 17.4 if way_id == "608390993" else None, "nameConfidence": "official-source" if way_id == "608390993" else "unrecorded", "typeConfidence": "arch-source-confirmed" if way_id == "608390993" else "schematic-unverified"})
        bridges.append({**info, "roadId": way_id, "sourceUrl": "https://www.zhouzhuang.net/scenic_4/1260.html" if way_id == "608390993" else None})

    spawn = projected.get("5764755822", {"x": 0.0, "z": 0.0})
    layout = {"origin": {"lon": ORIGIN[0], "lat": ORIGIN[1]}, "roads": roads, "bridges": bridges, "channels": channels, "waterAreas": water_areas, "landPaths": land_paths, "buildingAreas": building_areas, "landmarks": landmarks, "spawn": {"x": round(spawn["x"], 3), "y": STREET_Y, "z": round(spawn["z"], 3), "roadId": "287819687", "yaw": 3.39}, "bounds": BOUNDS, "sources": {"osmSnapshot": SOURCE_OSM, "northExtensionSnapshot": NORTH_SOURCE_OSM, "waterRelationSnapshot": WATER_SOURCE_OSM, "photoStudy": SOURCE_STUDY, "bridgeEvidenceUrl": "https://www.zhouzhuang.net/scenic_4/1260.html", "coordinateAccuracy": "projected OSM geometry; not field-surveyed", "dimensionsAccuracy": "photo-guided artistic approximation; widths and heights are not measured", "selectionBounds": BOUNDS, "roadSelection": "all source public walking highways inside bounds: footway/pedestrian/path plus walkable service/alley/residential/living_street/unclassified; private/no/customers and parking_aisle excluded", "bridgeSelection": "every selected bridge=yes way has an independent entry; only the three established bridges retain photo-confirmed profiles; other types remain schematic", "waterSelection": "all selected canal/stream ways and closed natural=water polygons in the old-town bbox, plus OSM relation 62435 outer/inner loops", "landPathSelection": "only non-bridge roads near a water-width approximation without a source centre-line crossing; source crossings are retained as unresolved annotations", "coverageNote": "Expanded old-town public-street skeleton; northern Aidu area is not inferred beyond source ways inside bounds.", "bridgeDimensionNote": "富安桥官方页面给出长17.4m、宽3.8m、孔径6.6m；OSM位置与官网尺寸未作测绘融合，坐标仍以OSM源线为准。"}}
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__": main()
