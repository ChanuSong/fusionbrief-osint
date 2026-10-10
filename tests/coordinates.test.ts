import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordinatesMatchQuote } from '../server/coordinates.ts';
test('explicit DMS conversion preserves hemispheres and rejects malformed, swapped or invented coordinates', () => {
  assert.ok(coordinatesMatchQuote('N 22°38\'00.0"、E 119°55\'00.0"',22.633333,119.916667));
  assert.ok(coordinatesMatchQuote('S 22°38′ W 119°55′',-22.633333,-119.916667));
  assert.ok(coordinatesMatchQuote('22.633333, 119.916667',22.633333,119.916667));
  assert.equal(coordinatesMatchQuote('S 22°38′ W 119°55′',22.633333,119.916667),false);
  assert.equal(coordinatesMatchQuote('N 22°68′ E 119°55′',23.133333,119.916667),false);
  assert.equal(coordinatesMatchQuote('22.633333, 119.916667',22.633333,19.916667),false);
  assert.equal(coordinatesMatchQuote('대만 남서부',22.633333,119.916667),false);
});
