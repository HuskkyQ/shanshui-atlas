"""Extract mapped cliff traces and shoals, without assigning measured heights."""
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

from shapely.geometry import Polygon, box

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/xingping-references/river-osm-map.xml'


def main():
    root = ET.parse(SOURCE).getroot()
    nodes = {n.get('id'): {'nodeId': n.get('id'), 'lon': float(n.get('lon')), 'lat': float(n.get('lat'))} for n in root.findall('node')}
    metadata = json.loads((ROOT / 'src/data/xingping-dem.json').read_text())
    bounds = {k: metadata[k] for k in ('west', 'east', 'south', 'north')}
    clip = box(bounds['west'], bounds['south'], bounds['east'], bounds['north'])
    cliffs, shoals = [], []
    for way in root.findall('way'):
        tags = {t.get('k'): t.get('v') for t in way.findall('tag')}
        if tags.get('natural') not in ('cliff', 'shingle'):
            continue
        refs = [n.get('ref') for n in way.findall('nd')]
        assert all(ref in nodes for ref in refs), f"Incomplete source way {way.get('id')}"
        points = [nodes[ref] for ref in refs]
        source = {'url': f"https://www.openstreetmap.org/way/{way.get('id')}", 'kind': tags['natural']}
        if tags['natural'] == 'cliff':
            cliffs.append({'id': way.get('id'), 'name': tags.get('name'), 'points': points, 'source': source})
        else:
            assert refs[0] == refs[-1], f"Unclosed shoal {way.get('id')}"
            polygon = Polygon([(p['lon'], p['lat']) for p in points]).intersection(clip)
            parts = [polygon] if polygon.geom_type == 'Polygon' else list(polygon.geoms) if polygon.geom_type == 'MultiPolygon' else []
            for part in parts:
                if part.is_empty:
                    continue
                shoals.append({'id': way.get('id'), 'name': tags.get('name'), 'source': source,
                               'outer': [{'lon': x, 'lat': y} for x, y in list(part.exterior.coords)[:-1]],
                               'holes': [[{'lon': x, 'lat': y} for x, y in list(ring.coords)[:-1]] for ring in part.interiors]})
    output = {'source': {'dataset': 'OpenStreetMap', 'snapshot': str(SOURCE.relative_to(ROOT)),
                         'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'retrieved': '2026-10-23',
                         'license': 'ODbL 1.0'}, 'bounds': bounds, 'cliffs': cliffs, 'shoals': shoals,
              'limitations': 'Cliff traces are planimetric map evidence, not measured cliff heights. Shoal display elevation is artistic, not a date-specific exposed shoreline or bathymetry.'}
    (ROOT / 'src/data/xingping-details.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f"Extracted {len(cliffs)} cliff traces, {len(shoals)} clipped shoals")


if __name__ == '__main__':
    main()
