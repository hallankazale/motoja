import type { Page } from '@playwright/test';
import { createTestDatabase } from '../../scripts/lib/test-database.mjs';
import { createMapsProvider } from '../../supabase/functions/_shared/maps';

export const points = {
  pickup: { lat: -15.546, lng: -55.165, label: 'Embarque de teste' },
  destination: { lat: -15.55, lng: -55.163, label: 'Destino de teste' },
};
const users = { passenger: '10000000-0000-4000-8000-000000000011', driver: '20000000-0000-4000-8000-000000000011' };

/** UI traffic executes the real SQL migrations in a disposable PostgreSQL database.
 * Only Auth identity, GPS and the external map response are synthetic fixtures.
 */
export async function createRideFixture({ loseFirstRequest = false, mapsUnavailable = false } = {}) {
  const db = await createTestDatabase();
  for (const [role, id] of Object.entries(users)) {
    await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [id]);
    await db.query("insert into motoja_private.profiles(id,full_name,role,is_tester,terms_version) values($1,$2,$3,true,'piloto-2026-09-v1')", [id, `Teste ${role}`, role]);
  }
  await db.query("insert into motoja_private.drivers(user_id,approval_status,is_online,documents_valid_until,model,color,plate) values($1,'approved',false,current_date+30,'Moto de teste','Azul','TST1A23')", [users.driver]);
  await db.exec("update motoja_private.settings set mode='pilot'");
  let dropResponse = loseFirstRequest;
  const provider = createMapsProvider(name => ({ MAPS_PROVIDER: 'geoapify', GEOAPIFY_API_KEY: 'test-only-key' } as Record<string, string>)[name], async () => mapsUnavailable
    ? Response.json({}, { status: 503 })
    : Response.json({ features: [{ properties: { distance: 850, time: 180 }, geometry: { type: 'MultiLineString', coordinates: [[[points.pickup.lng, points.pickup.lat], [points.destination.lng, points.destination.lat]]] } }] }));
  async function sql(userId: string | null, sqlText: string, parameters: unknown[] = [], role = 'authenticated') {
    return db.transaction(async (transaction: any) => {
      await transaction.exec(`set local role ${role}`);
      await transaction.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role, aal: 'aal1' })]);
      return (await transaction.query(sqlText, parameters)).rows[0]?.result;
    });
  }
  return {
    db,
    async install(page: Page, role: keyof typeof users) {
      const user = { id: users[role], email: `${role}@example.invalid`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      await page.addInitScript(({ user, pickup }) => {
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const payload = btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: expires }));
        localStorage.setItem('motoja-v2-auth', JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test-only`, refresh_token: 'test-only', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }));
        // GPS is an explicit fixture. The WebKit 26.6 runner's native emulation
        // supplied a timestamp 1000x too large; use the standard millisecond clock.
        const position = () => ({ timestamp: Date.now(), coords: { latitude: pickup.lat, longitude: pickup.lng, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null } });
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
          getCurrentPosition: (success: (value: ReturnType<typeof position>) => void) => { setTimeout(() => success(position()), 0); },
          watchPosition: (success: (value: ReturnType<typeof position>) => void) => {
            setTimeout(() => success(position()), 0);
            return setInterval(() => success(position()), 1000);
          },
          clearWatch: (id: number) => clearInterval(id),
        } });
      }, { user, pickup: points.pickup });
      // Keep realtime traffic inside the fixture; the app's polling reconciles SQL state.
      await page.routeWebSocket(/^wss:\/\/[^/]+\.supabase\.co\//, () => {});
      await page.route('**/*.supabase.co/**', async route => {
        try {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: user });
          if (pathname.endsWith('/auth/v1/settings')) return route.fulfill({ json: { mailer_autoconfirm: false, external: { email: true } } });
          if (pathname.endsWith('/rpc/mj_public_config')) return route.fulfill({ json: await sql(null, 'select public.mj_public_config() result', [], 'anon') });
          const body = route.request().postDataJSON();
          if (pathname.endsWith('/rpc/mj_command')) {
            const result = await sql(user.id, 'select public.mj_command($1,$2::jsonb) result', [body.action, JSON.stringify(body.payload || {})]);
            if (body.action === 'request_ride' && dropResponse) { dropResponse = false; return route.abort('failed'); }
            return route.fulfill({ json: result });
          }
          if (pathname.endsWith('/functions/v1/motoja-locations')) {
            if (body.action === 'health') return route.fulfill({ json: provider.configured });
            if (body.action === 'search') return route.fulfill({ json: { results: [/embarque/i.test(body.query) ? points.pickup : points.destination], provider: 'geoapify' } });
            const calculated = await provider.route(body.pickup, body.destination);
            const quote = await sql(user.id, 'select public.mj_store_quote($1,$2::jsonb) result', [user.id, JSON.stringify({ ...calculated, pickup: body.pickup, destination: body.destination })], 'service_role');
            return route.fulfill({ json: { ...quote, geometry: calculated.geometry, provider: 'geoapify' } });
          }
          return route.fulfill({ status: 401, json: { message: 'No external traffic in this test.' } });
        } catch (error) { return route.fulfill({ status: 400, json: { message: (error as Error).message, error: (error as Error).message } }); }
      });
      await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf1f2"/></svg>' }));
      await page.goto('/');
    },
    async close() { await db.close(); },
  };
}
