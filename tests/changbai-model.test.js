import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import metadata from '../src/data/changbai-dem.json' with { type: 'json' };
import lake from '../src/data/changbai-lake.json' with { type: 'json' };
import { buildChangbaiModel } from '../src/changbai/model.js';

const bytes = await readFile(new URL('../src/data/changbai-dem.bin', import.meta.url));
const values = Uint16Array.from({length:bytes.length/2},(_,i)=>bytes.readUInt16LE(i*2));
const create = () => buildChangbaiModel({ metadata, elevations: values, lake });

test('geographic conversion retains east/north direction and core source heights', () => {
  const model = create();
  const lon=(metadata.west+metadata.east)/2, lat=(metadata.north+metadata.south)/2;
  const a=model.toWorld(lon,lat), north=model.toWorld(lon,lat+0.01),east=model.toWorld(lon+0.01,lat);
  assert.ok(north.z<a.z);assert.ok(east.x>a.x);
  let checked=0;
  for(let row=30;row<metadata.height-30;row+=23) for(let col=30;col<metadata.width-30;col+=23){
    const longitude=metadata.west+col/(metadata.width-1)*(metadata.east-metadata.west);
    const latitude=metadata.north-row/(metadata.height-1)*(metadata.north-metadata.south);
    const p=model.toWorld(longitude,latitude),raw=values[row*metadata.width+col]/10;
    if(model.isLake(p.x,p.z) || model.peripheralFactor(p.x,p.z)<0.999) continue;
    assert.ok(Math.abs(model.getHeight(p.x,p.z)-model.elevationToWorld(raw))<1e-6);
    checked++;
  }
  assert.ok(checked>50); model.dispose();
});

test('flat lake retains every sourced shoreline vertex and points upward', () => {
  const model=create(),water=model.group.getObjectByName('tianchi-lake');
  assert.ok(water?.isMesh);const positions=water.geometry.attributes.position;
  assert.equal(positions.count,lake.points.length);
  for(let i=0;i<lake.points.length;i++){
    const p=model.toWorld(lake.points[i].lon,lake.points[i].lat);
    assert.ok(Math.hypot(positions.getX(i)-p.x,positions.getZ(i)-p.z)<1e-4);
    assert.ok(Math.abs(positions.getY(i)-model.lakeLevel)<1e-4);
  }
  const hits=new THREE.Raycaster(model.lakeCenter.clone().add(new THREE.Vector3(0,100,0)),new THREE.Vector3(0,-1,0)).intersectObject(water);
  assert.ok(hits.length>0);assert.equal(water.material.transparent,false);model.dispose();
});

test('near terrain restores source resolution without moving the complete landscape footprint', () => {
  const model=create(),camera=new THREE.PerspectiveCamera();
  camera.position.copy(model.lakeCenter).add(new THREE.Vector3(0,200,200));model.update(camera,0);
  const terrain=model.group.getObjectByName('changbai-terrain'),far=terrain.children.find(c=>c.visible);
  const farCount=far.geometry.index.count;assert.ok(farCount/3<200000);
  camera.position.copy(model.lakeCenter).add(new THREE.Vector3(0,15,30));model.update(camera,1);
  const near=terrain.children.find(c=>c.visible);assert.ok(near.geometry.index.count>farCount);
  assert.ok(near.geometry.index.count/3<650000);
  far.geometry.computeBoundingBox();near.geometry.computeBoundingBox();
  assert.ok(far.geometry.boundingBox.min.distanceTo(near.geometry.boundingBox.min)<0.03);
  assert.ok(far.geometry.boundingBox.max.distanceTo(near.geometry.boundingBox.max)<0.2);
  model.update(camera,2);assert.equal(terrain.children.find(c=>c.visible),near);
  assert.ok(model.group.getObjectByName('changbai-display-base'));model.dispose();
});

test('model releases cached terrain and water exactly once', () => {
  const model=create(),camera=new THREE.PerspectiveCamera();camera.position.copy(model.lakeCenter);model.update(camera,0);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  model.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){materials.add(o.material);if(o.material.map)textures.add(o.material.map);}});
  let released=0;for(const resource of [...geometries,...materials,...textures])resource.addEventListener('dispose',()=>released++);
  model.dispose();assert.equal(released,geometries.size+materials.size+textures.size);
  model.dispose();assert.equal(released,geometries.size+materials.size+textures.size);
});


test('deferred detail keeps the complete coarse landscape while the worker is pending', () => {
  const model=buildChangbaiModel({metadata,elevations:values,lake,deferDetail:true});
  const camera=new THREE.PerspectiveCamera();camera.position.copy(model.lakeCenter);
  model.update(camera,0);
  const terrain=model.group.getObjectByName('changbai-terrain');
  assert.equal(terrain.children.length,1);
  assert.equal(terrain.children[0].visible,true);
  model.buildDetail();
  assert.equal(model.update(camera,1),true);
  assert.equal(terrain.children.filter(child=>child.visible).length,1);
  assert.equal(terrain.children.find(child=>child.visible).userData.sourceSampleStep,1);
  model.dispose();
});
