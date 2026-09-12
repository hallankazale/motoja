import { useEffect, useRef, useState } from 'react';
import { Bike, Power, Clock3, MapPin, ArrowRight, FileCheck2, Wallet } from 'lucide-react';
import type { Snapshot } from '../domain/types';
import { distance, money, minutes, validateDriver } from '../domain/rides';
import { command, uploadDocument } from '../lib/api';
import { Button, Empty, Notice } from '../components/ui';

const documentLabels: Record<string, string> = { identity: 'Documento de identidade', license: 'CNH e atividade remunerada', vehicle: 'Documento da moto', permit: 'Autorização para operar', insurance: 'Seguro para a atividade' };

export function Driver({ snapshot, refresh }: { snapshot: Snapshot; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [edit, setEdit] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const lastSent = useRef(0);
  const driver = snapshot.driver;
  const online = driver?.is_online || false;
  async function publish(position: GeolocationPosition) {
    if (Date.now() - lastSent.current < 5_000) return;
    lastSent.current = Date.now();
    await command('location', { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, recorded_at: new Date(position.timestamp).toISOString() });
  }
  useEffect(() => { if (!snapshot.offer) return; const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, [snapshot.offer?.id]);
  async function toggle() {
    setBusy(true); setMessage('');
    try {
      if (!online) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Permita o GPS para receber corridas.')), { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }));
        lastSent.current = 0; await publish(position);
      }
      await command('set_online', { online: !online }); await refresh();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  const completed = snapshot.rides.filter(ride => ride.driver_id === snapshot.profile.id && ride.status === 'completed');
  const received = completed.filter(ride => ride.payment_status === 'confirmed').reduce((sum, ride) => sum + ride.price_cents, 0);
  const left = snapshot.offer ? Math.max(0, Math.ceil((Date.parse(snapshot.offer.expires_at) - tick) / 1000)) : 0;
  return <div className="driver-layout"><section><div className="page-heading"><p className="eyebrow">ÁREA DO MOTOCICLISTA</p><h1>Seu próximo<br />caminho começa aqui.</h1><p>Olá, {snapshot.profile.full_name.split(' ')[0]}. Tudo pronto para sair?</p></div>
    <div className={`online-card ${online ? 'online' : ''}`}><span className="power-icon"><Power size={28} /></span><div><h3>{online ? 'Você está disponível' : 'Você está indisponível'}</h3><p>{online ? 'Aguardando chamadas perto de você.' : 'Fique disponível quando estiver pronto.'}</p></div><Button busy={busy} variant={online ? 'secondary' : 'primary'} disabled={driver?.approval_status !== 'approved'} onClick={toggle}>{online ? 'Pausar' : 'Ficar disponível'}</Button></div>
    <div className="metrics"><article><Wallet size={22} /><small>Recebimento registrado</small><strong>{money(received)}</strong></article><article><Bike size={22} /><small>Corridas concluídas</small><strong>{completed.length}</strong></article></div><p className="helper">Resumo das últimas 30 corridas carregadas. Confira os recebimentos no banco ou em dinheiro.</p>
    {snapshot.offer ? <div className="offer-card"><div className="section-title"><span className="small-tag">NOVA CHAMADA</span><span><Clock3 size={16} />{left}s</span></div><strong className="offer-fare">{money(snapshot.offer.price_cents)}</strong><p>{distance(snapshot.offer.distance_m)} · trajeto estimado em {minutes(snapshot.offer.duration_s)}</p><p><MapPin size={17} />Embarque em Campo Verde</p><p className="helper">O endereço completo aparece depois do aceite.</p><div className="button-row"><Button variant="secondary" busy={busy} disabled={left === 0} onClick={async () => { setBusy(true); try { await command('respond_offer', { offer_id: snapshot.offer?.id, accept: false }); await refresh(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>Recusar</Button><Button busy={busy} disabled={left === 0} onClick={async () => { setBusy(true); try { await command('respond_offer', { offer_id: snapshot.offer?.id, accept: true }); await refresh(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>Aceitar corrida<ArrowRight size={18} /></Button></div></div> : driver?.approval_status === 'approved' ? <Empty title={online ? 'Aguardando a próxima chamada' : 'Seu tempo, sua escolha'}>As chamadas aparecem conforme sua localização e disponibilidade.</Empty> : <div className="review-card"><FileCheck2 size={29} /><h3>{driver?.approval_status === 'suspended' ? 'Cadastro suspenso' : 'Vamos preparar seu cadastro'}</h3><p>{driver?.review_note || 'Preencha os dados da moto e envie seus documentos para análise. A aprovação será feita pela administração.'}</p><Button variant="secondary" onClick={() => setEdit(true)}>Revisar meu cadastro</Button></div>}
    <Notice>Mantenha o app aberto e o GPS ativo durante o piloto. Use os controles somente com a moto parada.</Notice>{message ? <Notice error>{message}</Notice> : null}
  </section><section className="panel"><div className="section-title"><h2>Minha moto</h2><Bike size={24} /></div><p className="helper">{driver?.approval_status === 'approved' ? 'Cadastro aprovado pela administração' : 'Cadastro em análise'}</p>
    {driver?.model && !edit ? <><div className="vehicle-info"><strong>{driver.model}</strong><span>{driver.color}</span><span className="plate">{driver.plate}</span></div><Button variant="secondary" onClick={() => setEdit(true)}>Editar dados</Button></> : <form className="form-stack" onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const model = String(form.get('model')), color = String(form.get('color')), plate = String(form.get('plate')).replace(/[-\s]/g, '').toUpperCase(), pix_key = String(form.get('pix_key'));
      const invalid = validateDriver(model, color, plate, pix_key); if (invalid) { setMessage(invalid); return; }
      setBusy(true); try { await command('save_driver', { model, color, plate, pix_key }); await refresh(); setEdit(false); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }}><label>Modelo<input name="model" defaultValue={driver?.model} placeholder="Ex.: Honda CG 160" required minLength={3} maxLength={100} /></label><div className="form-columns"><label>Cor<input name="color" defaultValue={driver?.color} required minLength={3} maxLength={40} /></label><label>Placa<input name="plate" defaultValue={driver?.plate} autoCapitalize="characters" required maxLength={8} placeholder="ABC1D23" /></label></div><label>Chave Pix (opcional)<input name="pix_key" defaultValue={driver?.pix_key} maxLength={140} /></label><p className="helper">Alterações no veículo exigem nova análise.</p><Button busy={busy}>Salvar para análise</Button></form>}
    <h3 className="subsection">Seus documentos</h3><div className="document-list">{Object.entries(documentLabels).map(([kind, label]) => { const entries = snapshot.documents.filter(document => document.kind === kind); const approved = entries.some(document => document.status === 'approved'); return <div key={kind}><FileCheck2 size={18} /><span>{label}</span><small className={approved ? 'success-text' : ''}>{approved ? 'Analisado' : entries.length ? 'Em análise' : 'Pendente'}</small></div>; })}</div>
    <form className="form-stack document-upload" onSubmit={async event => {
      event.preventDefault(); const formElement = event.currentTarget, form = new FormData(formElement), file = form.get('file'); if (!(file instanceof File)) return;
      setBusy(true); setMessage(''); try { await uploadDocument(file, String(form.get('kind')), String(form.get('expires_on'))); await refresh(); formElement.reset(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }}><label>Documento<select name="kind">{Object.entries(documentLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><label>Válido até<input type="date" name="expires_on" required min={new Date().toISOString().slice(0, 10)} /></label><label>Arquivo (PDF, JPG ou PNG; até 5 MB)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /></label><Button variant="secondary" busy={busy}>Enviar documento</Button></form>
  </section></div>;
}
