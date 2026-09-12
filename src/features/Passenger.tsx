import { lazy, Suspense, useRef, useState } from 'react';
import { ArrowRight, LocateFixed, MapPin, Search, Banknote, QrCode, ShieldCheck, Bike, ArrowUpRight, Compass } from 'lucide-react';
import type { Point, Quote, Settings } from '../domain/types';
import { money, distance, minutes, inServiceArea } from '../domain/rides';
import { createQuote, searchPlaces, command } from '../lib/api';
import { currentLocation } from '../lib/location';
import { Button, Modal, Notice } from '../components/ui';
const RideMap = lazy(() => import('../components/RideMap'));

export function Passenger({ signedIn, firstName, settings, onLogin, onRefresh }: { signedIn: boolean; firstName?: string; settings: Settings | null; onLogin: () => void; onRefresh: () => Promise<void> }) {
  const [pickup, setPickup] = useState<Point | null>(null), [destination, setDestination] = useState<Point | null>(null);
  const [editing, setEditing] = useState<'pickup' | 'destination' | null>(null), [query, setQuery] = useState('');
  const [results, setResults] = useState<Point[]>([]), [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [searched, setSearched] = useState(false);
  const [payment, setPayment] = useState<'pix' | 'cash'>('pix');
  const requestKey = useRef(crypto.randomUUID());
  const setPoint = (point: Point) => {
    if (!inServiceArea(point)) { setMessage('Este ponto está fora da área inicial de atendimento.'); return; }
    if (editing === 'pickup') setPickup(point); else setDestination(point);
    setQuote(null); setEditing(null); setResults([]); setQuery(''); setMessage('');
    requestKey.current = crypto.randomUUID();
  };
  async function locate() {
    setBusy(true); setMessage('');
    try { const point = await currentLocation(); if (!inServiceArea(point)) throw new Error('Você está fora da área inicial de Campo Verde. Escolha o embarque pelo endereço.'); setPickup(point); setQuote(null); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function calculate() {
    if (!signedIn) return onLogin();
    if (!pickup || !destination) return;
    setBusy(true); setMessage('');
    try { setQuote(await createQuote(pickup, destination)); requestKey.current = crypto.randomUUID(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function requestRide() {
    if (!quote) return;
    setBusy(true); setMessage('');
    try {
      // Reuse this key after a lost response. A double tap or retry cannot create another trip.
      await command('request_ride', { quote_id: quote.id, payment_method: payment, idempotency_key: requestKey.current });
      await onRefresh();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <div className="passenger-grid"><section className="booking-column"><div className="page-heading"><p className="eyebrow">{firstName ? `OLÁ, ${firstName.toLocaleUpperCase('pt-BR')}` : 'SEU CAMINHO, MAIS SIMPLES'}</p><h1>Bora de moto<span>?</span></h1><p>Para onde vamos hoje?</p></div>
    <div className="booking-card"><div className="route-fields"><span className="route-line" aria-hidden="true" /><button className="place-field" onClick={() => { setEditing('pickup'); setQuery(''); setMessage(''); }}><span className="origin-dot" /><span><small>EMBARQUE</small><strong>{pickup?.label || 'Onde você está?'}</strong></span></button><button className="place-field destination" onClick={() => { setEditing('destination'); setQuery(''); setMessage(''); }}><MapPin size={20} /><span><small>DESTINO</small><strong>{destination?.label || 'Para onde você vai?'}</strong></span><Search size={20} /></button></div>
      <button className="locate-link" onClick={locate} disabled={busy}><LocateFixed size={17} />Usar minha localização</button>
      <div className="payment-options"><button className={payment === 'pix' ? 'selected' : ''} onClick={() => setPayment('pix')} aria-pressed={payment === 'pix'}><QrCode size={18} />Pix</button><button className={payment === 'cash' ? 'selected' : ''} onClick={() => setPayment('cash')} aria-pressed={payment === 'cash'}><Banknote size={18} />Dinheiro</button><span>Direto ao motociclista</span></div>
      {quote ? <div className="quote"><span className="bike-box"><Bike size={29} /></span><div><strong>MotoJá</strong><small>{distance(quote.distance_m)} · trajeto estimado em {minutes(quote.duration_s)}</small></div><strong className="fare">{money(quote.price_cents)}</strong></div> : null}
      <Button busy={busy} onClick={quote ? requestRide : calculate} disabled={!pickup || !destination || (quote !== null && settings?.mode === 'closed')}>{quote ? 'Confirmar corrida' : 'Ver valor da corrida'}<ArrowRight size={19} /></Button>
      {quote ? <p className="helper">Valor válido por 3 minutos. Revise embarque, destino e forma de pagamento.</p> : null}
      {message ? <Notice error>{message}</Notice> : null}
    </div>
    <div className="safety-note"><span><ShieldCheck size={23} /></span><div><strong>O cuidado vai com você</strong><p>Confira moto e placa. Informe o PIN somente na hora de embarcar.</p></div></div>
    <div className="city-card"><div><span className="eyebrow">FEITO PARA A NOSSA CIDADE</span><h3>Campo Verde,<br />um caminho de cada vez.</h3><p>Uma pessoa por corrida. Capacete sempre.</p></div><span className="city-symbol"><Compass size={47} strokeWidth={1.2} /></span></div>
  </section><section className="map-column"><div className="map-frame"><Suspense fallback={<div className="map-loading">Abrindo mapa…</div>}><RideMap pickup={pickup} destination={destination} geometry={quote?.geometry?.coordinates} /></Suspense><div className="map-caption"><span><MapPin size={17} />Campo Verde · MT</span><a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Corrigir mapa<ArrowUpRight size={15} /></a></div></div><div className="map-footnote"><span className="small-tag">MOBILIDADE LOCAL</span><p>O mapa ajuda você a conferir os pontos antes de pedir.</p></div></section>
    {editing ? <Modal title={editing === 'pickup' ? 'Seu ponto de embarque' : 'Para onde vamos?'} onClose={() => { setEditing(null); setMessage(''); }}><form className="search-form" onSubmit={async event => {
      event.preventDefault(); if (!signedIn) { setEditing(null); onLogin(); return; }
      setBusy(true); setMessage(''); setResults([]);
      try { setResults((await searchPlaces(query)).results); setSearched(true); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }}><label>Endereço em Campo Verde<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rua, número ou nome do lugar" minLength={3} maxLength={120} required autoFocus /></label><Button busy={busy}><Search size={18} />Buscar endereço</Button></form>
      <div className="search-results">{results.map((result, index) => <button onClick={() => setPoint(result)} key={`${result.lat}-${result.lng}-${index}`}><MapPin size={20} /><span>{result.label}</span><ArrowRight size={17} /></button>)}</div>{searched && !results.length && !busy && !message ? <p className="helper">Nenhum resultado. Tente o nome da rua ou marque no mapa.</p> : null}
      <p className="helper">Você também pode tocar no ponto exato no mapa abaixo.</p><div className="picker-map"><Suspense fallback={<p>Abrindo mapa…</p>}><RideMap pickup={pickup} destination={destination} onPick={setPoint} /></Suspense></div>{message ? <Notice error>{message}</Notice> : null}
    </Modal> : null}
  </div>;
}
