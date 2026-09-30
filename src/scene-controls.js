export function enableShiftPan(controls) {
  const canvas = controls.domElement;
  const onPointerDown = (event) => {
    controls.enablePan = event.pointerType !== 'touch' && event.button === 0 && event.shiftKey === true;
  };
  controls.enablePan = false;
  // Run before OrbitControls chooses rotation or panning for this gesture.
  canvas.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown, true);
    controls.enablePan = false;
  };
}
