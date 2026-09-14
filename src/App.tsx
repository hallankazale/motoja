import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Bike, House, Clock3, ShieldCheck, UserRound, MapPin, Bell, ArrowRight, LayoutDashboard, WifiOff, Download, Headphones } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Settings, Snapshot, Ride } from './domain/types';
import { money, statusLabels } from './domain/rides';
import { getSettings, getSnapshot, supabase } from './lib/api';
import { useDriverLocation } from './lib/useDriverLocation';
import { Passenger } from './features/Passenger';
import { Auth, RecoverPassword } from './features/Auth';
import { Button, Empty, Modal, Notice } from './components/ui';
import { Brand } from './components/Brand';
import { ThemeToggle } from './components/ThemeToggle';
const Driver = lazy(() => import('./features/Driver').then(module => ({ default: module.Driver })));
const ActiveRide = lazy(() => import('./features/ActiveRide').then(module => ({ default: module.ActiveRide })));
const RideReceipt = lazy(() => import('./features/ActiveRide').then(module => ({ default: module.RideReceipt })));
const Safety = lazy(() => import('./features/Safety').then(module => ({ default: module.Safety })));
const Terms = lazy(() => import('./features/Safety').then(module => ({ default: module.Terms })));
const Account = lazy(() => import('./features/Account').then(module => ({ default: module.Account })));
const Mfa = lazy(() => import('./features/Mfa').then(module => ({ default: module.Mfa })));
const Admin = lazy(() => import('./features/Admin').then(module => ({ default: module.Admin })));

type View = 'home' | 'history' | 'safety' | 'account' | 'admin';
type Dialog = 'auth' | 'safety' | 'terms' | 'mfa' | 'recovery' | 'install' | 'notifications' | null;
export default function App() {
  const [user, setUser] = useState<User | null>(null), [snapshot, setSnapshot] = useState<Snapshot | null>(null), [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>('home'), [dialog, setDialog] = useState<Dialog>(() => new URLSearchParams(window.location.search).get('entrada') === '1' ? 'auth' : null), [receipt, setReceipt] = useState<Ride | null>(null);
  const [error, setError] = useState(''), [online, setOnline] = useState(navigator.onLine), [loading, setLoading] = useState(false);
  const currentUserId = useRef(user?.id); currentUserId.current = user?.id;
  const inFlight = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const refresh = useCallback(async () => {
    const userId = user?.id; if (!userId) return;
    if (inFlight.current?.userId === userId) return inFlight.current.promise;
    const promise = (async () => { try { const result = await getSnapshot(); if (currentUserId.current !== userId) return; setSnapshot(result); setSettings(result.settings); setError(''); }
      catch (error) { if (currentUserId.current !== userId) return; const message = (error as Error).message; setError(message); if (message.includes('duas etapas')) setDialog('mfa'); }
      finally { if (inFlight.current?.userId === userId) inFlight.current = null; setLoading(false); }
    })(); inFlight.current = { userId, promise }; return promise;
  }, [user?.id]);
  useEffect(() => {
    void getSettings().then(setSettings).catch(error => setError(error.message));
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Do not await Supabase calls in this callback: the auth lock can otherwise deadlock.
      setUser(session?.user || null);
      if (!session) { setSnapshot(null); setView('home'); }
      if (event === 'PASSWORD_RECOVERY') setDialog('recovery');
    });
    const setNetwork = () => setOnline(navigator.onLine);
    window.addEventListener('online', setNetwork); window.addEventListener('offline', setNetwork);
    if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { subscription.unsubscribe(); window.removeEventListener('online', setNetwork); window.removeEventListener('offline', setNetwork); };
  }, []);
  useEffect(() => { setSnapshot(null); if (user) { setLoading(true); void refresh(); } }, [user?.id, refresh]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => { if (navigator.onLine && !document.hidden) void refresh(); }, snapshot?.active_ride || snapshot?.driver?.is_online ? 5000 : 20000);
    const focus = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', focus); window.addEventListener('online', focus);
    const channel = supabase.channel(`motoja-sync-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'mj_sync', filter: `user_id=eq.${user.id}` }, () => void refresh()).subscribe();
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', focus); window.removeEventListener('online', focus); void supabase.removeChannel(channel); };
  }, [user?.id, refresh, Boolean(snapshot?.active_ride), snapshot?.driver?.is_online]);
  useDriverLocation(snapshot?.profile.role === 'driver' && Boolean(snapshot.driver?.is_online || snapshot.active_ride), setError);
  const role = snapshot?.profile.role;
  const active = snapshot?.active_ride;
  const config = snapshot?.settings || settings;
  const nav = [{ id: 'home' as View, label: role === 'driver' ? 'Trabalhar' : 'Início', Icon: House }, { id: 'history' as View, label: 'Viagens', Icon: Clock3 }, { id: 'safety' as View, label: 'Segurança', Icon: ShieldCheck }, { id: 'account' as View, label: 'Minha conta', Icon: UserRound }];
  const go = (next: View) => { if (!user && next !== 'home' && next !== 'safety') { setDialog('auth'); return; } setView(next); };
  return <div className="app-shell"><aside className="sidebar"><a className="brand-link" href="/" aria-label="MotoJá, início"><Brand /></a><span className="city-pill"><MapPin size={15} />Campo Verde, MT</span><nav aria-label="Menu principal">{nav.map(({ id, label, Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => go(id)}><Icon size={21} />{label}{id === 'home' && active ? <span className="nav-dot" /> : null}</button>)}{role === 'admin' ? <button className={view === 'admin' ? 'active' : ''} onClick={() => go('admin')}><LayoutDashboard size={21} />Administração</button> : null}</nav><div className="sidebar-bottom"><div className="local-brand"><span>É DAQUI.</span><strong>É para você.</strong><p>Mobilidade em Campo Verde.</p></div><button className="sidebar-help" onClick={() => setDialog('safety')}><Headphones size={18} />Precisa de ajuda?<ArrowRight size={16} /></button><button className="sidebar-help" onClick={() => setDialog('install')}><Download size={18} />Instalar no celular</button><small>MotoJá · 0.2.0</small></div></aside>
    <div className="main-shell"><header className="topbar"><div className="mobile-brand"><Brand /></div><div className="desktop-greeting"><MapPin size={18} /><span>Campo Verde <small>Mato Grosso</small></span></div><div className="topbar-actions"><ThemeToggle /><span className="pilot-badge">{config?.mode === 'live' ? 'Campo Verde' : config?.mode === 'pilot' ? 'Piloto por convite' : 'Em preparação'}</span><button className="icon-button" aria-label="Notificações" onClick={() => setDialog('notifications')}><Bell size={21} /></button>{user ? <button className="mini-avatar" aria-label="Minha conta" onClick={() => go('account')}>{snapshot?.profile.full_name.slice(0, 1) || <UserRound size={18} />}</button> : <button className="login-button" onClick={() => setDialog('auth')}>Entrar<ArrowRight size={16} /></button>}</div></header>
    <main className="main-content">{!online ? <Notice error><WifiOff size={17} />Sem conexão. Não é possível pedir ou alterar corridas agora.</Notice> : null}
      {error ? <div className="service-error"><Notice error>{error}</Notice><button className="text-button" onClick={() => { if (user) void refresh(); else void getSettings().then(result => { setSettings(result); setError(''); }).catch(error => setError(error.message)); }}>Tentar novamente</button></div> : null}
      {user && loading && !snapshot ? <p role="status" className="loading">Carregando sua conta…</p> : null}
      {snapshot && snapshot.profile.terms_version !== snapshot.settings.terms_version ? <div className="terms-banner"><ShieldCheck size={22} /><span>Leia as regras antes de participar do piloto.</span><button onClick={() => setDialog('terms')}>Ler regras<ArrowRight size={16} /></button></div> : null}
      <Suspense fallback={<div className="loading">Abrindo…</div>}>
      {view === 'home' ? active && user ? <ActiveRide ride={active} userId={user.id} refresh={refresh} onSafety={() => setDialog('safety')} /> : role === 'driver' && snapshot ? <Driver snapshot={snapshot} refresh={refresh} /> : <Passenger signedIn={Boolean(user)} firstName={snapshot?.profile.full_name.split(' ')[0]} settings={config} onLogin={() => setDialog('auth')} onRefresh={refresh} /> : null}
      {view === 'history' && snapshot ? <section className="history-page"><div className="page-heading"><p className="eyebrow">SEUS CAMINHOS</p><h1>Histórico de viagens.</h1><p>Revise valores, pagamentos e avaliações.</p></div>{snapshot.rides.length ? <div className="history-list">{snapshot.rides.map(ride => <button key={ride.id} className="history-card" onClick={() => setReceipt(ride)}><span className="row-icon"><Bike size={24} /></span><span><strong>{ride.destination.label}</strong><small>{new Date(ride.requested_at).toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })}</small><small>{statusLabels[ride.status]}</small></span><strong>{money(ride.price_cents)}</strong><ArrowRight size={19} /></button>)}</div> : <div className="panel"><Empty title="Seu primeiro caminho está por vir">Quando fizer uma corrida, os detalhes aparecerão aqui.</Empty><Button onClick={() => setView('home')}>Voltar ao início</Button></div>}</section> : null}
      {view === 'safety' ? <section className="safety-page panel"><Safety settings={config} signedIn={Boolean(user)} rideId={active?.id} /></section> : null}
      {view === 'account' && snapshot ? <><div className="page-heading"><p className="eyebrow">DO SEU JEITO</p><h1>Minha conta.</h1><p>Seus dados, sua segurança, seu acesso.</p></div><Account snapshot={snapshot} refresh={refresh} onTerms={() => setDialog('terms')} onSafety={() => setDialog('safety')} onMfa={() => setDialog('mfa')} /><p className="helper">ID da conta: {snapshot.profile.id}</p></> : null}
      {view === 'admin' && snapshot ? <Admin snapshot={snapshot} refresh={refresh} /> : null}
      </Suspense><footer className="page-footer"><span>MotoJá · Campo Verde, MT</span><button onClick={() => setDialog('terms')}>Regras e privacidade</button></footer>
    </main><nav className="mobile-nav" aria-label="Menu do celular">{nav.map(({ id, label, Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => go(id)}><Icon size={22} /><span>{label}</span></button>)}{role === 'admin' ? <button className={view === 'admin' ? 'active' : ''} onClick={() => go('admin')}><LayoutDashboard size={21} /><span>Gestão</span></button> : null}</nav></div>
    {dialog ? <Modal variant={dialog === 'auth' ? 'auth' : 'default'} title={({ auth: 'Sua conta MotoJá', safety: 'Central de segurança', terms: 'Regras e privacidade', mfa: 'Proteção da conta', recovery: 'Recuperar senha', install: 'MotoJá no seu celular', notifications: 'Suas notificações' })[dialog]} onClose={() => setDialog(null)}><Suspense fallback={<p>Abrindo…</p>}>
      {dialog === 'auth' ? <Auth onSuccess={() => setDialog(null)} /> : null}
      {dialog === 'safety' ? <Safety settings={config} signedIn={Boolean(user)} rideId={active?.id} /> : null}
      {dialog === 'terms' ? <Terms version={config?.terms_version || 'piloto-2026-09-v1'} onAccepted={user ? async () => { await refresh(); setDialog(null); } : undefined} /> : null}
      {dialog === 'mfa' ? <Mfa done={() => { setDialog(null); void refresh(); }} /> : null}
      {dialog === 'recovery' ? <RecoverPassword done={() => { setDialog(null); void refresh(); }} /> : null}
      {dialog === 'install' ? <div className="legal-copy"><h3>iPhone</h3><p>Abra este endereço no Safari. Toque em Compartilhar e em Adicionar à Tela de Início.</p><h3>Samsung e outros Android</h3><p>Abra no Chrome. No menu, procure Instalar aplicativo ou Adicionar à tela inicial.</p><Notice>A versão para navegador precisa permanecer aberta para atualizar o GPS durante o piloto. Ela ainda não substitui a validação de um aplicativo nativo em segundo plano.</Notice></div> : null}
      {dialog === 'notifications' ? <Empty title={active ? statusLabels[active.status] : 'Tudo tranquilo por aqui'}>{active ? 'Acompanhe os detalhes e as próximas etapas na tela inicial.' : 'Atualizações da sua corrida aparecerão enquanto o app estiver aberto.'}</Empty> : null}
    </Suspense></Modal> : null}
    {receipt && user ? <Modal title="Detalhes da viagem" onClose={() => setReceipt(null)}><Suspense fallback={<p>Abrindo…</p>}><RideReceipt ride={snapshot?.rides.find(ride => ride.id === receipt.id) || receipt} userId={user.id} refresh={refresh} /></Suspense></Modal> : null}
  </div>;
}
