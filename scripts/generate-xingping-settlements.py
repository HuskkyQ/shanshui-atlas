#!/usr/bin/env python3
"""Build source-traceable Xingping settlement geometry from the 2026-10-23 OSM snapshot."""
from __future__ import annotations
import datetime, hashlib, json, math, struct, xml.etree.ElementTree as ET
from pathlib import Path
from shapely.affinity import rotate
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]; SOURCE=ROOT/'docs/xingping-references/river-osm-map.xml'; OUTPUT=ROOT/'src/data/xingping-settlements.json'; WATER=ROOT/'src/data/xingping-water.json'; META=ROOT/'src/data/xingping-dem.json'; BIN=ROOT/'src/data/xingping-dem.bin'
def pd(p): return [{'lon':x,'lat':y} for x,y in p]
def area(p):
 lat=sum(y for _,y in p)/len(p); sx=111320*math.cos(math.radians(lat)); sy=110540
 return abs(sum(p[i][0]*sx*p[i+1][1]*sy-p[i+1][0]*sx*p[i][1]*sy for i in range(len(p)-1)))/2
def main():
 root=ET.parse(SOURCE).getroot(); nodes={n.attrib['id']:(float(n.attrib['lon']),float(n.attrib['lat'])) for n in root.findall('node') if 'lon' in n.attrib}; buildings=[]; roads=[]; landuse=[]; shoals=[]
 for w in root.findall('way'):
  tags={t.attrib['k']:t.attrib.get('v','') for t in w.findall('tag')}; p=[nodes[n.attrib['ref']] for n in w.findall('nd') if n.attrib['ref'] in nodes]; closed=len(p)>=4 and p[0]==p[-1]; wid='way:'+w.attrib['id']
  if len(p)<2: continue
  if tags.get('building') and closed: buildings.append({'id':wid,'sourceType':'footprint','building':tags['building'],'name':tags.get('name'),'levels':tags.get('building:levels'),'man_made':tags.get('man_made'),'ceremonial_gate':tags.get('ceremonial_gate'),'tags':{k:v for k,v in tags.items() if k in ('building','building:levels','man_made','ceremonial_gate','name','historic','amenity')},'points':pd(p),'areaM2':round(area(p),2)})
  if tags.get('highway'): roads.append({'id':wid,'highway':tags['highway'],'bridge':tags.get('bridge') in ('yes','true','1'),'name':tags.get('name'),'points':pd(p)})
  use=tags.get('landuse'); natural=tags.get('natural')
  if closed and (use in ('residential','forest','wood') or natural=='wood'): landuse.append({'id':wid,'landuse':use or natural,'sourceTag':'landuse' if use else 'natural','points':pd(p),'areaM2':round(area(p),2)})
  if w.attrib['id']=='1316142632' or (closed and natural=='shingle'): shoals.append({'id':wid,'tags':{k:v for k,v in tags.items() if k in ('natural','wetland','name')},'points':pd(p)})
 dem_box=box(110.45,24.900277777777777,110.55972222222223,24.96)
 clipped_landuse=[]
 for a in landuse:
  g=Polygon([(q['lon'],q['lat']) for q in a['points']]).intersection(dem_box)
  if g.is_empty: continue
  parts=list(g.geoms) if g.geom_type=='MultiPolygon' else [g]
  for n,part in enumerate(parts):
   if part.geom_type!='Polygon' or part.area<=0: continue
   item={**a,'id':a['id'] if len(parts)==1 else f"{a['id']}:clip{n}",'points':pd(list(part.exterior.coords)),'areaM2':round(area(list(part.exterior.coords)),2)}; clipped_landuse.append(item)
 landuse=clipped_landuse
 clipped_buildings=[]
 for b in buildings:
  g=Polygon([(q['lon'],q['lat']) for q in b['points']]).intersection(dem_box)
  if g.is_empty: continue
  if g.geom_type=='MultiPolygon': g=max(g.geoms,key=lambda x:x.area)
  if g.geom_type!='Polygon' or g.area<=0: continue
  b['points']=pd(list(g.exterior.coords)); b['areaM2']=round(area(list(g.exterior.coords)),2); clipped_buildings.append(b)
 buildings=clipped_buildings
 clipped_roads=[]
 for r in roads:
  g=LineString([(q['lon'],q['lat']) for q in r['points']]).intersection(dem_box)
  geoms=list(g.geoms) if g.geom_type=='MultiLineString' else ([g] if g.geom_type=='LineString' else [])
  for n,line in enumerate(geoms):
   if len(line.coords)>=2: clipped_roads.append({**r,'id':f"{r['id']}:clip{n}",'points':pd(list(line.coords))})
 roads=clipped_roads
 source_union=unary_union([Polygon([(q['lon'],q['lat']) for q in b['points']]) for b in buildings]); water=json.loads(WATER.read_text()); water_union=unary_union([Polygon([(q['lon'],q['lat']) for q in p['outer']], [[(q['lon'],q['lat']) for q in h] for h in p.get('holes',[])]) for p in water.get('polygons',[]) if len(p.get('outer',[]))>=3]); lines=[LineString([(q['lon'],q['lat']) for q in r['points']]) for r in roads]; road_union=unary_union([x.buffer(.000035) for x in lines])
 meta=json.loads(META.read_text()); raw=struct.unpack('<'+'H'*(BIN.stat().st_size//2),BIN.read_bytes())
 def elev(lon,lat):
  u=max(0,min(1,(lon-meta['west'])/(meta['east']-meta['west'])))*(meta['width']-1); v=max(0,min(1,(meta['north']-lat)/(meta['north']-meta['south'])))*(meta['height']-1); x0=int(u);z0=int(v);x1=min(x0+1,meta['width']-1);z1=min(z0+1,meta['height']-1);tx=u-x0;tz=v-z0; a=raw[z0*meta['width']+x0]*(1-tx)+raw[z0*meta['width']+x1]*tx; b=raw[z1*meta['width']+x0]*(1-tx)+raw[z1*meta['width']+x1]*tx; return (a*(1-tz)+b*tz)/10
 def slope(lon,lat): return max(abs(elev(lon+.00012,lat)-elev(lon-.00012,lat)),abs(elev(lon,lat+.00012)-elev(lon,lat-.00012)))
 residential_areas=[a for a in landuse if a['landuse']=='residential']; total_res_area=sum(a['areaM2'] for a in residential_areas) or 1; inferred=[]; dx=.00017; dy=.00013
 for a in landuse:
  if a['landuse']!='residential': continue
  target=max(3,round(4000*a['areaM2']/total_res_area)); local_candidates=[]
  poly=Polygon([(q['lon'],q['lat']) for q in a['points']]); center=poly.centroid; near=min(lines,key=lambda x:x.distance(center),default=None); angle=0
  if near and near.length: c,d=list(near.coords)[0],list(near.coords)[-1]; angle=math.degrees(math.atan2(d[1]-c[1],d[0]-c[0]))
  local=rotate(poly,-angle,origin=center); x0,y0,x1,y1=local.bounds; count=0
  for ix in range(int((x1-x0)/dx)+1):
   for iy in range(int((y1-y0)/dy)+1):
    lot=rotate(box(x0+(ix+.5)*dx-.000045,y0+(iy+.5)*dy-.00006,x0+(ix+.5)*dx+.000045,y0+(iy+.5)*dy+.00006),angle,origin=center); c=lot.centroid
    corners=list(lot.exterior.coords)[:-1]; heights=[elev(x,y)*.0135 for x,y in corners]+[elev(c.x,c.y)*.0135]
    if not poly.contains(lot) or lot.intersects(source_union) or lot.intersects(water_union) or lot.intersects(road_union) or slope(c.x,c.y)>18 or max(heights)-min(heights)>.025: continue
    local_candidates.append({'id':f"inferred:{a['id']}:{count}",'sourceType':'inferred','inferredFrom':a['id'],'building':'residential','points':pd(list(lot.exterior.coords)),'areaM2':round(area(list(lot.exterior.coords)),2),'streetAngle':round(angle,2)}); count+=1
    # Keep scanning the whole clipped polygon so later stable sampling
    # cannot collapse into the first grid corner.
  local_candidates.sort(key=lambda item: (item['points'][0]['lon'], item['points'][0]['lat']))
  if len(local_candidates)>target:
   step=len(local_candidates)/target; inferred.extend(local_candidates[min(len(local_candidates)-1,int((i+.5)*step))] for i in range(target))
  else: inferred.extend(local_candidates)
  if not local_candidates:
   c=poly.representative_point()
   if not c.within(water_union) and not c.within(source_union):
    lot=box(c.x-.00003,c.y-.00003,c.x+.00003,c.y+.00003)
    hs=[elev(x,y)*.0135 for x,y in list(lot.exterior.coords)[:-1]]
    if poly.contains(lot) and not lot.intersects(water_union) and not lot.intersects(source_union) and not lot.intersects(road_union) and max(hs)-min(hs)<=.025: inferred.append({'id':f"inferred:{a['id']}:fallback",'sourceType':'inferred','inferredFrom':a['id'],'building':'residential','points':pd(list(lot.exterior.coords)),'areaM2':round(area(list(lot.exterior.coords)),2),'streetAngle':round(angle,2)})
 buildings.extend(inferred); payload={'source':{'dataset':'OpenStreetMap','snapshot':SOURCE.relative_to(ROOT).as_posix(),'snapshotDate':'2026-10-23','sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'generatedAt':datetime.date.today().isoformat(),'license':'ODbL 1.0','bounds':{'west':110.45,'south':24.900277777777777,'east':110.55972222222223,'north':24.96}},'buildings':buildings,'roads':roads,'landuse':landuse,'shoals':shoals,'counts':{'sourceBuildings':len(buildings)-len(inferred),'inferredBuildings':len(inferred),'buildingsTotal':len(buildings),'roads':len(roads),'residential':sum(x['landuse']=='residential' for x in landuse),'landuse':len(landuse),'shoals':len(shoals)},'limitations':'Source footprints are unchanged. Inferred homes are deterministic compact pads inside mapped residential polygons, excluding source water, roads, existing footprints and steep DEM cells; they are not a survey claim.'}
 OUTPUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n'); print(json.dumps(payload['counts'],ensure_ascii=False))
if __name__=='__main__': main()
