const TIERS = {
  far: { budget: 8, spacing: 110 },
  mid: { budget: 16, spacing: 72 },
  near: { budget: 36, spacing: 36 },
};

function getTier(framing, previousTier) {
  if (previousTier === 'near') return framing <= 6 ? 'near' : framing > 14.4 ? 'far' : 'mid';
  if (previousTier === 'mid') return framing < 5 ? 'near' : framing > 14.4 ? 'far' : 'mid';
  return framing < 5 ? 'near' : framing < 12 ? 'mid' : 'far';
}

/** Select a stable, screen-spaced subset of ordinary West Lake map points. */
export function selectMapPoints(points, framing, previousTier = 'far') {
  const tier = getTier(framing, previousTier);
  const { budget, spacing } = TIERS[tier];
  const ranked = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => tier !== 'far' || point.importance > 1)
    .sort((a, b) => b.point.importance - a.point.importance
      || Number(Boolean(b.point.previousVisible)) - Number(Boolean(a.point.previousVisible))
      || a.index - b.index);
  const selected = [];

  for (const { point } of ranked) {
    if (selected.length === budget) break;
    const fits = selected.every((other) => Math.hypot(point.x - other.x, point.y - other.y)
      >= spacing * (point.previousVisible || other.previousVisible ? 0.85 : 1));
    if (fits) selected.push(point);
  }
  return { tier, points: selected };
}
