import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "search") {
      const query = String(body?.query || "").trim();
      if (query.length < 3 || query.length > 120) return json({ results: [] });
      const params = new URLSearchParams({ q: `${query}, Campo Verde, Mato Grosso, Brasil`, format: "jsonv2", addressdetails: "1", countrycodes: "br", limit: "5", dedupe: "1" });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": "MotoJa-CampoVerde/1.0 (contato: hallanlehrbach@gmail.com)", "Accept-Language": "pt-BR,pt;q=0.9" } });
      if (!response.ok) return json({ error: "Busca de endereço indisponível" }, 502);
      const items = await response.json();
      return json({ results: items.map((item: Record<string, unknown>) => ({ label: item.display_name, lat: Number(item.lat), lng: Number(item.lon) })) });
    }

    if (action === "reverse") {
      const lat = Number(body?.lat), lng = Number(body?.lng);
      if (!isCoordinate(lat) || !isCoordinate(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "Coordenadas inválidas" }, 400);
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", addressdetails: "1", zoom: "18" });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { headers: { "User-Agent": "MotoJa-CampoVerde/1.0 (contato: hallanlehrbach@gmail.com)", "Accept-Language": "pt-BR,pt;q=0.9" } });
      if (!response.ok) return json({ error: "Endereço da localização indisponível" }, 502);
      const item = await response.json();
      return json({ label: item.display_name || "Localização atual", lat, lng });
    }

    if (action === "route") {
      const originLat = Number(body?.originLat), originLng = Number(body?.originLng), destinationLat = Number(body?.destinationLat), destinationLng = Number(body?.destinationLng);
      if (![originLat, originLng, destinationLat, destinationLng].every(isCoordinate)) return json({ error: "Coordenadas da rota inválidas" }, 400);
      const coordinates = `${originLng},${originLat};${destinationLng},${destinationLat}`;
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`);
      if (!response.ok) return json({ error: "Rota indisponível" }, 502);
      const data = await response.json();
      const route = data?.routes?.[0];
      if (!route) return json({ error: "Nenhuma rota encontrada" }, 404);
      return json({ distanceKm: Math.round((route.distance / 1000) * 100) / 100, durationMinutes: Math.max(1, Math.round(route.duration / 60)), geometry: route.geometry });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch {
    return json({ error: "Falha ao processar localização" }, 500);
  }
});