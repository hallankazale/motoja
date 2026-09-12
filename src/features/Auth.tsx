import { useState, type FormEvent } from 'react';
import { Mail, LockKeyhole, Bike, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/api';
import { Button, Notice } from '../components/ui';

export function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim(), password = String(form.get('password') || '');
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMessage('Se este e-mail tiver uma conta, enviaremos as instruções. Confira também o spam.');
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: String(form.get('name')).trim(), phone: String(form.get('phone')).trim(), requested_role: form.get('role') === 'driver' ? 'driver' : 'passenger' },
        } });
        if (error) throw error;
        if (data.session) onSuccess();
        else setMessage('Confira seu e-mail para confirmar a conta. Depois, volte aqui para entrar.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error('E-mail ou senha incorretos, ou e-mail ainda não confirmado.');
        onSuccess();
      }
      setFailure(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível entrar.'); setFailure(true); }
    finally { setBusy(false); }
  }
  return <div className="auth-content"><span className="brand-emblem"><Bike size={26} /></span><h3>{mode === 'signup' ? 'Seu próximo caminho começa aqui.' : mode === 'reset' ? 'Vamos recuperar seu acesso.' : 'Que bom ter você por aqui.'}</h3><p>Uma conta para se movimentar por Campo Verde.</p>
    {mode !== 'reset' ? <div className="segmented"><button aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setMessage(''); }}>Entrar</button><button aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setMessage(''); }}>Criar conta</button></div> : null}
    <form onSubmit={submit} className="form-stack">
      {mode === 'signup' ? <><label>Nome completo<input name="name" autoComplete="name" minLength={3} maxLength={100} required /></label><label>Celular com DDD<input name="phone" type="tel" autoComplete="tel" placeholder="(66) 99999-9999" minLength={10} maxLength={20} required /></label><label>Como vai usar o MotoJá?<select name="role"><option value="passenger">Quero pedir corridas</option><option value="driver">Quero ser motociclista</option></select></label></> : null}
      <label>E-mail<div className="input-icon"><Mail size={18} /><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="voce@exemplo.com" /></div></label>
      {mode !== 'reset' ? <label>Senha<div className="input-icon"><LockKeyhole size={18} /><input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 12 : 1} maxLength={128} required placeholder={mode === 'signup' ? 'Pelo menos 12 caracteres' : 'Sua senha'} /></div></label> : null}
      <Button busy={busy} type="submit">{mode === 'signup' ? 'Criar minha conta' : mode === 'reset' ? 'Enviar instruções' : 'Entrar'}<ArrowRight size={18} /></Button>
    </form>{message ? <Notice error={failure}>{message}</Notice> : null}
    <button className="text-button" onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setMessage(''); }}>{mode === 'reset' ? 'Voltar para entrar' : 'Esqueci minha senha'}</button>
  </div>;
}

export function RecoverPassword({ done }: { done: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  return <form className="form-stack" onSubmit={async event => {
    event.preventDefault(); setBusy(true);
    const password = String(new FormData(event.currentTarget).get('password'));
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false); if (error) setMessage(error.message); else done();
  }}><label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><Button busy={busy}>Salvar nova senha</Button>{message ? <Notice error>{message}</Notice> : null}</form>;
}
