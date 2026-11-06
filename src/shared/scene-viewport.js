// Resizing changes projection only. Preset framing belongs to explicit view changes.
export function resizeTerrainViewport(container, camera, renderer) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return null;
  camera.aspect = width / height;
  camera.fov = width < 700 ? 53 : 42;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  return { width, height };
}
