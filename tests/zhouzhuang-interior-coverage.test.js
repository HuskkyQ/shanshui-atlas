import test from 'node:test';
import assert from 'node:assert/strict';
import { measureInteriorCoverage } from '../scripts/check-zhouzhuang-housing-coverage.mjs';
import housing from '../src/data/zhouzhuang-housing.json' with { type: 'json' };
import landUse from '../src/data/zhouzhuang-landuse.json' with { type: 'json' };
import { pointInPolygon } from '../src/zhouzhuang/surfaces.js';

for (const area of measureInteriorCoverage()) {
  test(`residential interior ${area.id} has housing coverage beyond the source street frontage`, () => {
    assert.ok(area.eligible >= 30, 'fixture must sample a substantial residential interior');
    assert.ok(area.coverage >= 0.65, `area ${area.id}: only ${area.covered}/${area.eligible} interior samples have a house within 14m`);
  });
}

test('housing infill keeps sourced open areas free of ordinary houses', () => {
  assert.ok(landUse.protected.some(area => area.sourceWayId === '608482756' && area.kind === 'park'));
  assert.ok(landUse.protected.some(area => area.sourceWayId === '608668761' && area.kind === 'religious'));
  for (const house of housing.houses) {
    assert.ok(!landUse.protected.some(area => pointInPolygon(house.x, house.z, area.points)),
      `${house.plotId} occupies a sourced non-residential area`);
  }
});
