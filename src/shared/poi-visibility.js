const DISTANCE_LIMITS = {
  1: 20,
  2: 45,
  3: Infinity,
};

/**
 * Compact markers stay eligible at every distance. The caller applies category,
 * zoom density, and screen-overlap rules to the eligible candidates.
 */
export function isPOIVisible({
  importance,
  presentation,
  distance,
  selected = false,
  focused = false,
  previousVisible = false,
}) {
  if (selected || focused) return true;
  if (['core', 'region', 'dot'].includes(presentation)) return true;

  const limit = DISTANCE_LIMITS[importance];
  if (limit === Infinity) return true;
  if (limit === undefined) return false;

  return distance <= limit * (previousVisible ? 1.1 : 1);
}
