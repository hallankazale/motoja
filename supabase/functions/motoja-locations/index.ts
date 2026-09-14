import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createMapsProvider, MapsError, validPoint } from '../_shared/maps.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
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
    if (!['search', 'quote', 'health'].includes(body?.action)) return json({ error: 'Solicitação inválida.' }, 400);
    const { error: accessError } = await service.rpc('mj_maps_access', { user_id: user.id });
    if (accessError) return accessError.code === '42501'
      ? json({ error: 'Seu acesso aos mapas precisa ser liberado pela administração do piloto.' }, 403)
      : json({ error: 'Acesso indisponível ou limite de consultas atingido. Aguarde e tente novamente.' }, 429);
    const provider = createMapsProvider(name => Deno.env.get(name));
    if (body.action === 'health') return json(provider.configured);
    if (body.action === 'search') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (query.length < 3 || query.length > 120) return json({ error: 'Informe um endereço entre 3 e 120 caracteres.' }, 400);
      return json({ results: await provider.search(query), provider: provider.configured.provider });
    }
    if (!validPoint(body.pickup) || !validPoint(body.destination)) return json({ error: 'Escolha origem e destino dentro da área de atendimento.' }, 400);
    const route = await provider.route(body.pickup, body.destination);
    const { data: quote, error } = await service.rpc('mj_store_quote', { user_id: user.id, route: {
      pickup: body.pickup, destination: body.destination, distance_m: route.distance_m, duration_s: route.duration_s, provider: route.provider,
    } });
    if (error) return json({ error: 'Não foi possível emitir o valor da corrida.' }, 422);
    return json({ ...quote, geometry: route.geometry, provider: provider.configured.provider });
  } catch (error) {
    if (error instanceof MapsError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Dados de solicitação inválidos.' }, 400);
    // Provider tokens, upstream URLs and personal locations are deliberately excluded from logs/errors.
    return json({ error: 'Serviço de mapas indisponível. Tente novamente em instantes.' }, 502);
  }
});
