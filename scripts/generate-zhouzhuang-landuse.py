#!/usr/bin/env python3
"""Extract housing coverage and protected areas from the saved OSM snapshots."""
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    "docs/zhouzhuang-references/zhouzhuang-osm-2026-10-20.osm.xml",
    "docs/zhouzhuang-references/zhouzhuang-north-extension-2026-10-22.osm.xml",
]


def main():
    layout = json.loads((ROOT / "src/data/zhouzhuang-layout.json").read_text())
    origin, bounds = layout["origin"], layout["bounds"]
    nodes, ways = {}, {}
    for source in SOURCES:
        document = ET.parse(ROOT / source).getroot()
        for node in document.findall("node"):
            nodes[node.attrib["id"]] = {
                "x": round((float(node.attrib["lon"]) - origin["lon"]) * 111320 * math.cos(math.radians(origin["lat"])), 3),
                "z": round((origin["lat"] - float(node.attrib["lat"])) * 110540, 3),
            }
        for way in document.findall("way"):
            ways[way.attrib["id"]] = way
    result = {"version": 1, "sources": SOURCES, "residential": [], "protected": []}
    for source_id, way in sorted(ways.items(), key=lambda item: int(item[0])):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
        kind = tags.get("landuse") or tags.get("leisure")
        if not kind and tags.get("amenity") in {"school", "parking"}:
            kind = tags["amenity"]
        if not kind:
            continue
        refs = [node.attrib["ref"] for node in way.findall("nd")]
        if len(refs) < 4 or refs[0] != refs[-1] or any(ref not in nodes for ref in refs):
            continue
        points = [nodes[ref] for ref in refs[:-1]]
        if (max(p["x"] for p in points) < bounds["minX"] or min(p["x"] for p in points) > bounds["maxX"]
                or max(p["z"] for p in points) < bounds["minZ"] or min(p["z"] for p in points) > bounds["maxZ"]):
            continue
        key = "residential" if kind in {"residential", "retail"} else "protected"
        result[key].append({"sourceWayId": source_id, "kind": kind, "points": points})
    target = ROOT / "src/data/zhouzhuang-landuse.json"
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({key: len(result[key]) for key in ("residential", "protected")}))


if __name__ == "__main__":
    main()
