"""Extract the four Huangshan ascent traces from an OSM /api/0.6/map XML export."""

import argparse
import heapq
import json
import math
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path


ROUTES = [
    ("south", "前山登山道", "慈光阁", "玉屏楼", "#e8c37e", [
        ("慈光阁", 30.1077943, 118.1674646),
        ("半山寺", 30.1186243, 118.1709089),
        ("玉屏楼", 30.1249412, 118.1703532),
    ]),
    ("east", "后山登山道", "云谷寺", "北海", "#84cfbd", [
        ("云谷寺", 30.1222091, 118.1875481),
        ("白鹅岭", 30.1395092, 118.1676191),
        ("北海", 30.1445613, 118.1664832),
    ]),
    ("north", "松谷登山道", "松谷庵站", "北海", "#acc4e9", [
        ("松谷庵站", 30.1750765, 118.1557829),
        ("松谷庵", 30.1473045, 118.1661350),
        ("北海", 30.1445613, 118.1664832),
    ]),
    ("west", "西海登山道", "钓桥庵", "天海", "#e6a391", [
        ("钓桥庵", 30.1333944, 118.1255818),
        ("三溪口", 30.1367840, 118.1451142),
        ("步仙桥", 30.1342513, 118.1507545),
        ("天海", 30.1321491, 118.1632752),
    ]),
]

SUMMIT_LINKS = [
    ("summit-south", "玉屏楼—天海联络道", "玉屏楼", "天海", "#e6e9d7", [
        ("玉屏楼", 30.1249412, 118.1703532),
        ("百步云梯", 30.1270226, 118.1634885),
        ("鳌鱼洞", 30.1291206, 118.1629296),
        ("天海", 30.1321491, 118.1632752),
    ]),
    ("summit-north", "天海—北海联络道", "天海", "北海", "#e6e9d7", [
        ("天海", 30.1321491, 118.1632752),
        ("光明顶", 30.1346774, 118.1640111),
        ("北海", 30.1445613, 118.1664832),
    ]),
]


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 96000)


def shortest_path(graph, start, end):
    distances = {start: 0}
    previous = {}
    queue = [(0, start)]
    while queue:
        distance, node = heapq.heappop(queue)
        if distance != distances[node]:
            continue
        if node == end:
            break
        for neighbor, length in graph[node]:
            candidate = distance + length
            if candidate < distances.get(neighbor, math.inf):
                distances[neighbor] = candidate
                previous[neighbor] = node
                heapq.heappush(queue, (candidate, neighbor))
    if end not in distances:
        raise ValueError(f"No OSM footpath from {start} to {end}")
    nodes = [end]
    while nodes[-1] != start:
        nodes.append(previous[nodes[-1]])
    return list(reversed(nodes)), distances[end]


def main_footpath_graph(root, coordinates):
    graph = defaultdict(list)
    for way in root.findall("way"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
        if tags.get("highway") not in {"steps", "footway", "path", "pedestrian"}:
            continue
        if tags.get("access") in {"no", "employees"} or "关闭" in tags.get("name", ""):
            continue
        nodes = [int(node.attrib["ref"]) for node in way.findall("nd")]
        for first, second in zip(nodes, nodes[1:]):
            if first not in coordinates or second not in coordinates:
                continue
            length = metres(coordinates[first], coordinates[second])
            graph[first].append((second, length))
            graph[second].append((first, length))

    component = {}
    sizes = Counter()
    for start in graph:
        if start in component:
            continue
        stack = [start]
        while stack:
            node = stack.pop()
            if node in component:
                continue
            component[node] = start
            sizes[start] += 1
            stack.extend(neighbor for neighbor, _ in graph[node])
    largest = sizes.most_common(1)[0][0]
    return graph, [node for node in graph if component[node] == largest]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("osm_xml", type=Path, help="OSM map XML for the DEM bounding box")
    parser.add_argument("--output", type=Path, default=Path("src/data/huangshan-routes.json"))
    args = parser.parse_args()

    root = ET.parse(args.osm_xml).getroot()
    coordinates = {
        int(node.attrib["id"]): (float(node.attrib["lat"]), float(node.attrib["lon"]))
        for node in root.findall("node")
    }
    graph, main_nodes = main_footpath_graph(root, coordinates)
    routes = []
    for route_id, name, start, end, color, checkpoints in ROUTES + SUMMIT_LINKS:
        kind = "link" if route_id.startswith("summit-") else "ascent"
        selected = []
        for label, latitude, longitude in checkpoints:
            target = (latitude, longitude)
            node = min(main_nodes, key=lambda item: metres(target, coordinates[item]))
            separation = metres(target, coordinates[node])
            if separation > 110:
                raise ValueError(f"{route_id}: {label} is {separation:.0f} m from mapped footpath")
            selected.append(node)

        path = []
        length = 0
        for first, second in zip(selected, selected[1:]):
            segment, distance = shortest_path(graph, first, second)
            path.extend(segment if not path else segment[1:])
            length += distance
        start_lat, start_lon = checkpoints[0][1:]
        points = [[round(start_lon, 7), round(start_lat, 7)]] if kind == "ascent" else []
        points.extend([round(coordinates[node][1], 7), round(coordinates[node][0], 7)] for node in path)
        routes.append({
            "id": route_id, "kind": kind, "name": name, "start": start, "end": end,
            "via": [item[0] for item in checkpoints[1:-1]], "color": color,
            "mappedLengthMetres": round(length), "startConnectorMetres": round(metres((start_lat, start_lon), coordinates[path[0]])) if kind == "ascent" else 0,
            "points": points,
        })

    by_id = {route["id"]: route for route in routes}
    if not (
        by_id["south"]["points"][-1] == by_id["summit-south"]["points"][0]
        and by_id["summit-south"]["points"][-1] == by_id["west"]["points"][-1] == by_id["summit-north"]["points"][0]
        and by_id["summit-north"]["points"][-1] == by_id["east"]["points"][-1] == by_id["north"]["points"][-1]
    ):
        raise ValueError("Summit links do not connect all four ascent routes")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"source": "OpenStreetMap contributors", "downloaded": "2026-09-30", "routes": routes}, ensure_ascii=False, separators=(",", ":")) + "\n")
    for route in routes:
        print(f"{route['name']}: {route['mappedLengthMetres']} m, {len(route['points'])} points, {route['startConnectorMetres']} m entrance link")


if __name__ == "__main__":
    main()
