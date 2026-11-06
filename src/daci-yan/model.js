import * as THREE from 'three';
import { createDaciCliffModel } from './cliff.js';
import { createDaciArchitecture } from './architecture.js';

export function createDaciModel() {
  const cliff = createDaciCliffModel();
  cliff.group.name = 'building-cliff';
  const architecture = createDaciArchitecture();
  const group = new THREE.Group(); group.name = 'daci-model';
  group.add(cliff.group, architecture.group);
  const anchors = { cliff: cliff.anchors.cliff, ...architecture.anchors };
  const dispose = () => { cliff.dispose(); architecture.dispose(); };
  return { group, anchors, dispose };
}
