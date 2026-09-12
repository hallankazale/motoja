import { useEffect, useState, lazy, Suspense } from 'react';
import { ShieldCheck, Bike } from 'lucide-react';
import { supabase } from '../lib/api';
import { isFreshLocation, statusLabels } from '../domain/rides';
import type { RideStatus, Point } from '../domain/types';
import { Notice } from '../components/ui';
const RideMap = lazy(() => import('../components/RideMap'));
type Shared = { status: RideStatus; destination: Point; driver_name: string; vehicle: { model: string; color: string; plate: string } | null; location: { lat: number; lng: number; recorded_at: string } | null };
export function SharedRide({ token }: { token: string }) {
  const [trip, setTrip] = useState<Shared | null>(null), [message, setMessage] = useState('Buscando a corrida compartilhada…');
  useEffect(() => {
    let cancelled = false, running = false;
    async function read() {
      if (running) return; running = true;
      try { const { data, error } = await supabase.rpc('mj_shared_ride', { token }).abortSignal(AbortSignal.timeout(10000)); if (cancelled) return; if (error) { setMessage('Não foi possível atualizar a viagem. Confira sua conexão.'); return; } setTrip(data); setMessage(data ? '' : 'Este link expirou, foi revogado ou a viagem já terminou.'); }
      finally { running = false; }
    }
    void read(); const timer = setInterval(() => { if (!document.hidden) void read(); }, 7000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token]);
  return <main className="shared-page"><div className="brand"><span className="brand-emblem"><Bike size={23} /></span>Moto<span>Já</span></div><div className="page-heading"><p className="eyebrow">ACOMPANHAMENTO COMPARTILHADO</p><h1>{trip ? statusLabels[trip.status] : 'Acompanhe o caminho.'}</h1></div>{message ? <Notice>{message}</Notice> : null}{trip ? <><div className="panel"><h3>{trip.driver_name || 'Aguardando motociclista'}</h3>{trip.vehicle ? <p>{trip.vehicle.model} · {trip.vehicle.color} · <strong>{trip.vehicle.plate}</strong></p> : null}<p>Destino: {trip.destination.label}</p></div><div className="map-frame active-map"><Suspense fallback={<p>Abrindo mapa…</p>}><RideMap destination={trip.destination} driver={trip.location && isFreshLocation(trip.location.recorded_at) ? trip.location : null} /></Suspense></div>{trip.location && !isFreshLocation(trip.location.recorded_at) ? <Notice>O GPS está desatualizado. A posição será exibida quando houver atualização.</Notice> : null}</> : null}<p className="helper"><ShieldCheck size={17} />O acesso termina junto com a viagem e pode ser revogado por quem compartilhou.</p><a href="/">Abrir MotoJá</a></main>;
}
