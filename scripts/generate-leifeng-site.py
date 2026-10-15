"""Extract the researched OSM site and existing DEM into local exhibit units."""
from pathlib import Path
import json
import math
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'docs/leifeng-references/leifeng-osm-2026-10-15.osm.xml'
osm = ET.parse(source).getroot()
nodes = {n.attrib['id']: n for n in osm.findall('node')}
ways = {w.attrib['id']: w for w in osm.findall('way')}
meta = json.loads((ROOT / 'src/data/west-lake-dem.json').read_text())
dem = (ROOT / 'src/data/west-lake-dem.bin').read_bytes()
water = (ROOT / 'src/data/west-lake-water.bin').read_bytes()
origin = [120.145, 30.233859]
units = 0.5
lon_scale = 111320 * math.cos(math.radians((meta['north'] + meta['south']) / 2))
lon_step = (meta['east'] - meta['west']) / (meta['width'] - 1)
lat_step = (meta['north'] - meta['south']) / (meta['height'] - 1)


def local(lon, lat):
    return [round((lon - origin[0]) * lon_scale * units, 6),
            round((origin[1] - lat) * 111320 * units, 6)]


def coordinates(way_id):
    return [local(float(nodes[n.attrib['ref']].attrib['lon']),
                  float(nodes[n.attrib['ref']].attrib['lat']))
            for n in ways[str(way_id)].findall('nd')]


def elevation(col, row):
    index = row * meta['width'] + col
    return meta['lakeElevation'] - 3 if water[index] else struct.unpack_from('<h', dem, index * 2)[0] / 10


def triangle(a, b, c, d, x, z):
    return a*(1-x-z)+b*x+c*z if x+z <= 1 else b*(1-z)+c*(1-x)+d*(x+z-1)


u = (origin[0] - meta['west']) / lon_step
v = (meta['north'] - origin[1]) / lat_step
col, row = math.floor(u), math.floor(v)
base = triangle(elevation(col, row), elevation(col+1, row),
                elevation(col, row+1), elevation(col+1, row+1), u-col, v-row)
boundary = coordinates(975360504)


def inside(point):
    x, z = point
    result = False
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        if (a[1] > z) != (b[1] > z) and x < (b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:
            result = not result
    return result


def clipped_paths(way_id, kind):
    # Split only where a source segment intersects the park outline.
    # Boundary endpoints are interpolation of that same source segment.
    parts = []
    current = []
    source_points = coordinates(way_id)
    for a, b in zip(source_points, source_points[1:]):
        dx, dz = b[0]-a[0], b[1]-a[1]
        times = [0, 1]
        for c, d in zip(boundary, boundary[1:] + boundary[:1]):
            ex, ez = d[0]-c[0], d[1]-c[1]
            divisor = dx*ez-dz*ex
            if abs(divisor) < 1e-9:
                continue
            t = ((c[0]-a[0])*ez-(c[1]-a[1])*ex) / divisor
            u = ((c[0]-a[0])*dz-(c[1]-a[1])*dx) / divisor
            if 0 < t < 1 and 0 <= u <= 1:
                times.append(t)
        times = sorted(set(times))
        for start, end in zip(times, times[1:]):
            p = [round(a[0]+dx*start, 6), round(a[1]+dz*start, 6)]
            q = [round(a[0]+dx*end, 6), round(a[1]+dz*end, 6)]
            if inside([a[0]+dx*(start+end)/2, a[1]+dz*(start+end)/2]):
                if current and current[-1] != p:
                    parts.append(current)
                    current = []
                if not current:
                    current.append(p)
                current.append(q)
            elif current:
                parts.append(current)
                current = []
    if current:
        parts.append(current)
    return [{'id': str(way_id) if len(parts) == 1 else f'{way_id}-{i+1}',
             'sourceWay': str(way_id), 'kind': kind, 'points': points}
            for i, points in enumerate(parts) if len(points) > 1]

min_x, max_x = min(p[0] for p in boundary), max(p[0] for p in boundary)
min_z, max_z = min(p[1] for p in boundary), max(p[1] for p in boundary)
left = math.floor((origin[0] + min_x/(lon_scale*units) - meta['west']) / lon_step) - 1
right = math.ceil((origin[0] + max_x/(lon_scale*units) - meta['west']) / lon_step) + 1
top = math.floor((meta['north'] - origin[1] + min_z/(111320*units)) / lat_step) - 1
bottom = math.ceil((meta['north'] - origin[1] + max_z/(111320*units)) / lat_step) + 1
grid_origin = local(meta['west'] + left*lon_step, meta['north'] - top*lat_step)
grid = {
    'width': right-left+1, 'height': bottom-top+1,
    'originX': grid_origin[0], 'originZ': grid_origin[1],
    'stepX': lon_step*lon_scale*units, 'stepZ': lat_step*111320*units,
    'values': [round((elevation(c, r)-base)*meta['verticalExaggeration']*units, 6)
               for r in range(top, bottom+1) for c in range(left, right+1)],
}
layout = {
    'source': {'osmSnapshot': source.relative_to(ROOT).as_posix(), 'date': '2026-10-15',
               'coordinates': 'WGS84', 'dem': 'Copernicus GLO-30, existing project crop',
               'verticalExaggeration': meta['verticalExaggeration'],
               'boundaryStatus': 'OSM park outline, not a surveyed scenic redline'},
    'unitsPerMetre': units, 'origin': origin, 'originElevation': base,
    'boundary': boundary, 'pond': coordinates(62124950),
    'entrance': local(120.1446484, 30.2328109),
    'exit': local(120.1436703, 30.2326964),
    'peak': local(120.1438927, 30.2339681),
    'paths': [part for id, kind in [
        (975357010, 'walk'), (340652169, 'ascending'), (1448129176, 'walk'),
        (62124942, 'walk'), (229406088, 'walk'), (229406089, 'walk'),
        (229406104, 'walk'), (639112504, 'walk'), (838995360, 'walk'), (838995361, 'walk'),
    ] for part in clipped_paths(id, kind)],
    'ground': grid,
}
output = ROOT / 'src/west-lake/leifeng-pagoda/site-layout.js'
output.write_text('// Generated by scripts/generate-leifeng-site.py; retain source coordinates and provenance.\n'
                  + 'export const LEIFENG_SITE = ' + json.dumps(layout, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'{output.relative_to(ROOT)}: {grid["width"]}x{grid["height"]} DEM samples, {len(layout["paths"])} paths')
