#!/usr/bin/env python3
"""Extract small, reproducible West Lake landmark geometry from cached OSM XML.

The output is intentionally geographic geometry, rather than a claim that OSM
contains detailed architectural meshes.  Artistic widths are kept separate
from the WGS84 coordinates so the renderer can build lightweight models.
"""

from __future__ import annotations

import json
import argparse
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
OSM_DIR = Path("/tmp/west-lake-terrain")
OUTPUT = ROOT / "src/data/west-lake-built-landmarks.json"


def load_osm(osm_dir):
    nodes = {}
    ways = {}
    relations = {}
    def keep_latest(collection, element):
        element_id = element.attrib["id"]
        version = int(element.attrib.get("version", "0"))
        previous = collection.get(element_id)
        if previous is None or version >= previous[0]:
            collection[element_id] = (version, element)

    for path in sorted(osm_dir.glob("*.osm")):
        root = ET.parse(path).getroot()
        for node in root.findall("node"):
            keep_latest(nodes, node)
        for way in root.findall("way"):
            keep_latest(ways, way)
        for relation in root.findall("relation"):
            keep_latest(relations, relation)

    def unpack(collection, transform):
        return {element_id: transform(element) for element_id, (_, element) in collection.items()}

    return (
        unpack(nodes, lambda node: [float(node.attrib["lon"]), float(node.attrib["lat"])]),
        unpack(ways, lambda way: {
                "nodes": [nd.attrib["ref"] for nd in way.findall("nd")],
                "tags": {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")},
            }),
        unpack(relations, lambda relation: {
                "members": [(m.attrib["type"], m.attrib["ref"], m.attrib.get("role", ""))
                            for m in relation.findall("member")],
                "tags": {tag.attrib["k"]: tag.attrib["v"] for tag in relation.findall("tag")},
            }),
    )


NODES, WAYS, RELATIONS = {}, {}, {}


def points(node_ids):
    missing = [node_id for node_id in node_ids if node_id not in NODES]
    assert not missing, f"missing OSM nodes: {missing}"
    return [NODES[node_id] for node_id in node_ids]


def way_nodes(way_id):
    assert way_id in WAYS, f"missing OSM way: {way_id}"
    return WAYS[way_id]["nodes"]


def orient_chain(way_ids):
    """Join ways by shared endpoint and retain every exact node ID."""
    paths = [way_nodes(way_id)[:] for way_id in way_ids]
    joined = paths.pop(0)
    while paths:
        for index, path in enumerate(paths):
            if joined[-1] == path[0]:
                joined.extend(path[1:])
            elif joined[-1] == path[-1]:
                joined.extend(reversed(path[:-1]))
            elif joined[0] == path[-1]:
                joined = path[:-1] + joined
            elif joined[0] == path[0]:
                joined = list(reversed(path[1:])) + joined
            else:
                continue
            paths.pop(index)
            break
        else:
            raise AssertionError(f"OSM ways do not form a connected chain: {way_ids}")
    return joined


def ring(way_id):
    ids = way_nodes(way_id)
    assert ids[0] == ids[-1], f"OSM way {way_id} is not a closed ring"
    return points(ids)


def bridge(bridge_id, name, centerline_id, outline_id=None, width=5.5):
    center_ids = way_nodes(centerline_id)
    assert len(center_ids) >= 2
    result = {
        "id": bridge_id,
        "name": name,
        "points": points(center_ids),
        "center": [
            sum(point[0] for point in points(center_ids)) / len(center_ids),
            sum(point[1] for point in points(center_ids)) / len(center_ids),
        ],
        "nodeIds": center_ids,
        "widthMetres": width,
        "osmWays": [centerline_id],
    }
    if outline_id:
        result["outline"] = ring(outline_id)
        result["osmWays"].append(outline_id)
    return result


def relation_ring(relation_id, role):
    relation = RELATIONS[relation_id]
    members = [ref for kind, ref, member_role in relation["members"]
               if kind == "way" and member_role == role]
    assert members, f"relation {relation_id} has no {role} way"
    # This relation's members are already single closed rings in the cache.
    return ring(members[0]), members


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm-dir", type=Path, default=OSM_DIR,
                        help=f"directory containing cached .osm files (default: {OSM_DIR})")
    parser.add_argument("--output", type=Path, default=OUTPUT,
                        help=f"output JSON path (default: {OUTPUT})")
    args = parser.parse_args()
    global NODES, WAYS, RELATIONS
    NODES, WAYS, RELATIONS = load_osm(args.osm_dir)
    sudi_ways = [
        "4335991", "975869980", "30072125", "30072127", "30075392",
        "30075393", "30072130", "30072131", "30072139", "30072138",
        "30072144", "30072145", "30072147", "30072148",
    ]
    baidi_ways = [
        "4326974", "29416781", "28538285", "28538286", "28538289", "28538290",
    ]
    sudi_nodes = orient_chain(sudi_ways)
    baidi_nodes = orient_chain(baidi_ways)
    assert len(sudi_nodes) == len(set(sudi_nodes))
    assert len(baidi_nodes) == len(set(baidi_nodes))

    xiaoyingzhou_outer, xiaoyingzhou_ways = relation_ring("5740510", "outer")
    xiaoyingzhou_inner, xiaoyingzhou_inner_ways = relation_ring("5740510", "inner")

    output = {
        "crs": "WGS84",
        "source": {
            "type": "OpenStreetMap",
            "cacheDir": str(args.osm_dir),
            "cacheFiles": sorted(path.name for path in args.osm_dir.glob("*.osm")),
            "retrievedFrom": "https://www.openstreetmap.org/",
            "note": "Coordinates and topology are OSM geometry. Widths are artistic renderer values; no architectural dimensions are inferred.",
        },
        "causeways": [
            {
                "id": "sudi",
                "name": "苏堤",
                "widthMetres": 30.0,
                "widthApproximate": True,
                "points": points(sudi_nodes),
                "nodeIds": sudi_nodes,
                "osmWays": sudi_ways,
            },
            {
                "id": "baidi",
                "name": "白堤",
                "widthMetres": 20.0,
                "widthApproximate": True,
                "points": points(baidi_nodes),
                "nodeIds": baidi_nodes,
                "osmWays": baidi_ways,
            },
        ],
        "islands": [
            {
                "id": "xiaoyingzhou",
                "name": "小瀛洲",
                "outer": xiaoyingzhou_outer,
                "holes": [xiaoyingzhou_inner],
                "osmElement": "relation/5740510",
                "osm": {"relation": "5740510", "outerWays": xiaoyingzhou_ways,
                        "innerWays": xiaoyingzhou_inner_ways},
            },
        ],
        "bridges": [
            bridge("yingbo", "映波桥", "30072147", width=18.0),
            bridge("suolan", "锁澜桥", "30072144", width=18.0),
            bridge("wangshan", "望山桥", "30072139", width=18.0),
            bridge("yadi", "压堤桥", "30072130", width=18.0),
            bridge("dongpu", "东浦桥", "30075392", width=18.0),
            bridge("kuahong", "跨虹桥", "30072125", width=18.0),
            bridge("duanqiao", "断桥", "28538289", "1466925249", width=18.0),
            bridge("jindai", "锦带桥", "28538285", "1466925248", width=18.0),
        ],
        "landmarks": [
            {
                "id": "huxinting",
                "name": "湖心亭",
                "kind": "pavilion",
                "longitude": NODES["9035381271"][0],
                "latitude": NODES["9035381271"][1],
                "outline": ring("30086285"),
                "nodeIds": way_nodes("30086285"),
                "osmElement": "way/30086285",
                "osm": {"ways": ["30086285"], "point": "node/9035381271"},
            },
            {
                "id": "santan",
                "name": "三潭印月",
                "kind": "stone-pagodas",
                "longitude": NODES["1468743788"][0],
                "latitude": NODES["1468743788"][1],
                "outline": ring("975360503"),
                "points": [{"name": "三潭石塔", "longitude": NODES["9025997767"][0],
                            "latitude": NODES["9025997767"][1],
                            "osmElement": "node/9025997767"}],
                "osmElement": "way/975360503",
                "osm": {"attractionNode": "1468743788", "parkWay": "975360503",
                        "mappedTowerNodes": ["9025997767"],
                        "note": "缓存 OSM 中仅有一个带三潭石塔标签的独立点位；其余两座不伪造坐标。"},
            },
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes)")
    print(f"sudi={len(sudi_nodes)} nodes, baidi={len(baidi_nodes)} nodes")


if __name__ == "__main__":
    main()
