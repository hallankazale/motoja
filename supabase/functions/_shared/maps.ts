/** Provider adapters keep API credentials and upstream response formats out of the app. */
export type Point = { lat: number; lng: number; label: string };
export type RouteGeometry = { type: 'LineString'; coordinates: number[][] };
export type RouteResult = { distance_m: number; duration_s: number; geometry: RouteGeometry; provider: string };
export type Environment = (name: string) => string | undefined;
type Fetcher = typeof fetch;

export class MapsError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.name = 'MapsError'; this.status = status; }
}
export function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const { lat, lng, label } = value as Point;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -15.68 && lat <= -15.43
    && lng >= -55.32 && lng <= -55.04 && typeof label === 'string' && label.trim().length >= 3 && label.length <= 250;
}
function providerUrl(value: string | undefined): URL | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { throw new MapsError('Confira a configuração do serviço de mapas.', 503); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|.*\.local$)/i.test(url.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(url.hostname)
    || ['nominatim.openstreetmap.org', 'router.project-osrm.org', 'routing.openstreetmap.de'].includes(url.hostname)) {
    throw new MapsError('Configure um provedor de mapas próprio ou contratado.', 503);
  }
  return new URL(url.href.endsWith('/') ? url.href : `${url.href}/`);
}
async function readJson(url: URL, headers: Record<string, string>, fetcher: Fetcher): Promise<any> {
  try {
    const response = await fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (response.status === 401 || response.status === 403) throw new MapsError('A credencial do serviço de mapas precisa ser revisada.', 503);
    if (response.status === 429) throw new MapsError('Limite do serviço de mapas atingido. Aguarde e tente novamente.', 429);
    if (!response.ok || !response.body) throw new MapsError('O serviço de mapas não respondeu. Tente novamente.');
    // Bound the entire body, including chunked responses, before parsing untrusted provider data.
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_500_000) { await reader.cancel(); throw new MapsError('O serviço retornou uma rota muito grande.'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof MapsError) throw error;
    // Fetch exceptions may include the API key or personal coordinates in their URL.
    throw new MapsError('Serviço de mapas indisponível. Tente novamente em instantes.');
  }
}
function normalizedRoute(distance: unknown, duration: unknown, geometry: any, provider: string): RouteResult {
  const coordinates = geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)
    ? geometry.coordinates.flat() : geometry?.type === 'LineString' ? geometry.coordinates : null;
  if (typeof distance !== 'number' || typeof duration !== 'number' || !Number.isFinite(distance) || !Number.isFinite(duration)
    || distance < 100 || distance > 80000 || duration < 10 || duration > 14400
    || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 20000
    || !coordinates.every((point: unknown) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
      && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)) {
    throw new MapsError('Nenhuma rota válida para esta corrida.', 422);
  }
  return { distance_m: Math.round(distance), duration_s: Math.round(duration), provider,
    geometry: { type: 'LineString', coordinates: coordinates.map((point: number[]) => [point[0], point[1]]) } };
}
export function createMapsProvider(env: Environment, fetcher: Fetcher = fetch) {
  const name = env('MAPS_PROVIDER') || 'compatible';
  if (!['geoapify', 'compatible'].includes(name)) throw new MapsError('Provedor de mapas não reconhecido na configuração.', 503);
  const apiKey = env('GEOAPIFY_API_KEY')?.trim();
  const geocoder = name === 'compatible' ? providerUrl(env('GEOCODER_BASE_URL')) : null;
  const router = name === 'compatible' ? providerUrl(env('ROUTER_BASE_URL')) : null;
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'pt-BR', 'User-Agent': 'MotoJa/0.3 (https://motoja-gilt.vercel.app)' };
  if (name === 'compatible' && env('MAPS_PROVIDER_TOKEN')) headers.Authorization = `Bearer ${env('MAPS_PROVIDER_TOKEN')}`;
  const configured = { provider: name, search_configured: name === 'geoapify' ? Boolean(apiKey) : Boolean(geocoder), routing_configured: name === 'geoapify' ? Boolean(apiKey) : Boolean(router) };
  return {
    configured,
    async search(query: string): Promise<Point[]> {
      if (!configured.search_configured) throw new MapsError('A busca de endereços ainda está sendo configurada. Você pode marcar o ponto no mapa.', 503);
      let target: URL;
      if (name === 'geoapify') {
        target = new URL('https://api.geoapify.com/v1/geocode/search');
        target.search = new URLSearchParams({ text: `${query}, Campo Verde, Mato Grosso, Brasil`, filter: 'rect:-55.32,-15.68,-55.04,-15.43|countrycode:br', lang: 'pt', limit: '5', format: 'json', apiKey: apiKey! }).toString();
      } else {
        target = new URL('search', geocoder!);
        target.search = new URLSearchParams({ q: `${query}, Campo Verde, Mato Grosso, Brasil`, format: 'jsonv2', countrycodes: 'br', bounded: '1', viewbox: '-55.32,-15.43,-55.04,-15.68', limit: '5' }).toString();
      }
      const data = await readJson(target, headers, fetcher);
      const items = name === 'geoapify' ? data?.results : data;
      if (!Array.isArray(items)) throw new MapsError('O provedor não retornou endereços válidos.');
      return items.map(item => ({ lat: Number(item?.lat), lng: Number(item?.lon), label: String((name === 'geoapify' ? item?.formatted : item?.display_name) || '').slice(0, 250) })).filter(validPoint).slice(0, 5);
    },
    async route(pickup: Point, destination: Point): Promise<RouteResult> {
      if (!validPoint(pickup) || !validPoint(destination)) throw new MapsError('Escolha origem e destino dentro da área de atendimento.', 400);
      if (!configured.routing_configured) throw new MapsError('O cálculo de rotas ainda está sendo configurado. Corridas reais não estão disponíveis.', 503);
      let target: URL;
      if (name === 'geoapify') {
        target = new URL('https://api.geoapify.com/v1/routing');
        target.search = new URLSearchParams({ waypoints: `${pickup.lat},${pickup.lng}|${destination.lat},${destination.lng}`, mode: 'motorcycle', units: 'metric', lang: 'pt-BR', format: 'geojson', apiKey: apiKey! }).toString();
      } else {
        target = new URL(`route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}`, router!);
        target.search = 'overview=full&geometries=geojson&steps=false';
      }
      const data = await readJson(target, headers, fetcher);
      if (name === 'geoapify') {
        const route = data?.features?.[0];
        return normalizedRoute(route?.properties?.distance, route?.properties?.time, route?.geometry, 'geoapify-motorcycle');
      }
      const route = data?.routes?.[0];
      return normalizedRoute(route?.distance, route?.duration, route?.geometry, 'configured-osrm');
    },
  };
}
