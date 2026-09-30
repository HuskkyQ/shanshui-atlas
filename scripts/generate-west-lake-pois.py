"""Extract named West Lake hill trailheads and sights from OSM XML exports.

The configuration uses stable OSM element IDs rather than hand-drawn points.
Way locations use the mean of their boundary nodes so the UI can
display buildings and worship sites without inventing a location.
"""

from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

DEM_BOUNDS = {"west": 120.05513888888889, "east": 120.17097222222222, "north": 30.285972222222224, "south": 30.16625}
OSM = "https://www.openstreetmap.org"

TRAILHEADS = [
    {"id": "baoshi-foothill", "name": "保俶塔前山路口", "category": "上山口", "element": ("node", 6642625053), "way": "706869403", "mountainIds": ["baoshi", "ge"], "routeIds": ["baoshi-ge"], "description": "保俶塔前山路旁的登山台阶连接处，可上行至保俶塔、宝石山和葛岭一带。", "note": "OSM node shared by 保俶塔前山路 and steps; not a ticket gate."},
    {"id": "beigao-trail", "name": "北高峰登山道口", "category": "上山口", "element": ("node", 1519392833), "way": "138564975", "mountainIds": ["beigao"], "routeIds": ["beigao"], "description": "灵隐寺一带的北高峰登山台阶入口，沿步道可到北高峰山顶附近。", "note": "Named OSM steps way."},
    {"id": "nangao-manjuelong", "name": "烟霞洞·南高峰步道口", "category": "上山口", "element": ("node", 5604066540), "way": "639117641", "sourceNameOverride": "满觉陇路与登山步道连接", "mountainIds": ["nangao"], "routeIds": ["nangao"], "description": "满觉陇路烟霞洞附近的登山步道连接处，可沿山间台阶向南高峰上行。", "note": "OSM node shared by the mapped path and Manjuelong Road."},
    {"id": "longjing-shifeng", "name": "龙井·十里琅珰支线口", "category": "上山口", "element": ("node", 4469526662), "way": "450033737", "mountainIds": ["wuyun"], "routeIds": ["wuyun"], "description": "龙井村一带进入十里琅珰狮峰支线的节点，连接山脊步道与五云山方向。", "note": "Start of named OSM steps way; a branch entrance, not a road junction or ticket gate."},
    {"id": "jiuxi-side-path", "name": "九溪·五云山步道口", "category": "上山口", "element": ("node", 770713481), "way": "1463933441", "sourceNameOverride": "九溪路侧步道", "mountainIds": ["wuyun"], "routeIds": ["wuyun"], "description": "十里琅珰—五云山线路在九溪路侧的公共步道连接节点。", "note": "OSM path node adjacent to named 九溪路; the map does not label it as a gate."},
    {"id": "yuhuang-steps", "name": "玉皇山登山道口", "category": "上山口", "element": ("node", 5029726488), "way": "457498261", "mountainIds": ["yuhuang"], "routeIds": ["yuhuang"], "description": "玉皇山东北侧，登山台阶与老玉皇山路相接的步道口。沿步道上行可到紫来洞附近与山顶一带。", "note": "OSM node shared by 玉皇山登山道 and 老玉皇山路; not a surveyed ticket gate."},
]

SIGHTS = [
    {"id": "baochu-tower", "name": "保俶塔", "category": "山间名胜", "element": ("node", 5312284654), "mountainIds": ["baoshi"], "routeIds": ["baoshi-ge"], "description": "宝石山上的古塔，是西湖北岸的山景地标。可从这里观察塔、山脊与湖面的关系。", "official": "https://ywhz.hangzhou.com.cn/yjls/content/content_6218600.htm"},
    {"id": "baopu-daoist-yard", "name": "抱朴道院", "category": "山间名胜", "element": ("way", 975870012), "mountainIds": ["ge"], "routeIds": ["baoshi-ge"], "description": "葛岭半山腰的道教宫观，与葛洪的传说相关。周边初阳台、炼丹井等遗迹构成葛岭的人文景观。", "official": "https://ywhz.hangzhou.com.cn/zjwh/content/content_6220147.htm"},
    {"id": "lingyin-temple", "name": "灵隐寺", "category": "山间名胜", "element": ("node", 1218588822), "mountainIds": ["beigao"], "routeIds": ["beigao"], "description": "北高峰山麓、飞来峰旁的佛教寺院。可从模型观察寺院与北高峰登山步道的上下山关系。", "official": "https://ywhz.hangzhou.com.cn/zjwh/content/content_6220379.htm"},
    {"id": "longjing-spring", "name": "龙井泉", "category": "山间名胜", "element": ("node", 13371708830), "mountainIds": ["nangao", "wuyun"], "routeIds": ["wuyun"], "description": "龙井谷地的泉点，周边为龙井村和茶园景观。这里可作为观察西湖西侧山谷与茶乡位置的节点。"},
    {"id": "jiuxi-mist-tree", "name": "九溪烟树", "category": "山间名胜", "element": ("node", 13458238803), "mountainIds": ["wuyun"], "routeIds": ["wuyun"], "description": "九溪十八涧一带溪流与树林交织的谷地景观。可观察九溪与五云山山脊之间的位置关系。", "official": "https://ywhz.hangzhou.com.cn/hssj/content/content_6218726.htm"},
    {"id": "yanxia-cave", "name": "烟霞洞", "category": "山间名胜", "element": ("node", 658996803), "mountainIds": ["nangao"], "routeIds": ["nangao"], "description": "南高峰烟霞岭一带的洞穴与石刻景点，也是登南高峰的代表性上山方向之一。", "official": "https://hznews.hangzhou.com.cn/chengshi/content/2022-07/02/content_8296444_0.htm"},
    {"id": "zilai-cave", "name": "紫来洞", "category": "山间名胜", "element": ("node", 5029726518), "mountainIds": ["yuhuang"], "routeIds": ["yuhuang"], "description": "玉皇山半山腰的洞穴景点，洞前平台可俯瞰八卦田与钱塘江，与山顶宫观形成上下层次。", "official": "https://hznews.hangzhou.com.cn/chengshi/content/2022-07/30/content_8318557_0.htm"},
    {"id": "fuxing-temple", "name": "福星观", "category": "山间名胜", "element": ("way", 1417737301), "mountainIds": ["yuhuang"], "routeIds": ["yuhuang"], "description": "玉皇山山顶的道教宫观，是玉皇飞云一带的山顶文化节点。标记展示宫观场所的位置。"},
    {"id": "lingshun-temple", "name": "灵顺寺", "category": "山间名胜", "element": ("way", 676045761), "mountainIds": ["beigao"], "routeIds": ["beigao"], "description": "北高峰山顶的寺院，俗称财神庙。2026 年修缮公告注明 5 月 25 日至 11 月 25 日暂停开放。", "official": "https://hznews.hangzhou.com.cn/shehui/content/2026-05/22/content_9227038.htm"},
]


def read_osm(paths):
    nodes, node_tags, ways = {}, {}, {}
    for path in paths:
        root = ET.parse(path).getroot()
        for node in root.findall("node"):
            node_id = int(node.attrib["id"])
            nodes[node_id] = (float(node.attrib["lon"]), float(node.attrib["lat"]))
            node_tags[node_id] = {tag.attrib["k"]: tag.attrib["v"] for tag in node.findall("tag")}
        for way in root.findall("way"):
            refs = [int(item.attrib["ref"]) for item in way.findall("nd")]
            if refs:
                tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
                ways[int(way.attrib["id"])] = (refs, tags)
    return nodes, node_tags, ways


def locate(spec, nodes, node_tags, ways):
    kind, element_id = spec["element"]
    if kind == "node":
        if element_id not in nodes:
            raise ValueError(f"missing OSM node {element_id} for {spec['id']}")
        coordinate = nodes[element_id]
    else:
        if element_id not in ways:
            raise ValueError(f"missing OSM way {element_id} for {spec['id']}")
        refs = ways[element_id][0]
        if len(refs) > 1 and refs[0] == refs[-1]:
            refs = refs[:-1]
        points = [nodes[node] for node in refs if node in nodes]
        if not points:
            raise ValueError(f"way {element_id} has no coordinates for {spec['id']}")
        coordinate = [sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)]
    if not (DEM_BOUNDS["west"] <= coordinate[0] <= DEM_BOUNDS["east"] and DEM_BOUNDS["south"] <= coordinate[1] <= DEM_BOUNDS["north"]):
        raise ValueError(f"{spec['id']} is outside the terrain bounds")
    if spec.get("way") and int(spec["way"]) not in ways:
        raise ValueError(f"missing source way {spec['way']} for {spec['id']}")
    if kind == "node" and spec.get("way") and element_id not in ways[int(spec["way"])][0]:
        raise ValueError(f"{spec['id']} is not on its source way")
    source_way_id = spec.get("way") or (str(element_id) if kind == "way" else None)
    source_name = spec.get("sourceNameOverride") or (node_tags.get(element_id, {}).get("name", "") if kind == "node" else ways[element_id][1].get("name", ""))
    if not source_name and source_way_id and int(source_way_id) in ways:
        source_name = ways[int(source_way_id)][1].get("name", "")
    result = {key: value for key, value in spec.items() if key not in {"element", "way", "sourceNameOverride"}}
    result.update({"longitude": coordinate[0], "latitude": coordinate[1], "viewOffset": [6, 6, 8], "osm": f"{OSM}/{kind}/{element_id}", "osmElement": f"{kind}/{element_id}", "sourceName": source_name})
    if source_way_id:
        result["sourceWayId"] = source_way_id
    return result


def build(paths):
    nodes, node_tags, ways = read_osm(paths)
    return [locate(spec, nodes, node_tags, ways) for spec in TRAILHEADS], [locate(spec, nodes, node_tags, ways) for spec in SIGHTS]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("osm_xml", nargs="+", type=Path)
    args = parser.parse_args()
    trailheads, sights = build(args.osm_xml)
    Path("src/data/west-lake-trailheads.json").write_text(json.dumps(trailheads, ensure_ascii=False, indent=2) + "\n")
    Path("src/data/west-lake-hill-sights.json").write_text(json.dumps(sights, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
