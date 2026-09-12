import { useState } from 'react';
import { ShieldCheck, LogOut, FileText, Headphones, UserRound } from 'lucide-react';
import type { Snapshot } from '../domain/types';
import { command, supabase } from '../lib/api';
import { Button, Notice, RowLink } from '../components/ui';

export function Mfa({ done }: { done: () => void }) {
  const [factor, setFactor] = useState(''), [qr, setQr] = useState(''), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function prepare() {
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.auth.mfa.listFactors(); if (error) throw error;
      const verified = data.totp.find(item => item.status === 'verified');
      if (verified) { setFactor(verified.id); return; }
      for (const item of data.all.filter(item => item.status === 'unverified' && item.factor_type === 'totp')) await supabase.auth.mfa.unenroll({ factorId: item.id });
      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MotoJá administração' }); if (enrolled.error) throw enrolled.error;
      setFactor(enrolled.data.id); setQr(enrolled.data.totp.qr_code);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <div className="form-stack"><span className="brand-emblem"><ShieldCheck size={26} /></span><p>O acesso administrativo exige a confirmação em um aplicativo autenticador.</p>{!factor ? <Button onClick={prepare} busy={busy}>Configurar ou confirmar acesso</Button> : <form className="form-stack" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code }); if (result.error) throw result.error; done(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{qr ? <><p>Leia o QR code com seu aplicativo autenticador. Guarde seus meios de recuperação com segurança.</p><img className="mfa-qr" src={qr} alt="QR code para configurar a autenticação de sua própria conta" /></> : null}<label>Código do autenticador<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label><Button busy={busy}>Confirmar código</Button></form>}{error ? <Notice error>{error}</Notice> : null}</div>;
}

export function Account({ snapshot, refresh, onTerms, onSafety, onMfa }: { snapshot: Snapshot; refresh: () => Promise<void>; onTerms: () => void; onSafety: () => void; onMfa: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  return <div className="account-grid"><section className="panel"><div className="profile-heading"><span className="avatar large"><UserRound size={32} /></span><div><h2>{snapshot.profile.full_name}</h2><span className="small-tag">{snapshot.profile.role === 'driver' ? 'MOTOCICLISTA' : snapshot.profile.role === 'admin' ? 'ADMINISTRAÇÃO' : 'PASSAGEIRO'}</span></div></div><form className="form-stack" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); try { await command('update_profile', { full_name: form.get('full_name'), phone: form.get('phone') }); await refresh(); setMessage('Dados atualizados.'); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}><label>Nome completo<input name="full_name" defaultValue={snapshot.profile.full_name} minLength={3} maxLength={100} required autoComplete="name" /></label><label>Celular com DDD<input name="phone" defaultValue={snapshot.profile.phone} type="tel" minLength={10} maxLength={20} required autoComplete="tel" /></label><Button busy={busy}>Salvar dados</Button></form>{message ? <Notice>{message}</Notice> : null}</section><section className="panel account-links"><RowLink icon={<ShieldCheck size={22} />} title="Autenticação em duas etapas" detail="Proteja o acesso à sua conta" onClick={onMfa} /><RowLink icon={<Headphones size={22} />} title="Ajuda e segurança" detail="Ocorrências, privacidade e exclusão de conta" onClick={onSafety} /><RowLink icon={<FileText size={22} />} title="Regras e privacidade" detail={`Versão ${snapshot.settings.terms_version}`} onClick={onTerms} /><Button variant="secondary" onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) setMessage(error.message); }}><LogOut size={18} />Sair da conta</Button><p className="helper">MotoJá · versão 0.2.0</p></section></div>;
}
