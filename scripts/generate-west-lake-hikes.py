"""Build the West Lake hill hiking traces from OSM walking ways.

The input files are small public OSM API exports kept in ``/tmp/west-lake-
terrain``.  This generator deliberately emits OSM nodes only: a missing
connection is reported instead of being replaced by a straight line over a
lake, private site, cable car or road tunnel.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

API_URL = "https://api.openstreetmap.org/api/0.6/map"
DOWNLOADED = "2026-09-30"
DEM_METADATA_PATH = Path(__file__).resolve().parents[1] / "src" / "data" / "west-lake-dem.json"
WALKING_HIGHWAYS = {"footway", "path", "pedestrian", "steps", "cycleway", "track"}
ROAD_LINK_HIGHWAYS = {"secondary", "tertiary", "unclassified", "residential", "living_street", "service"}
MOUNTAIN_NAME_PATTERNS = (
    "宝石山上路", "道院前", "蹬开岭下", "韬光寺路", "法云弄", "北高峰登山道",
    "老和山游步道", "西山游步道", "十里琅珰", "万林背山", "五云山",
    "云栖竹径", "云栖绕道", "梵村游步道", "九溪十八涧", "马家坞",
    "玉皇山登山道", "凤凰山登山道", "白云庵道",
)

# Peak coordinates are snapped to walking nodes; route starts use explicit
# OSM nodes on named public ways.
TARGETS = {
    "baoshi": ("宝石山", 30.2624214, 120.141408),
    "ge": ("葛岭（东峰）", 30.2616854, 120.1365021),
    "beigao": ("北高峰", 30.2479298, 120.0920867),
    "nangao": ("南高峰", 30.2240207, 120.1175872),
    "wuyun": ("五云山", 30.1983844, 120.0952294),
    "yuhuang": ("玉皇山", 30.2170488, 120.1401096),
}

ROUTES = [
    {
        "id": "baoshi-ge",
        "name": "宝石山·葛岭线",
        "color": "#e8a38f",
        "startNodeId": 26286682,
        "startWayId": "29021290",
        "targets": ["baoshi", "ge"],
        "startName": "北山街步行起点",
        "endName": "葛岭东峰步道",
        "official": "https://ty.hangzhou.gov.cn/art/2020/1/2/art_1694286_41423254.html",
        "mountainIds": ["baoshi", "ge"],
    },
    {
        "id": "beigao",
        "name": "灵隐·北高峰线",
        "color": "#a6bce8",
        "startNodeId": 1519392833,
        "startWayId": "138564975",
        "targets": ["beigao"],
        "startName": "灵隐公开步道入口",
        "endName": "北高峰山顶步道",
        "official": "https://ty.hangzhou.gov.cn/art/2020/1/2/art_1694286_41423254.html",
        "mountainIds": ["beigao"],
    },
    {
        "id": "nangao",
        "name": "南高峰登顶线",
        "color": "#c5a5d6",
        "startNodeId": 3429779744,
        "startWayId": "343465017",
        "targets": ["nangao"],
        "startName": "西山游步道（五老峰—梵音亭段）入口",
        "endName": "南高峰山脊步道",
        "official": None,
        "mountainIds": ["nangao"],
    },
    {
        "id": "wuyun",
        "name": "十里琅珰·五云山线",
        "color": "#e2bc78",
        "startNodeId": 4469526662,
        "startWayId": "450033737",
        "endNodeId": 770713359,
        "endWayId": "981902546",
        "targets": ["wuyun"],
        "viaNames": ["十里琅珰山脊", "五云山"],
        "startName": "龙井村·十里琅珰狮峰支线入口",
        "endName": "九溪村步道出口",
        "official": "https://hznews.hangzhou.com.cn/chengshi/content/2020-10/25/content_7839337_2.htm",
        "mountainIds": ["wuyun"],
    },
    {
        "id": "yuhuang",
        "name": "玉皇山登山线",
        "color": "#91c9ad",
        "startNodeId": 5029726488,
        "startWayId": "457498261",
        "targets": ["yuhuang"],
        "startName": "玉皇山登山道口",
        "endName": "玉皇山山顶步道",
        "official": "https://ty.hangzhou.gov.cn/art/2020/1/2/art_1694286_41423254.html",
        "mountainIds": ["yuhuang"],
    },
]


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * math.cos(lat))


def read_osm(paths: list[Path]):
    paths = sorted(paths, key=lambda path: path.name)
    nodes: dict[int, tuple[float, float]] = {}
    node_versions: dict[int, int] = {}
    ways_by_id: dict[str, tuple[int, dict[str, str], list[int]]] = {}
    bounds = {}
    for path in paths:
        root = ET.parse(path).getroot()
        declared_bounds = root.find("bounds")
        if declared_bounds is not None:
            bounds[path.name] = dict(declared_bounds.attrib)
        file_points = []
        for node in root.findall("node"):
            point = (float(node.attrib["lat"]), float(node.attrib["lon"]))
            node_id = int(node.attrib["id"])
            version = int(node.attrib.get("version", "0"))
            if node_id in node_versions and version < node_versions[node_id]:
                continue
            nodes[node_id] = point
            node_versions[node_id] = version
            file_points.append(point)
        if path.name not in bounds and file_points:
            bounds[path.name] = {
                "minlat": f"{min(point[0] for point in file_points):.7f}",
                "minlon": f"{min(point[1] for point in file_points):.7f}",
                "maxlat": f"{max(point[0] for point in file_points):.7f}",
                "maxlon": f"{max(point[1] for point in file_points):.7f}",
            }
        for way in root.findall("way"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
            refs = [int(item.attrib["ref"]) for item in way.findall("nd")]
            if len(refs) >= 2:
                way_id = way.attrib["id"]
                version = int(way.attrib.get("version", "0"))
                if way_id not in ways_by_id or version >= ways_by_id[way_id][0]:
                    ways_by_id[way_id] = (version, tags, refs)
    ways = [(way_id, value[1], value[2]) for way_id, value in sorted(ways_by_id.items())]
    return nodes, ways, bounds


def is_excluded_way(tags: dict[str, str]) -> bool:
    if tags.get("access") in {"no", "private", "employees"} or tags.get("foot") in {"no", "private"}:
        return True
    if tags.get("area") == "yes" or "building" in tags or tags.get("indoor"):
        return True
    return tags.get("tunnel") not in {None, "", "no", "false", "0"}


def is_walking_way(tags: dict[str, str], way_id: str, preserved_way_ids: set[str]) -> bool:
    highway = tags.get("highway")
    if highway not in WALKING_HIGHWAYS:
        return False
    if highway == "cycleway" and tags.get("foot") not in {"yes", "designated", "permissive"} and way_id not in preserved_way_ids:
        return False
    name = tags.get("name", "")
    if highway == "footway" and (tags.get("footway") in {"sidewalk", "crossing"} or tags.get("sidewalk")) and way_id not in preserved_way_ids:
        return False
    return True


def make_graph(nodes, ways, *, preserved_way_ids=None, include_road_links=True, strict=True):
    graph = defaultdict(list)
    source_types = {}
    preserved_way_ids = preserved_way_ids or set()
    seen = set()
    for way_id, tags, refs in ways:
        highway = tags.get("highway")
        if strict and is_excluded_way(tags):
            continue
        walking = is_walking_way(tags, way_id, preserved_way_ids) if strict else highway in WALKING_HIGHWAYS
        road_link = include_road_links and highway in ROAD_LINK_HIGHWAYS and (way_id in preserved_way_ids or not strict)
        if not walking and not road_link:
            continue
        for first, second in zip(refs, refs[1:]):
            if first not in nodes or second not in nodes:
                continue
            key = (min(first, second), max(first, second), way_id)
            if key in seen:
                continue
            seen.add(key)
            length = metres(nodes[first], nodes[second])
            cost = length if highway in WALKING_HIGHWAYS else length * 3.2
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
        raise ValueError(f"no public mapped walking path from {start} to {end}")
    path, edges = [end], []
    while path[-1] != start:
        node, length, way_id, highway = previous[path[-1]]
        edges.append((length, way_id, highway))
        path.append(node)
    return list(reversed(path)), list(reversed(edges))


def _edge_key(first: int, second: int, way_id: str) -> tuple[int, int, str]:
    return min(first, second), max(first, second), way_id


def _network_segment(point_ids, edge_ids, edge_by_key, nodes, component_id):
    coordinates = [[nodes[node][1], nodes[node][0]] for node in point_ids]
    names = list(dict.fromkeys(edge_by_key[key][5] for key in edge_ids if edge_by_key[key][5]))
    highways = list(dict.fromkeys(edge_by_key[key][4] for key in edge_ids))
    return {
        "points": coordinates,
        "pointNodeIds": point_ids,
        "perEdgeWayIds": [edge_by_key[key][3] for key in edge_ids],
        "sourceWayIds": list(dict.fromkeys(edge_by_key[key][3] for key in edge_ids)),
        "sourceWayNames": names,
        "sourceHighways": highways,
        "fromNodeId": point_ids[0],
        "toNodeId": point_ids[-1],
        "componentId": component_id,
        "mappedLengthMetres": round(sum(edge_by_key[key][2] for key in edge_ids)),
    }


def build_network(nodes, ways, routes, route_graph_types, dem_bounds, full_nodes=None):
    full_nodes = full_nodes or nodes
    route_way_ids = set().union(*(route["sourceWayIds"] for route in routes))
    strict_graph, strict_types = make_graph(nodes, ways, preserved_way_ids=route_way_ids, include_road_links=False)
    way_lookup = {way_id: (tags, refs) for way_id, tags, refs in ways}
    route_edge_keys = set()
    for route in routes:
        for index, way_id in enumerate(route["perEdgeWayIds"]):
            route_edge_keys.add(_edge_key(route["pointNodeIds"][index], route["pointNodeIds"][index + 1], way_id))
    edge_by_key = {}
    adjacency = defaultdict(list)
    walking_way_ids = set()
    mountain_way_ids = set()
    ordinary_road_nodes = set()
    for way_id, tags, refs in ways:
        highway = tags.get("highway")
        if highway and highway not in WALKING_HIGHWAYS and not is_excluded_way(tags):
            ordinary_road_nodes.update(node for node in refs if node in nodes)
        if is_excluded_way(tags) or highway not in WALKING_HIGHWAYS:
            if is_excluded_way(tags) or highway not in ROAD_LINK_HIGHWAYS or way_id not in route_way_ids:
                continue
            walking = False
        else:
            walking = is_walking_way(tags, way_id, route_way_ids)
            if not walking:
                continue
        if any(pattern in tags.get("name", "") for pattern in MOUNTAIN_NAME_PATTERNS):
            mountain_way_ids.add(way_id)
        if way_id in route_way_ids:
            walking_way_ids.add(way_id)
        for first, second in zip(refs, refs[1:]):
            if first not in nodes or second not in nodes:
                continue
            key = _edge_key(first, second, way_id)
            if not walking and key not in route_edge_keys:
                continue
            if key in edge_by_key:
                continue
            length = metres(nodes[first], nodes[second])
            edge_by_key[key] = (first, second, length, way_id, highway, tags.get("name", ""))
            if walking and (key in route_edge_keys or way_id in mountain_way_ids or highway not in {"pedestrian", "cycleway"}):
                adjacency[first].append(key)
                adjacency[second].append(key)

    # Keep the already mapped road links only as route geometry and barriers.
    road_way_ids = {way_id for way_id in route_way_ids if route_graph_types.get(way_id) in ROAD_LINK_HIGHWAYS}
    road_access_nodes = ordinary_road_nodes
    seed_way_ids = walking_way_ids | mountain_way_ids
    seed_edges = {
        key for key, edge in edge_by_key.items()
        if edge[3] in mountain_way_ids or key in route_edge_keys
    }
    seed_nodes = {node for key in seed_edges for node in key[:2]}
    seed_nodes.update(node for route in routes for node in route["pointNodeIds"])

    included = set(seed_edges) | route_edge_keys
    queue = list(seed_nodes)
    visited = set(seed_nodes)
    while queue:
        node = queue.pop()
        if node in road_access_nodes:
            continue
        for key in adjacency.get(node, []):
            edge = edge_by_key[key]
            included.add(key)
            other = edge[1] if edge[0] == node else edge[0]
            if other not in visited:
                visited.add(other)
                queue.append(other)

    # Route road links are not walking edges, but are retained where the original
    # mapped path used them. Their end nodes remain barriers for expansion.
    included.update(key for key in route_edge_keys if key[2] in road_way_ids)
    # OSM can contain parallel ways with the same two node endpoints. Keep one
    # deterministic geometry edge, preferring a way used by a mapped route.
    collapsed = {}
    for key in sorted(included):
        if key not in edge_by_key:
            continue
        edge = edge_by_key[key]
        pair = (edge[0], edge[1]) if edge[0] < edge[1] else (edge[1], edge[0])
        current = collapsed.get(pair)
        if current is None or ((edge[3] in route_way_ids) and (current[3] not in route_way_ids)) or edge[3] < current[3]:
            collapsed[pair] = edge
    included_edges = {
        _edge_key(edge[0], edge[1], edge[3]): edge
        for edge in collapsed.values()
    }
    network_adjacency = defaultdict(list)
    for key, edge in included_edges.items():
        network_adjacency[edge[0]].append(key)
        network_adjacency[edge[1]].append(key)
    for keys in network_adjacency.values():
        keys.sort()

    component_by_node = {}
    components = []
    for node in network_adjacency:
        if node in component_by_node:
            continue
        component_id = len(components)
        component = []
        pending = [node]
        component_by_node[node] = component_id
        while pending:
            current = pending.pop()
            component.append(current)
            for key in network_adjacency[current]:
                edge = included_edges[key]
                other = edge[1] if edge[0] == current else edge[0]
                if other not in component_by_node:
                    component_by_node[other] = component_id
                    pending.append(other)
        components.append(component)

    endpoint_degrees = {
        node: (len(keys), keys) for node, keys in network_adjacency.items()
    }
    extent_candidates = set()
    missing_candidates = set()
    for _way_id, tags, refs in ways:
        if is_excluded_way(tags):
            continue
        highway = tags.get("highway")
        if highway not in WALKING_HIGHWAYS and _way_id not in route_way_ids:
            continue
        for first, second in zip(refs, refs[1:]):
            for present, adjacent in ((first, second), (second, first)):
                if present not in endpoint_degrees or adjacent in nodes:
                    continue
                if adjacent in full_nodes:
                    extent_candidates.add(present)
                else:
                    missing_candidates.add(present)
    mapped_end_nodes = {
        route["pointNodeIds"][0] for route in routes
    } | {route["pointNodeIds"][-1] for route in routes} | {
        target["node"] for target in _target_nodes(nodes, strict_graph).values()
    }
    stop_nodes = set(mapped_end_nodes) | set(road_access_nodes) | {
        node for node, (degree, _keys) in endpoint_degrees.items() if degree != 2
    }
    visited_edges = set()
    segments = []
    cycle_nodes = set()

    def trace(start_node, first_key):
        point_ids = [start_node]
        edge_ids = []
        current = start_node
        key = first_key
        while key not in visited_edges:
            visited_edges.add(key)
            edge_ids.append(key)
            edge = included_edges[key]
            current = edge[1] if edge[0] == current else edge[0]
            point_ids.append(current)
            if current == start_node or current in stop_nodes:
                break
            next_keys = [candidate for candidate in endpoint_degrees[current][1] if candidate not in visited_edges]
            if not next_keys:
                break
            key = next_keys[0]
        return point_ids, edge_ids

    # Every non-degree-two node starts each compressed branch. This also keeps
    # road-access and mapped-end nodes as explicit segment endpoints.
    for start_node, (degree, keys) in endpoint_degrees.items():
        if degree == 2:
            continue
        for key in keys:
            if key in visited_edges:
                continue
            point_ids, edge_ids = trace(start_node, key)
            segments.append(_network_segment(point_ids, edge_ids, included_edges, nodes, component_by_node[start_node]))

    # Remaining edges are degree-two cycles; preserve one closed segment per cycle.
    for key, edge in sorted(included_edges.items()):
        if key in visited_edges:
            continue
        cycle_nodes.add(edge[0])
        point_ids, edge_ids = trace(edge[0], key)
        segments.append(_network_segment(point_ids, edge_ids, included_edges, nodes, component_by_node[edge[0]]))

    for index, segment in enumerate(segments, 1):
        segment["id"] = f"hike-segment-{index:04d}"

    nodes_output = []
    for node, (degree, _keys) in endpoint_degrees.items():
        if degree == 2 and node not in mapped_end_nodes and node not in road_access_nodes and node not in cycle_nodes:
            continue
        if node in road_access_nodes:
            kind = "road-access"
        elif degree >= 3:
            kind = "junction"
        elif node in missing_candidates:
            kind = "missing-data"
        elif node in extent_candidates:
            kind = "extent-edge"
        elif node in mapped_end_nodes or node in cycle_nodes:
            kind = "waypoint"
        else:
            kind = "mapped-end"
        nodes_output.append({
            "nodeId": node,
            "coordinate": [nodes[node][1], nodes[node][0]],
            "degree": degree,
            "componentId": component_by_node[node],
            "kind": kind,
        })

    selected_nodes = set(network_adjacency)
    return {
        "segments": segments,
        "nodes": sorted(nodes_output, key=lambda item: item["nodeId"]),
        "stats": {
            "nodeCount": len(selected_nodes),
            "edgeCount": len(included_edges),
            "segmentCount": len(segments),
            "lengthMetres": round(sum(edge[2] for edge in included_edges.values())),
            "junctionCount": sum(1 for item in nodes_output if item["kind"] == "junction"),
            "roadAccessCount": sum(1 for item in nodes_output if item["kind"] == "road-access"),
            "mappedEndCount": sum(1 for item in nodes_output if item["kind"] == "mapped-end"),
            "extentEdgeCount": sum(1 for item in nodes_output if item["kind"] == "extent-edge"),
            "waypointCount": sum(1 for item in nodes_output if item["kind"] == "waypoint"),
            "missingDataCount": sum(1 for item in nodes_output if item["kind"] == "missing-data"),
            "componentCount": len(components),
            "walkingWayCount": len(seed_way_ids),
            "roadLinkWayCount": len(road_way_ids),
            "demBounds": dem_bounds,
        },
    }


def _target_nodes(nodes, graph):
    return {
        key: {"node": min(graph, key=lambda candidate: metres((latitude, longitude), nodes[candidate]))}
        for key, (_name, latitude, longitude) in TARGETS.items()
    }


def build(paths: list[Path]):
    nodes, ways, bounds = read_osm(paths)
    full_nodes = dict(nodes)
    dem_metadata = json.loads(DEM_METADATA_PATH.read_text())
    dem_bounds = {
        "west": dem_metadata["west"], "east": dem_metadata["east"],
        "south": dem_metadata["south"], "north": dem_metadata["north"],
    }
    nodes = {
        node_id: point for node_id, point in nodes.items()
        if dem_bounds["west"] <= point[1] <= dem_bounds["east"]
        and dem_bounds["south"] <= point[0] <= dem_bounds["north"]
    }
    # Keep the historical route selection stable. The new network below is
    # stricter, but the five public route polylines remain schema-compatible.
    graph, source_types = make_graph(nodes, ways, strict=False)
    target_graph, _ = make_graph(nodes, ways, strict=True, include_road_links=False)
    way_lookup = {way_id: (tags, refs) for way_id, tags, refs in ways}
    targets = {}
    for key, (_name, latitude, longitude) in TARGETS.items():
        node = min(target_graph, key=lambda candidate: metres((latitude, longitude), nodes[candidate]))
        targets[key] = {"node": node, "snapMetres": round(metres((latitude, longitude), nodes[node]), 1)}
        if targets[key]["snapMetres"] > 180:
            raise ValueError(f"{key} is too far from mapped walking network: {targets[key]['snapMetres']}m")

    output_routes = []
    for definition in ROUTES:
        start = definition["startNodeId"]
        if start not in graph:
            raise ValueError(f"{definition['id']} start node {start} is not on a public walking graph")
        start_way = way_lookup[definition["startWayId"]]
        if start not in start_way[1]:
            raise ValueError(f"{definition['id']} start node is not on {definition['startWayId']}")
        start_snap = 0.0
        all_nodes, all_edges = [], []
        cursor = start
        for target_key in definition["targets"]:
            segment_nodes, segment_edges = shortest_path(graph, cursor, targets[target_key]["node"])
            all_nodes.extend(segment_nodes if not all_nodes else segment_nodes[1:])
            all_edges.extend(segment_edges)
            cursor = targets[target_key]["node"]
        if "endNodeId" in definition:
            end = definition["endNodeId"]
            if end not in graph or end not in way_lookup[definition["endWayId"]][1]:
                raise ValueError(f"{definition['id']} end node is not on its named OSM way")
            segment_nodes, segment_edges = shortest_path(graph, cursor, end)
            all_nodes.extend(segment_nodes[1:])
            all_edges.extend(segment_edges)
            cursor = end
        route_way_ids = list(dict.fromkeys(edge[1] for edge in all_edges))
        mixed_edges = [edge for edge in all_edges if edge[2] not in WALKING_HIGHWAYS]
        start_latlon = nodes[start]
        end_latlon = nodes[cursor]
        start_way_tags = start_way[0]
        end_way_id = all_edges[-1][1]
        end_way_tags = way_lookup[end_way_id][0]
        output_routes.append({
            "id": definition["id"],
            "name": definition["name"],
            "color": definition["color"],
            "start": definition["startName"],
            "end": definition["endName"],
            "via": definition.get("viaNames", [TARGETS[key][0] for key in definition["targets"][:-1]]),
            "mountainIds": definition["mountainIds"],
            "mappedLengthMetres": round(sum(edge[0] for edge in all_edges)),
            "startSnapMetres": start_snap,
            "sourceEntryElement": {
                "type": "node",
                "id": start,
                "coordinate": [start_latlon[1], start_latlon[0]],
                "wayId": definition["startWayId"],
                "wayName": start_way_tags.get("name", ""),
            },
            "sourceEndElement": {
                "type": "node",
                "id": cursor,
                "coordinate": [end_latlon[1], end_latlon[0]],
                "wayId": end_way_id,
                "wayName": end_way_tags.get("name", ""),
                **({"referenceWay": {"id": definition["endWayId"], "name": way_lookup[definition["endWayId"]][0].get("name", "")}} if "endWayId" in definition and definition["endWayId"] != end_way_id else {}),
            },
            "points": [[round(nodes[node][1], 7), round(nodes[node][0], 7)] for node in all_nodes],
            "pointNodeIds": all_nodes,
            "perEdgeWayIds": [edge[1] for edge in all_edges],
            "sourceWayIds": route_way_ids,
            "sourceWayNames": list(dict.fromkeys(way_lookup[way_id][0]["name"] for way_id in route_way_ids if way_lookup[way_id][0].get("name"))),
            "sourceHighways": sorted({source_types[way_id] for way_id in route_way_ids}),
            "mixedRoadWayIds": list(dict.fromkeys(edge[1] for edge in mixed_edges)),
            "mixedRoadLengthMetres": round(sum(edge[0] for edge in mixed_edges)),
            "mixedRoadHighways": sorted({edge[2] for edge in mixed_edges}),
            "poiSnapMetres": {key: targets[key]["snapMetres"] for key in definition["targets"]},
            "official": definition["official"],
        })

    network = build_network(nodes, ways, output_routes, source_types, dem_bounds, full_nodes)
    return {
        "source": {
            "provider": "OpenStreetMap contributors",
            "geometry": "OSM public walking ways; every rendered point is an OSM node",
            "downloaded": DOWNLOADED,
            "url": API_URL,
            "inputFiles": [
                {
                    "file": path.name,
                    "bounds": bounds.get(path.name),
                    "url": f"{API_URL}?bbox={bounds[path.name]['minlon']},{bounds[path.name]['minlat']},{bounds[path.name]['maxlon']},{bounds[path.name]['maxlat']}" if path.name in bounds else None,
                }
                for path in paths
            ],
            "walkingHighways": sorted(WALKING_HIGHWAYS),
            "roadLinkHighways": sorted(ROAD_LINK_HIGHWAYS),
            "excluded": [
                "access=no/private/employees", "foot=no/private", "area=yes", "building", "indoor",
                "tunnel underground", "footway sidewalk/crossing", "cycleway without explicit foot access",
                "ferry", "aerialway", "motorway",
            ],
            "networkSelection": {
                "seed": "Exact node-pair plus way edges used by the five mapped routes, six peak snaps, and complete named mountain ways; route ways are never seeded wholesale.",
                "roadLinks": "Only exact road-link edges used by the five mapped routes are retained, as geometry and barriers.",
                "expansionBarrier": "Every non-walking highway is a barrier; ordinary pedestrian/cycleway edges expand only when they are exact route edges or named mountain ways.",
                "mountainWayNamePatterns": list(MOUNTAIN_NAME_PATTERNS),
                "demBounds": network["stats"]["demBounds"],
                "missingConnections": "No synthetic straight-line connectors; unshared OSM nodes and filtered links remain disconnected.",
            },
            "note": "Road links are kept only where the five mapped routes use them; no straight-line connectors are generated.",
        },
        "mountainSnapMetres": {key: value["snapMetres"] for key, value in targets.items()},
        "routes": output_routes,
        "network": network,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("osm_xml", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, default=Path("src/data/west-lake-hikes.json"))
    args = parser.parse_args()
    required = {"hills-northwest.osm", "hills-ridge-gap.osm"}
    present = {path.name for path in args.osm_xml}
    missing = sorted(required - present)
    if missing:
        raise SystemExit(f"network source files are required before generation: {', '.join(missing)}")
    output = build(args.osm_xml)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    for route in output["routes"]:
        print(route["name"], route["mappedLengthMetres"], "m", len(route["points"]), "points")
    print("mountain snap max", max(output["mountainSnapMetres"].values()), "m")
    print("network", output["network"]["stats"])


if __name__ == "__main__":
    main()
