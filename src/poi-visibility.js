const DISTANCE_LIMITS = {
  1: 20,
  2: 45,
  3: Infinity,
};

/**
 * Applies only the distance/selection layer. Category and screen-overlap
 * decisions belong to the caller so core POIs can remain discoverable.
 */
export function isPOIVisible({
  importance,
  distance,
  selected = false,
  focused = false,
  previousVisible = false,
}) {
  if (selected || focused) return true;

  const limit = DISTANCE_LIMITS[importance];
  if (limit === Infinity) return true;
  if (limit === undefined) return false;

  return distance <= limit * (previousVisible ? 1.1 : 1);
}
