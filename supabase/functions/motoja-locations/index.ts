import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
type Point = { lat: number; lng: number; label: string };
function validPoint(point: unknown): point is Point {
  if (!point || typeof point !== 'object') return false;
  const { lat, lng, label } = point as Point;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -15.68 && lat <= -15.43 && lng >= -55.32 && lng <= -55.04 && typeof label === 'string' && label.length >= 3 && label.length <= 250;
}
function configuredUrl(key: string): URL | null {
  const value = Deno.env.get(key); if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Provider URL must use HTTPS.');
  // The free public Nominatim service is not bundled as a commercial geocoding backend.
  if (url.hostname === 'nominatim.openstreetmap.org' || url.hostname === 'router.project-osrm.org') return null;
  return url;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Entre na sua conta para usar os mapas.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  // verify_jwt=false at the gateway supports current signing keys; identity is verified HERE for every request.
  const { data: { user }, error: authError } = await auth.auth.getUser(authorization.slice(7));
  if (authError || !user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 5000) return json({ error: 'Solicitação muito grande.' }, 413);
    const text = await request.text(); if (text.length > 5000) return json({ error: 'Solicitação muito grande.' }, 413);
    const body = JSON.parse(text);
    if (!['search', 'quote'].includes(body?.action)) return json({ error: 'Solicitação inválida.' }, 400);
    const { error: accessError } = await service.rpc('mj_maps_access', { user_id: user.id });
    if (accessError) return json({ error: 'Acesso indisponível ou limite de consultas atingido. Aguarde e tente novamente.' }, 429);
    const providerHeaders: Record<string, string> = { 'User-Agent': 'MotoJa/0.2 (Campo Verde pilot)', 'Accept': 'application/json', 'Accept-Language': 'pt-BR' };
    const providerToken = Deno.env.get('MAPS_PROVIDER_TOKEN');
    if (providerToken) providerHeaders.Authorization = `Bearer ${providerToken}`;
    if (body.action === 'search') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (query.length < 3 || query.length > 120) return json({ error: 'Informe um endereço entre 3 e 120 caracteres.' }, 400);
      const base = configuredUrl('GEOCODER_BASE_URL');
      if (!base) return json({ error: 'A busca de endereços ainda está sendo configurada. Você pode marcar o ponto no mapa.' }, 503);
      const target = new URL('search', base.href.endsWith('/') ? base : `${base}/`);
      target.search = new URLSearchParams({ q: `${query}, Campo Verde, Mato Grosso, Brasil`, format: 'jsonv2', countrycodes: 'br', bounded: '1', viewbox: '-55.32,-15.43,-55.04,-15.68', limit: '5' }).toString();
      const response = await fetch(target, { headers: providerHeaders, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) return json({ error: 'Busca de endereço indisponível. Tente novamente.' }, 502);
      const items = await response.json();
      if (!Array.isArray(items)) return json({ error: 'O provedor não retornou endereços válidos.' }, 502);
      return json({ results: items.map(item => ({ lat: Number(item.lat), lng: Number(item.lon), label: String(item.display_name || '').slice(0, 250) })).filter(validPoint).slice(0, 5) });
    }
    if (!validPoint(body.pickup) || !validPoint(body.destination)) return json({ error: 'Escolha origem e destino dentro da área de atendimento.' }, 400);
    const base = configuredUrl('ROUTER_BASE_URL');
    if (!base) return json({ error: 'O cálculo de rotas ainda está sendo configurado. Corridas reais não estão disponíveis.' }, 503);
    const coords = `${body.pickup.lng},${body.pickup.lat};${body.destination.lng},${body.destination.lat}`;
    const target = new URL(`route/v1/driving/${coords}`, base.href.endsWith('/') ? base : `${base}/`);
    target.search = 'overview=full&geometries=geojson&steps=false';
    const response = await fetch(target, { headers: providerHeaders, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) return json({ error: 'Não foi possível calcular a rota. Tente novamente.' }, 502);
    const data = await response.json(), route = data?.routes?.[0];
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance < 100 || route.distance > 80000 || route.duration < 10 || route.duration > 14400) return json({ error: 'Nenhuma rota válida para esta corrida.' }, 422);
    const { data: quote, error } = await service.rpc('mj_store_quote', { user_id: user.id, route: {
      pickup: body.pickup, destination: body.destination, distance_m: Math.round(route.distance), duration_s: Math.round(route.duration), provider: 'configured-osrm',
    } });
    if (error) return json({ error: 'Não foi possível emitir o valor da corrida.' }, 422);
    return json({ ...quote, geometry: route.geometry });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Dados de solicitação inválidos.' }, 400);
    // Provider tokens, upstream URLs and personal locations are deliberately excluded from logs/errors.
    return json({ error: 'Serviço de mapas indisponível. Tente novamente em instantes.' }, 502);
  }
});
