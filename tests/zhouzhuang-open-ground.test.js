import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation } from '../src/zhouzhuang/navigation.js';
import { createWaterQuery } from '../src/zhouzhuang/surfaces.js';

const bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
const street = { id: 'street', kind: 'street', width: 3, nodeIds: ['a','b'], points: [{x:-10,y:2.1,z:-10},{x:-10,y:2.1,z:10}] };

test('visible open ground can be crossed beyond the old narrow road corridor', () => {
  const nav = createNavigation([street], {bounds,groundY:2,channels:[],obstacles:[]});
  const start = nav.locate(-8,0);
  assert.ok(start, 'open land beside the street must be available, not an air wall');
  const end = nav.move(start,12,0);
  assert.ok(Math.abs(end.x-4)<1e-6);
  assert.equal(end.y,2);
});

test('open ground still stops at the visible river and cannot tunnel to the opposite bank', () => {
  const nav = createNavigation([street], {bounds,channels:[{width:4,points:[{x:0,z:-30},{x:0,z:30}]}]});
  const end = nav.move(nav.locate(-8,0),30,0);
  assert.ok(end.x<=-2.24, `the player must remain on the near bank: ${end.x}`);
  assert.equal(nav.locate(0,0),null);
});

test('an ordinary street cannot substitute for a bridge across water', () => {
  const road = {...street,points:[{x:-10,y:2.1,z:0},{x:10,y:2.1,z:0}]};
  const nav = createNavigation([road], {bounds,channels:[{width:4,points:[{x:0,z:-30},{x:0,z:30}]}]});
  const end = nav.move(nav.locate(-8,0),20,0);
  assert.ok(end.x<=-2.24, 'a street overlaid on water must stop at the bank');
  assert.equal(nav.locate(0,0),null);
});

test('the walking body cannot skip a thin visible wall during a long move', () => {
  const nav = createNavigation([], {bounds,obstacles:[{type:'box',x:0,z:0,width:0.01,depth:4}]});
  const end = nav.move(nav.locate(-1.03,0),2.06,0);
  assert.ok(end.x<=-0.254, 'default 0.25m walking radius must stop before the wall');
});

test('solid house walls block while open courtyards and side passages remain available', () => {
  const nav = createNavigation([], {bounds,obstacles:[{type:'box',x:0,z:0,yaw:Math.PI/4,width:6,depth:4}]});
  const end = nav.move(nav.locate(-12,0),24,0);
  assert.ok(end.x < -2, 'must stop at the actual house body');
  const clear = nav.move(nav.locate(-12,10),24,0);
  assert.ok(Math.abs(clear.x-12)<1e-6, 'a visible side passage must not be blocked');
});

test('a mapped bridge supports a crossing above water but its high sides cannot be stepped through', () => {
  const bridge = {id:'bridge',kind:'bridge',width:3,nodeIds:['p','q'],points:[
    {x:-5,y:2,z:0},{x:0,y:4,z:0},{x:5,y:2,z:0},
  ]};
  const nav = createNavigation([bridge], {bounds,channels:[{width:4,points:[{x:0,z:-30},{x:0,z:30}]}]});
  const crossed = nav.move(nav.locate(-8,0),16,0);
  assert.ok(crossed.x>7.8);
  assert.equal(crossed.y,2);
  const high = nav.locate(0,0,'bridge');
  const side = nav.move(high,0,8);
  assert.ok(side.z<=1.26, 'bridge rail side is not an exit down into water');
  const dryNav = createNavigation([bridge],{bounds,obstacles:[]});
  const drySide = dryNav.move(dryNav.locate(0,0,'bridge'),0,8);
  assert.ok(drySide.z<=1.26, 'a large height discontinuity cannot bypass a visible bridge rail');
});

test('water polygons retain their source island holes and agree with the collision margin', () => {
  const waterAreas=[{points:[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}],holes:[[
    {x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:-2,z:2},
  ]]}];
  const query=createWaterQuery({waterAreas});
  assert.equal(query.contains(0,0),false);
  assert.equal(query.contains(5,0),true);
  assert.ok(query.signedDistance(0,0)>1.9);
  assert.ok(query.signedDistance(5,0)<-2.9);
  const nav=createNavigation([],{bounds,waterAreas});
  assert.ok(nav.locate(0,0));
  assert.equal(nav.locate(5,0),null);
  const edge=nav.move(nav.locate(0,0),20,0);
  assert.ok(edge.x<=1.76,'cannot cross water from the island');
});

test('a sourced bank correction changes both the visible shoreline query and walking ground', () => {
  const channels=[{width:7,points:[{x:0,z:-30},{x:0,z:30}]}];
  const bank={width:2.8,points:[{x:3,z:-20},{x:3,z:20}]};
  assert.equal(createWaterQuery({channels}).contains(3,0),true);
  const query=createWaterQuery({channels,landPaths:[bank]});
  assert.equal(query.contains(3,0),false);
  assert.equal(query.contains(0,0),true,'bank correction must not fill the canal centre');
  const nav=createNavigation([],{bounds,channels,landPaths:[bank]});
  assert.ok(nav.locate(3,0));
  assert.equal(nav.locate(0,0),null);
  assert.ok(nav.move(nav.locate(3,-10),0,20).z>9.9);
});
