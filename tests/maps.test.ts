import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapsProvider, MapsError, validPoint } from '../supabase/functions/_shared/maps.ts';
const pickup = { lat: -15.546, lng: -55.165, label: 'Embarque de teste' };
const destination = { lat: -15.55, lng: -55.163, label: 'Destino de teste' };
const key = 'synthetic-provider-key';
const env = (name: string) => ({ MAPS_PROVIDER: 'geoapify', GEOAPIFY_API_KEY: key } as Record<string, string>)[name];
const routeBody = { features: [{ properties: { distance: 850.6, time: 132.2 }, geometry: { type: 'MultiLineString', coordinates: [[[-55.165, -15.546], [-55.163, -15.55]]] } }] };

test('Geoapify requests motorcycle routing and normalizes metres, seconds and geometry', async () => {
  const provider = createMapsProvider(env, async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.geoapify.com');
    assert.equal(url.searchParams.get('mode'), 'motorcycle');
    assert.equal(url.searchParams.get('units'), 'metric');
    assert.equal(url.searchParams.get('apiKey'), key);
    assert.equal(init?.redirect, 'error');
    return Response.json(routeBody);
  });
  const route = await provider.route(pickup, destination);
  assert.equal(route.distance_m, 851); assert.equal(route.duration_s, 132);
  assert.equal(route.provider, 'geoapify-motorcycle');
  assert.deepEqual(route.geometry, { type: 'LineString', coordinates: [[-55.165, -15.546], [-55.163, -15.55]] });
  assert.equal(JSON.stringify(route).includes(key), false);
});
test('address search rejects provider results outside the service area', async () => {
  const provider = createMapsProvider(env, async input => {
    const url = new URL(String(input));
    assert.match(url.searchParams.get('filter')!, /countrycode:br/);
    return Response.json({ results: [{ lat: pickup.lat, lon: pickup.lng, formatted: 'Praça de teste' }, { lat: 0, lon: 0, formatted: 'Fora da cidade' }, null] });
  });
  assert.deepEqual(await provider.search('Praça'), [{ ...pickup, label: 'Praça de teste' }]);
});
test('missing configuration and invalid points never call an upstream provider', async () => {
  let called = false;
  const provider = createMapsProvider(() => undefined, async () => { called = true; return Response.json({}); });
  assert.equal(provider.configured.routing_configured, false);
  await assert.rejects(provider.route(pickup, destination), (error: MapsError) => error.status === 503);
  await assert.rejects(provider.route({ ...pickup, lat: NaN }, destination), (error: MapsError) => error.status === 400);
  assert.equal(validPoint({ ...pickup, label: '   ' }), false);
  assert.equal(called, false);
});
test('invalid upstream geometry and impossible duration cannot produce a fare', async () => {
  for (const body of [null, {}, { features: [{ ...routeBody.features[0], properties: { distance: 400, time: 0 } }] }, { features: [{ ...routeBody.features[0], geometry: { type: 'LineString', coordinates: [[999, 999], [0, 0]] } }] }]) {
    const provider = createMapsProvider(env, async () => Response.json(body));
    await assert.rejects(provider.route(pickup, destination), (error: MapsError) => error.status === 422);
  }
});
test('provider errors never leak URLs or API keys and distinguish exhausted quotas', async () => {
  const provider = createMapsProvider(env, async () => { throw new Error(`request https://api.geoapify.com?apiKey=${key} failed`); });
  await assert.rejects(provider.route(pickup, destination), (error: MapsError) => !error.message.includes(key) && !error.message.includes('https://'));
  const limited = createMapsProvider(env, async () => Response.json({}, { status: 429 }));
  await assert.rejects(limited.route(pickup, destination), (error: MapsError) => error.status === 429);
});
test('provider adapter refuses demo defaults, private endpoints and embedded credentials', () => {
  for (const url of ['http://maps.example.com', 'https://user:password@maps.example.com', 'https://127.0.0.1', 'https://172.20.1.2', 'https://nominatim.openstreetmap.org', 'https://router.project-osrm.org']) {
    assert.throws(() => createMapsProvider(name => name === 'GEOCODER_BASE_URL' ? url : undefined), MapsError);
  }
});
test('OSRM-compatible providers remain supported without leaking bearer tokens', async () => {
  const provider = createMapsProvider(name => ({ GEOCODER_BASE_URL: 'https://maps.example.test/geocoder', ROUTER_BASE_URL: 'https://maps.example.test/router', MAPS_PROVIDER_TOKEN: key } as Record<string, string>)[name], async (input, init) => {
    assert.match(String(input), /\/router\/route\/v1\/driving\//);
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${key}`);
    return Response.json({ routes: [{ distance: 850, duration: 132, geometry: { type: 'LineString', coordinates: routeBody.features[0].geometry.coordinates[0] } }] });
  });
  assert.equal((await provider.route(pickup, destination)).provider, 'configured-osrm');
});
