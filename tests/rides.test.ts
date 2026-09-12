import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFare, inServiceArea, isFreshLocation, canCancel, validateDriver } from '../src/domain/rides.ts';

test('display fares use integer cents and include distance and time', () => {
  assert.equal(calculateFare(2400, 400, { base_cents: 400, minimum_cents: 700, per_km_cents: 170, per_minute_cents: 0 }), 808);
  assert.equal(calculateFare(100, 60, { base_cents: 400, minimum_cents: 700, per_km_cents: 170, per_minute_cents: 30 }), 700);
  assert.throws(() => calculateFare(NaN, 400, { base_cents: 400, minimum_cents: 700, per_km_cents: 170, per_minute_cents: 0 }));
});
test('unknown, out-of-area and stale coordinates never appear as a live driver', () => {
  assert.equal(inServiceArea({ lat: -15.546, lng: -55.165, label: 'Campo Verde' }), true);
  assert.equal(inServiceArea({ lat: null as unknown as number, lng: -55.165, label: 'Inválido' }), false);
  assert.equal(inServiceArea({ lat: -15.6, lng: -56.1, label: 'Fora' }), false);
  assert.equal(isFreshLocation(new Date(100000).toISOString(), 145001), false);
  assert.equal(isFreshLocation('invalid'), false);
  assert.equal(isFreshLocation(new Date(100000).toISOString(), 110000), true);
});
test('cancellation before boarding; vehicle validation accepts both Brazilian plate formats', () => {
  assert.equal(canCancel('arrived'), true); assert.equal(canCancel('in_progress'), false);
  assert.equal(validateDriver('Honda CG', 'Preta', 'ABC-1234', ''), null);
  assert.equal(validateDriver('Honda CG', 'Preta', 'ABC1D23', ''), null);
  assert.ok(validateDriver('Honda CG', 'Preta', '<script>', ''));
});
