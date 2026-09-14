import { useRef, useState, type FormEvent } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/api';
import { Button, Notice } from '../components/ui';
import '../styles/mfa.css';

const FACTOR_NAME = 'MotoJá administração';
type AuthenticatorSetup = { factorId: string; qrCode?: string; secret?: string };

function verificationMessage(failure: unknown): string {
  const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : '';
  if (code === 'mfa_verification_failed' || code === 'mfa_challenge_expired') {
    return 'Código inválido ou expirado. Use o código atual do autenticador e tente novamente.';
  }
  if (code === 'over_request_rate_limit') {
    return 'Muitas tentativas. Aguarde alguns instantes antes de tentar novamente.';
  }
  return 'Não foi possível confirmar o código. Confira a conexão e tente novamente.';
}

/** Enrollment material stays in this screen's memory and is cleared after verification. */
export function Mfa({ done }: { done: () => void }) {
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const inFlight = useRef(false);

  async function prepare() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setCopyMessage('');
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const verified = factors.data.totp.find(item => item.status === 'verified');
      if (verified) {
        setSetup({ factorId: verified.id });
        return;
      }

      // This Auth project can serve other apps. Only replace our abandoned enrollments.
      const abandoned = factors.data.all.filter(item =>
        item.factor_type === 'totp' && item.status === 'unverified' && item.friendly_name === FACTOR_NAME
      );
      for (const item of abandoned) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: item.id });
        if (removed.error) throw removed.error;
      }

      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: FACTOR_NAME });
      if (enrolled.error) throw enrolled.error;
      setSetup({
        factorId: enrolled.data.id,
        qrCode: enrolled.data.totp.qr_code,
        secret: enrolled.data.totp.secret,
      });
    } catch {
      setError('Não foi possível preparar o autenticador. Confira a conexão e tente novamente.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!setup?.secret) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(setup.secret);
      setCopyMessage('Chave copiada. Cole no aplicativo autenticador.');
    } catch {
      setCopyMessage('Cópia automática indisponível. Toque na chave e use a opção Copiar do celular.');
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!setup || inFlight.current || !/^[0-9]{6}$/.test(code)) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.factorId, code });
      if (result.error) throw result.error;
      setSetup(null);
      setCode('');
      setCopyMessage('');
      done();
    } catch (failure) {
      setCode('');
      setError(verificationMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="form-stack mfa-setup">
    <span className="brand-emblem"><ShieldCheck size={26} /></span>
    <p>O acesso administrativo exige a confirmação em um aplicativo autenticador.</p>
    {!setup ? <Button type="button" onClick={prepare} busy={busy}>Configurar ou confirmar acesso</Button> :
      <form className="form-stack" onSubmit={verify}>
        {setup.secret ? <>
          <p>Escolha como adicionar sua conta ao autenticador:</p>
          <details className="mfa-option">
            <summary>Configurar no mesmo celular</summary>
            <div className="form-stack mfa-option-content">
              <ol className="mfa-instructions">
                <li>Copie a chave abaixo.</li>
                <li>No aplicativo autenticador, adicione uma conta usando uma chave de configuração. Use o nome MotoJá e o tipo baseado no tempo.</li>
                <li>Cole a chave no autenticador. Depois volte a esta tela e informe o código de seis números.</li>
              </ol>
              <label>Chave de configuração
                <input className="mfa-secret" value={setup.secret} readOnly autoComplete="off" spellCheck={false} onClick={event => event.currentTarget.select()} />
              </label>
              <Button type="button" variant="secondary" onClick={copySecret}><Copy size={18} />Copiar chave</Button>
              {copyMessage ? <Notice>{copyMessage}</Notice> : null}
            </div>
          </details>
          {setup.qrCode ? <details className="mfa-option">
            <summary>Usar QR code em outro aparelho</summary>
            <div className="mfa-option-content">
              <p>Abra o autenticador no outro aparelho e leia este QR code.</p>
              <img className="mfa-qr" src={setup.qrCode} alt="QR code para configurar o autenticador da sua conta" />
            </div>
          </details> : null}
          <p className="helper">A chave e o QR code são privados. Guarde o acesso ao autenticador e não compartilhe capturas desta configuração.</p>
        </> : <p>Abra o autenticador que você já configurou e informe o código atual da sua conta.</p>}
        <label>Código do autenticador
          <input
            inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            pattern="[0-9]{6}" minLength={6} maxLength={6} required
          />
        </label>
        <Button busy={busy} disabled={code.length !== 6}>Confirmar código</Button>
      </form>}
    {error ? <Notice error>{error}</Notice> : null}
  </div>;
}
