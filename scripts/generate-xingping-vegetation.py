#!/usr/bin/env python3
"""Extract source OSM woodland/forest polygons for the Xingping vegetation pass."""
from __future__ import annotations

import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/xingping-references/river-osm-map.xml"
OUTPUT = ROOT / "src/data/xingping-vegetation.json"


def main() -> None:
    root = ET.parse(SOURCE).getroot()
    nodes = {node.attrib["id"]: (float(node.attrib["lon"]), float(node.attrib["lat"]))
             for node in root.findall("node") if "lon" in node.attrib and "lat" in node.attrib}
    ways = {way.attrib["id"]: [node.attrib["ref"] for node in way.findall("nd")]
            for way in root.findall("way")}

    def ring_for(member_ids: list[str], relation_id: str) -> list[list[tuple[float, float]]]:
        missing = [member_id for member_id in member_ids if member_id not in ways]
        if missing:
            raise ValueError(f"relation {relation_id} missing way members: {missing}")
        remaining = [list(ways[member_id]) for member_id in member_ids]
        rings = []
        while remaining:
            ring = remaining.pop(0)
            if not ring:
                continue
            while ring[0] != ring[-1]:
                end = ring[-1]
                found = next((index for index, candidate in enumerate(remaining)
                              if candidate and (candidate[0] == end or candidate[-1] == end)), None)
                if found is None:
                    raise ValueError(f"relation {relation_id} has an unclosed ring")
                candidate = remaining.pop(found)
                if candidate[-1] == end:
                    candidate.reverse()
                ring.extend(candidate[1:])
            if len(ring) >= 4:
                rings.append([nodes[node_id] for node_id in ring[:-1] if node_id in nodes])
        return rings

    def inside(point: tuple[float, float], ring: list[tuple[float, float]]) -> bool:
        x, y = point
        hit = False
        for index, current in enumerate(ring):
            previous = ring[index - 1]
            if (current[1] > y) != (previous[1] > y) and x < (previous[0] - current[0]) * (y - current[1]) / (previous[1] - current[1]) + current[0]:
                hit = not hit
        return hit

    polygons = []
    excluded_relations = []
    for way in root.findall("way"):
        tags = {tag.attrib["k"]: tag.attrib.get("v", "") for tag in way.findall("tag")}
        landuse = tags.get("landuse")
        natural = tags.get("natural")
        if natural != "wood" and landuse != "forest":
            continue
        refs = [nd.attrib["ref"] for nd in way.findall("nd")]
        points = [nodes[ref] for ref in refs if ref in nodes]
        if len(points) < 4 or points[0] != points[-1]:
            continue
        polygons.append({
            "id": f"way:{way.attrib['id']}",
            "sourceTag": "natural" if natural == "wood" else "landuse",
            "value": natural or landuse,
            "name": tags.get("name"),
            "points": [{"lon": lon, "lat": lat} for lon, lat in points],
        })
    for relation in root.findall("relation"):
        tags = {tag.attrib["k"]: tag.attrib.get("v", "") for tag in relation.findall("tag")}
        if tags.get("natural") != "wood" and tags.get("landuse") != "forest":
            continue
        members = [(member.attrib.get("role"), member.attrib.get("ref"))
                   for member in relation.findall("member") if member.attrib.get("type") == "way"]
        try:
            outer_rings = ring_for([ref for role, ref in members if role == "outer"], relation.attrib["id"])
            inner_rings = ring_for([ref for role, ref in members if role == "inner"], relation.attrib["id"])
        except ValueError as error:
            excluded_relations.append({"id": f"relation:{relation.attrib['id']}", "reason": str(error), "status": "excluded_unclosed_or_missing_members"})
            continue
        for index, outer in enumerate(outer_rings):
            holes = [hole for hole in inner_rings if hole and inside(hole[0], outer)]
            polygons.append({
                "id": f"relation:{relation.attrib['id']}:outer:{index}",
                "relationId": relation.attrib["id"],
                "sourceTag": "natural" if tags.get("natural") == "wood" else "landuse",
                "value": tags.get("natural") or tags.get("landuse"),
                "holes": [[{"lon": lon, "lat": lat} for lon, lat in hole] for hole in holes],
                "outer": [{"lon": lon, "lat": lat} for lon, lat in outer],
            })
    payload = {
        "source": {
            "dataset": "OpenStreetMap",
            "snapshot": "docs/xingping-references/river-osm-map.xml",
            "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "retrieved": "2026-10-23",
            "license": "ODbL 1.0",
            "tags": ["natural=wood", "landuse=forest"],
        },
        "polygons": polygons,
        "counts": {
            "naturalWood": sum(p["value"] == "wood" for p in polygons),
            "landuseForest": sum(p["value"] == "forest" for p in polygons),
            "total": len(polygons),
            "wayPolygons": sum(p["id"].startswith("way:") for p in polygons),
            "relationPolygons": sum(p["id"].startswith("relation:") for p in polygons),
            "excludedRelations": len(excluded_relations),
        },
        "excludedRelations": excluded_relations,
        "limitations": "These are source landuse polygons, not individual tree surveys. Tree placement inside them is artistic and filtered by water, settlement, road and shoal exclusions.",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(payload["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
