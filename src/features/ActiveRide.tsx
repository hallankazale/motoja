import { lazy, Suspense, useState } from 'react';
import { Bike, ShieldCheck, Share2, Phone, Navigation, Star, MapPin } from 'lucide-react';
import type { Ride } from '../domain/types';
import { canCancel, distance, isFreshLocation, money, statusLabels } from '../domain/rides';
import { command } from '../lib/api';
import { Button, Modal, Notice } from '../components/ui';
const RideMap = lazy(() => import('../components/RideMap'));

export function ActiveRide({ ride, userId, refresh, onSafety }: { ride: Ride; userId: string; refresh: () => Promise<void>; onSafety: () => void }) {
  const isDriver = ride.driver_id === userId;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [pin, setPin] = useState(''), [helmets, setHelmets] = useState(false), [cancel, setCancel] = useState(false), [reason, setReason] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const fresh = ride.location && isFreshLocation(ride.location.recorded_at);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError('');
    try { await command(action, { ride_id: ride.id, ...extra }); await refresh(); setCancel(false); }
    catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function share() {
    setBusy(true); setError('');
    try {
      const result = await command<{ token: string }>('share', { ride_id: ride.id });
      // The bearer token stays in a fragment, outside HTTP access logs and referrers.
      const url = `${window.location.origin}/#acompanhar=${result.token}`; setShareUrl(url);
      if (navigator.share) await navigator.share({ title: 'Acompanhe minha corrida no MotoJá', text: 'Acompanhe minha viagem. O link expira ao finalizar a corrida.', url });
    } catch (error) { if ((error as Error).name !== 'AbortError') setError((error as Error).message); } finally { setBusy(false); }
  }
  const navigation = isDriver && ['accepted', 'arriving'].includes(ride.status) ? ride.pickup : ride.destination;
  return <div className="trip-grid"><section><div className="page-heading"><p className="eyebrow">SUA CORRIDA</p><h1 className="trip-title">{statusLabels[ride.status]}</h1><p>{ride.status === 'requested' ? 'Vamos avisar assim que alguém aceitar. A busca dura até 5 minutos.' : `${distance(ride.distance_m)} · ${money(ride.price_cents)}`}</p></div>
    <div className="panel ride-panel">{ride.counterparty ? <div className="driver-identity"><span className="avatar">{ride.counterparty.full_name.slice(0, 1)}</span><div><h3>{ride.counterparty.full_name}</h3><p>{isDriver ? 'Seu passageiro' : `${ride.vehicle?.model || 'Moto'} · ${ride.vehicle?.color || ''}`}</p></div>{ride.vehicle?.plate ? <strong className="plate">{ride.vehicle.plate}</strong> : null}</div> : <div className="searching"><Bike size={30} /><span>Procurando um motociclista disponível…</span></div>}
      <div className="trip-route"><div><span className="origin-dot" /><p><small>EMBARQUE</small>{ride.pickup.label}</p></div><div><MapPin size={19} /><p><small>DESTINO</small>{ride.destination.label}</p></div></div>
      {!isDriver && ride.pin ? <div className="pin-card"><span><ShieldCheck size={22} />Seu PIN de embarque</span><strong>{ride.pin}</strong><p>Confira a pessoa e a placa. Só informe este código quando estiver pronto para embarcar.</p></div> : null}
      {isDriver && ride.status === 'accepted' ? <Button busy={busy} onClick={() => act('arriving')}>Estou a caminho<Navigation size={18} /></Button> : null}
      {isDriver && ride.status === 'arriving' ? <Button busy={busy} onClick={() => act('arrived')}>Cheguei ao embarque</Button> : null}
      {isDriver && ride.status === 'arrived' ? <form className="form-stack" onSubmit={event => { event.preventDefault(); void act('start', { pin, helmets_checked: helmets }); }}><label>PIN informado pelo passageiro<input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required placeholder="0000" /></label><label className="checkbox"><input type="checkbox" checked={helmets} onChange={event => setHelmets(event.target.checked)} required />Passageiro e motociclista estão com capacetes afivelados.</label><Button busy={busy}>Iniciar viagem</Button></form> : null}
      {isDriver && ride.status === 'in_progress' ? <Button busy={busy} onClick={() => act('complete')}>Finalizar no destino</Button> : null}
      {isDriver ? <a className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${navigation.lat},${navigation.lng}&travelmode=driving`} target="_blank" rel="noreferrer"><Navigation size={18} />Abrir navegação</a> : null}
      <div className="trip-tools"><button onClick={onSafety}><ShieldCheck size={22} />Segurança</button><button onClick={share} disabled={busy}><Share2 size={22} />Compartilhar</button>{ride.counterparty?.phone ? <a href={`tel:${ride.counterparty.phone.replace(/[^+\d]/g, '')}`}><Phone size={22} />Ligar</a> : null}</div>
      {shareUrl ? <div className="share-box"><label>Link de acompanhamento<input readOnly value={shareUrl} onFocus={event => event.target.select()} /></label><button className="text-button" onClick={async () => { await act('revoke_share'); setShareUrl(''); }}>Encerrar compartilhamento</button></div> : null}
      {canCancel(ride.status) ? <button className="text-button danger-text" onClick={() => setCancel(true)}>Cancelar corrida</button> : null}
      {error ? <Notice error>{error}</Notice> : null}
    </div></section><section><div className="map-frame active-map"><Suspense fallback={<p>Abrindo mapa…</p>}><RideMap pickup={ride.pickup} destination={ride.destination} driver={fresh ? ride.location : null} /></Suspense></div>{ride.driver_id ? <Notice>{fresh ? 'Posição mais recente recebida do motociclista.' : 'Localização indisponível ou desatualizada. O ponto do motociclista ficará oculto até o GPS atualizar.'}</Notice> : null}</section>
    {cancel ? <Modal title="Cancelar esta corrida?" onClose={() => setCancel(false)}><p>O motociclista será avisado. Não há taxa de cancelamento nesta versão piloto.</p><form className="form-stack" onSubmit={event => { event.preventDefault(); void act('cancel', { reason }); }}><label>Motivo<select value={reason} onChange={event => setReason(event.target.value)} required><option value="">Escolha um motivo</option><option>Mudei meus planos</option><option>O embarque está incorreto</option><option>Não me sinto seguro</option><option>Demora na chegada</option><option>Problema com o veículo</option></select></label><Button variant="danger" busy={busy}>Confirmar cancelamento</Button><Button variant="secondary" type="button" onClick={() => setCancel(false)}>Continuar com a corrida</Button></form>{error ? <Notice error>{error}</Notice> : null}</Modal> : null}
  </div>;
}

export function RideReceipt({ ride, userId, refresh }: { ride: Ride; userId: string; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [stars, setStars] = useState(0), [comment, setComment] = useState('');
  async function act(action: string, extra = {}) { setBusy(true); setError(''); try { await command(action, { ride_id: ride.id, ...extra }); await refresh(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  return <div className="receipt"><div className="receipt-header"><Bike size={34} /><h3>{statusLabels[ride.status]}</h3><strong>{money(ride.price_cents)}</strong><p>{distance(ride.distance_m)} · {new Date(ride.requested_at).toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })}</p></div><div className="trip-route"><p><small>EMBARQUE</small>{ride.pickup.label}</p><p><small>DESTINO</small>{ride.destination.label}</p></div><p className="helper">Corrida {ride.id}</p><p>Pagamento em {ride.payment_method === 'pix' ? 'Pix' : 'dinheiro'} · {ride.payment_status === 'confirmed' ? 'recebimento registrado pelo motociclista' : ride.payment_status === 'disputed' ? 'em contestação' : 'recebimento ainda não confirmado'}</p>
    {ride.status === 'completed' && ride.payment_status === 'pending' && ride.driver_id === userId ? <Button busy={busy} onClick={() => act('confirm_payment')}>Já recebi o pagamento</Button> : null}
    {ride.status === 'completed' && ride.driver_id !== userId && ride.payment_method === 'pix' && ride.vehicle?.pix_key ? <label>Chave Pix do motociclista<input readOnly value={ride.vehicle.pix_key} onFocus={event => event.target.select()} /><small>Confira o destinatário no seu banco antes de pagar. O app não verifica a transferência.</small></label> : null}
    {ride.status === 'completed' && !ride.my_rating ? <form className="rating" onSubmit={event => { event.preventDefault(); void act('rate', { stars, comment }); }}><h3>Como foi sua viagem?</h3><div className="stars">{[1, 2, 3, 4, 5].map(star => <button key={star} type="button" aria-label={`${star} ${star === 1 ? 'estrela' : 'estrelas'}`} aria-pressed={star === stars} onClick={() => setStars(star)}><Star size={29} fill={star <= stars ? '#f5b544' : 'none'} color={star <= stars ? '#bd7800' : '#748098'} /></button>)}</div><label>Comentário (opcional)<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={500} /></label><Button busy={busy} disabled={!stars}>Enviar avaliação</Button></form> : null}
    {ride.my_rating ? <Notice>Avaliação registrada: {ride.my_rating} estrelas.</Notice> : null}
    {ride.status === 'completed' && ride.payment_status !== 'disputed' ? <button className="text-button" onClick={() => act('dispute_payment')}>Contestar pagamento</button> : null}{error ? <Notice error>{error}</Notice> : null}
  </div>;
}
