"""Build West Lake walking traces from OSM map XML exports.

The map API is limited to a small bounding box, so the command accepts several
XML files downloaded from adjacent tiles.  Geometry is never interpolated
between landmarks: every output vertex is an OSM node on a walkable way.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


DOWNLOAD_URL = "https://api.openstreetmap.org/api/0.6/map"
DOWNLOADED = "2026-09-30"
TILE_BBOXES = {
    "northwest.osm": "120.115,30.245,120.145,30.275",
    "northeast.osm": "120.145,30.245,120.175,30.275",
    "southwest.osm": "120.115,30.215,120.145,30.245",
    "southeast.osm": "120.145,30.215,120.175,30.245",
}
WALKING_HIGHWAYS = {"footway", "path", "pedestrian", "steps", "cycleway", "track"}
# These are short public-road links where the mapped pedestrian ways currently
# stop at the road edge.  They are retained as walking geometry, never ferry or
# motorway geometry, and are marked in the output provenance.
ROAD_LINK_HIGHWAYS = {"secondary", "tertiary", "unclassified", "residential", "living_street", "service"}

POIS = {
    "duanqiao": ("断桥残雪", 30.261531, 120.147367, "node", 1468743794),
    "pinghu": ("平湖秋月", 30.254202, 120.141613, "node", 1468743804),
    "gushan": ("孤山", 30.254194, 120.137781, "node", 9035381272),
    "yuemiao": ("岳王庙", 30.254250, 120.130350, "way", 435906176),
    "quyuan": ("曲院风荷", 30.251607, 120.126904, "node", 1468743785),
    "huagang": ("花港观鱼", 30.234386, 120.137392, "node", 1881729397),
    "leifeng": ("雷峰塔", 30.230700, 120.149800, "way", 229726934),
    "liulang": ("柳浪闻莺", 30.241903, 120.151076, "node", 1468743758),
}

ROUTE_STOPS = {
    "north": ["duanqiao", "pinghu", "gushan", "yuemiao", "quyuan"],
    "south": ["quyuan", "huagang", "leifeng", "liulang", "duanqiao"],
}


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance between (latitude, longitude) pairs in metres."""
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * math.cos(lat))


def read_osm(paths: list[Path]):
    nodes: dict[int, tuple[float, float]] = {}
    ways: list[tuple[str, dict[str, str], list[int]]] = []
    for path in paths:
        root = ET.parse(path).getroot()
        for node in root.findall("node"):
            nodes[int(node.attrib["id"])] = (float(node.attrib["lat"]), float(node.attrib["lon"]))
        for way in root.findall("way"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
            refs = [int(item.attrib["ref"]) for item in way.findall("nd")]
            if len(refs) >= 2:
                ways.append((way.attrib["id"], tags, refs))
    return nodes, ways


def make_graph(nodes, ways):
    graph = defaultdict(list)
    edge_seen = set()
    source_types = {}
    for way_id, tags, refs in ways:
        highway = tags.get("highway")
        if highway not in WALKING_HIGHWAYS | ROAD_LINK_HIGHWAYS:
            continue
        if tags.get("access") in {"no", "private", "employees"} or tags.get("foot") == "no":
            continue
        for first, second in zip(refs, refs[1:]):
            if first not in nodes or second not in nodes:
                continue
            key = (min(first, second), max(first, second), way_id)
            if key in edge_seen:
                continue
            edge_seen.add(key)
            length = metres(nodes[first], nodes[second])
            # Walking ways are preferred. Road links are only a fallback to
            # bridge gaps in the OSM footpath graph.
            cost = length * (1 if highway in WALKING_HIGHWAYS else 3.2)
            graph[first].append((second, cost, length, way_id, highway))
            graph[second].append((first, cost, length, way_id, highway))
            source_types[way_id] = highway
    return graph, source_types


def shortest_path(graph, start: int, end: int):
    distances = {start: 0.0}
    previous = {}
    queue = [(0.0, start)]
    while queue:
        distance, node = heapq.heappop(queue)
        if distance != distances[node]:
            continue
        if node == end:
            break
        for neighbor, cost, length, way_id, highway in graph[node]:
            candidate = distance + cost
            if candidate < distances.get(neighbor, math.inf):
                distances[neighbor] = candidate
                previous[neighbor] = (node, length, way_id, highway)
                heapq.heappush(queue, (candidate, neighbor))
    if end not in distances:
        raise ValueError(f"no mapped walking path from {start} to {end}")
    path = [end]
    edges = []
    while path[-1] != start:
        node, length, way_id, highway = previous[path[-1]]
        edges.append((length, way_id, highway))
        path.append(node)
    return list(reversed(path)), list(reversed(edges))


def way_center(nodes, ways, way_id):
    for candidate, _tags, refs in ways:
        if candidate == str(way_id):
            points = [nodes[ref] for ref in refs if ref in nodes]
            return (
                sum(point[0] for point in points) / len(points),
                sum(point[1] for point in points) / len(points),
            )
    raise ValueError(f"OSM way {way_id} is missing from map export")


def build(paths: list[Path]):
    nodes, ways = read_osm(paths)
    graph, source_types = make_graph(nodes, ways)
    targets = {}
    for poi_id, (_name, latitude, longitude, element_type, element_id) in POIS.items():
        target = way_center(nodes, ways, element_id) if element_type == "way" else (latitude, longitude)
        selected = min(graph, key=lambda node: metres(target, nodes[node]))
        snap = metres(target, nodes[selected])
        if snap > 130:
            raise ValueError(f"{poi_id} is {snap:.0f}m from the mapped pedestrian network")
        targets[poi_id] = {"target": target, "node": selected, "snapMetres": round(snap, 1)}

    routes = []
    for route_id, stops in ROUTE_STOPS.items():
        node_path = []
        edge_path = []
        for first, second in zip(stops, stops[1:]):
            segment, edges = shortest_path(graph, targets[first]["node"], targets[second]["node"])
            node_path.extend(segment if not node_path else segment[1:])
            edge_path.extend(edges)
        physical_length = sum(edge[0] for edge in edge_path)
        route_way_ids = list(dict.fromkeys(edge[1] for edge in edge_path))
        mixed_way_ids = list(dict.fromkeys(edge[1] for edge in edge_path if edge[2] not in WALKING_HIGHWAYS))
        mixed_edges = [edge for edge in edge_path if edge[2] not in WALKING_HIGHWAYS]
        routes.append({
            "id": route_id,
            "name": "白堤北岸线" if route_id == "north" else "苏堤环湖线",
            "color": "#e8c37e" if route_id == "north" else "#84cfbd",
            "stops": stops,
            "mappedLengthMetres": round(physical_length),
            "points": [[round(nodes[node][1], 7), round(nodes[node][0], 7)] for node in node_path],
            "pointNodeIds": node_path,
            "perEdgeWayIds": [edge[1] for edge in edge_path],
            "sourceWayIds": route_way_ids,
            "mixedRoadWayIds": mixed_way_ids,
            "mixedRoadLengthMetres": round(sum(edge[0] for edge in mixed_edges)),
            "mixedRoadHighways": sorted({edge[2] for edge in mixed_edges}),
        })

    # The endpoints deliberately share the two lake bridges, making the two
    # lines a closed scenic loop without drawing a straight segment over water.
    if routes[0]["points"][0] != routes[1]["points"][-1] or routes[0]["points"][-1] != routes[1]["points"][0]:
        raise ValueError("route endpoints do not form the expected closed loop")

    output = {
        "source": {
            "provider": "OpenStreetMap contributors",
            "geometry": "OSM walkable ways from the public map API",
            "downloaded": DOWNLOADED,
            "url": DOWNLOAD_URL,
            "tiles": [
                {"file": path.name, "url": f"{DOWNLOAD_URL}?bbox={TILE_BBOXES.get(path.name, '')}"}
                for path in paths
            ],
            "walkingHighways": sorted(WALKING_HIGHWAYS),
            "roadLinkHighways": sorted(ROAD_LINK_HIGHWAYS),
            "note": "Road links are short pedestrian connections where OSM footways terminate at a public road; ferry relations and motorways are excluded.",
        },
        "poiSnaps": {key: value["snapMetres"] for key, value in targets.items()},
        "routes": routes,
    }
    return output, targets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("osm_xml", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, default=Path("src/data/west-lake-routes.json"))
    args = parser.parse_args()
    output, targets = build(args.osm_xml)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    for route in output["routes"]:
        print(route["name"], route["mappedLengthMetres"], "m", len(route["points"]), "points", "road links", len(route["mixedRoadWayIds"]))
    print("POI snap max", max(output["poiSnaps"].values()), "m")


if __name__ == "__main__":
    main()
