import * as THREE from 'three';
import { createCliffModel } from './cliff.js';
import { createXuankongArchitecture } from './architecture.js';
import { XUANKONG_LAYOUT } from './layout.js';

/**
 * Composes the sampled cliff first, then mounts the temple architecture against
 * that same profile. Each component owns and disposes only its own resources.
 */
export function createXuankongModel() {
  const cliff = createCliffModel();
  const architecture = createXuankongArchitecture();
  const group = new THREE.Group();
  group.name = 'xuankong-si-model';
  group.userData = {
    kind: 'artistic-approximation',
    subject: 'Xuankong Temple cliff and exterior architectural group',
    orientation: XUANKONG_LAYOUT.orientation,
    sourceBoundary: 'public-dimensions-photo-guided-detail-no-survey-drawings',
    scope: 'cliff-courtyard-two-towers-bridge-and-visible-supports-no-interior-statues',
  };
  cliff.group.name = 'building-cliff';
  group.add(cliff.group);
  group.add(architecture.group);
  group.updateMatrixWorld(true);

  const anchors = {
    cliff: cliff.anchors.cliff.clone(),
    courtyard: architecture.anchors.courtyard.clone(),
    'south-tower': architecture.anchors['south-tower'].clone(),
    bridge: architecture.anchors.bridge.clone(),
    'north-tower': architecture.anchors['north-tower'].clone(),
    structure: architecture.anchors.structure.clone(),
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cliff.dispose();
    architecture.dispose();
  };
  return { group, anchors, dispose };
}
