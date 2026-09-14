import { useState, type FormEvent } from 'react';
import { Mail, LockKeyhole, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/api';
import { Brand } from '../components/Brand';
import { Button, Notice } from '../components/ui';

export function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const changeMode = (next: typeof mode) => { setMode(next); setMessage(''); setShowPassword(false); };

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

  return <div className="auth-content">
    <Brand className="auth-brand" />
    <div className="auth-heading">
      <h3>{mode === 'signup' ? 'Seu caminho começa aqui.' : mode === 'reset' ? 'Vamos recuperar seu acesso.' : 'Bem-vindo de volta!'}</h3>
      <p>{mode === 'signup' ? 'Crie sua conta e venha de MotoJá' : mode === 'reset' ? 'Informe o e-mail da sua conta' : 'Faça login para continuar'}</p>
    </div>
    <form onSubmit={submit} className="auth-form form-stack">
      {mode === 'signup' ? <>
        <label>Nome completo<input name="name" autoComplete="name" minLength={3} maxLength={100} required /></label>
        <label>Celular com DDD<input name="phone" type="tel" autoComplete="tel" placeholder="(66) 99999-9999" minLength={10} maxLength={20} required /></label>
        <label>Como vai usar o MotoJá?<select name="role"><option value="passenger">Quero pedir corridas</option><option value="driver">Quero ser motociclista</option></select></label>
      </> : null}
      <label><span className="sr-only">E-mail</span><span className="input-icon"><Mail size={22} /><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="Seu e-mail" /></span></label>
      {mode !== 'reset' ? <label><span className="sr-only">Senha</span><span className="input-icon"><LockKeyhole size={22} /><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 12 : 1} maxLength={128} required placeholder={mode === 'signup' ? 'Pelo menos 12 caracteres' : 'Sua senha'} /><button className="password-toggle" type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(current => !current)}>{showPassword ? <EyeOff size={22} /> : <Eye size={22} />}</button></span></label> : null}
      {mode === 'login' ? <button type="button" className="forgot-password" onClick={() => changeMode('reset')}>Esqueci minha senha</button> : null}
      <Button busy={busy} type="submit" className="auth-submit">{mode === 'signup' ? 'Criar minha conta' : mode === 'reset' ? 'Enviar instruções' : 'Entrar'}</Button>
    </form>
    {message ? <Notice error={failure}>{message}</Notice> : null}
    {mode === 'login' ? <p className="auth-switch">Ainda não tem conta? <button type="button" onClick={() => changeMode('signup')}>Criar conta</button></p> : <button className="auth-back" type="button" onClick={() => changeMode('login')}><ArrowLeft size={17} />Voltar para entrar</button>}
    <div className="auth-local"><span />Campo Verde, MT<span /></div>
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
