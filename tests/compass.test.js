import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getCompassAngle, createCompass } from '../src/shared/compass.js';

const close=(actual,expected)=>assert.ok(Math.abs(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)))<1e-7,`${actual} differs from ${expected}`);

test('north points to the correct screen side from four orbit directions',()=>{
  const camera=new THREE.PerspectiveCamera();
  for (const [x,z,angle] of [[0,10,0],[10,0,Math.PI/2],[0,-10,Math.PI],[-10,0,-Math.PI/2]]) {
    camera.position.set(x,8,z);
    camera.lookAt(0,0,0);
    close(getCompassAngle(camera),angle);
  }
});

test('panning and moving the camera do not change its compass direction',()=>{
  const camera=new THREE.PerspectiveCamera();
  camera.position.set(10,12,15);camera.lookAt(0,0,0);
  const angle=getCompassAngle(camera);
  camera.position.add(new THREE.Vector3(150,30,-60));
  close(getCompassAngle(camera),angle);
});

test('vertical top views and first-person pitch retain a stable compass heading',()=>{
  const camera=new THREE.PerspectiveCamera();
  for (const pitch of [0,1.2,Math.PI/2,-Math.PI/2]) {
    camera.rotation.set(pitch,-Math.PI/2,0,'YXZ');
    close(getCompassAngle(camera),-Math.PI/2);
  }
  camera.rotation.set(-Math.PI/2,0,0,'YXZ');
  close(getCompassAngle(camera),0);
});

test('custom north and transformed parent scenes use world orientation',()=>{
  const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera();
  parent.add(camera);
  close(getCompassAngle(camera,[1,0,0]),Math.PI/2);
  parent.rotation.y=Math.PI/2;
  close(getCompassAngle(camera),Math.PI/2);
});

test('compass owns one noninteractive overlay and removes only that overlay',()=>{
  const children=[];
  const container={append(element){children.push(element);},ownerDocument:{createElement(){
    const dial={style:{}};
    const element={style:{},dataset:{},setAttribute(name,value){this[name]=value;},querySelector(){return dial;},remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1);}};
    return element;
  }}};
  const compass=createCompass(container,{reference:'model'});
  assert.equal(children.length,1);
  assert.match(children[0]['aria-label'],/模型/);
  const camera=new THREE.PerspectiveCamera();
  compass.update(camera);
  assert.match(children[0].querySelector().style.transform,/rotate\(/);
  compass.dispose();compass.dispose();
  assert.equal(children.length,0);
});
