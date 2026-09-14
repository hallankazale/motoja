import { useState } from 'react';
import { CheckCircle2, CircleAlert, ClipboardCheck } from 'lucide-react';
import { getIntegrationStatus, type IntegrationStatus } from '../lib/api';
import { Button, Notice } from '../components/ui';

/** Configuration presence is distinct from a real email-delivery or road test. */
export function PilotReadiness() {
  const [result, setResult] = useState<IntegrationStatus | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() {
    setBusy(true); setError('');
    try { setResult(await getIntegrationStatus()); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  const checks = result ? [
    { name: 'Busca de endereços', ready: result.maps.search_configured, detail: result.maps.search_configured ? 'Provedor configurado; confira um endereço conhecido.' : 'Falta configurar o provedor de mapas no servidor.' },
    { name: 'Cálculo da rota', ready: result.maps.routing_configured, detail: result.maps.routing_configured ? 'Credencial presente; valide uma rota de motocicleta.' : 'Falta configurar a chave do serviço de rotas.' },
    { name: 'Confirmação de e-mail', ready: result.emailConfirmation, detail: result.emailConfirmation ? 'Confirmação exigida; teste o recebimento e a recuperação.' : 'O cadastro atual aceita e-mail sem confirmar. Configure o envio e ative a confirmação.' },
  ] : [];
  return <section className="panel pilot-readiness"><div className="section-title"><div><h2>Pronto para testar?</h2><p>Confira as integrações antes de convidar participantes.</p></div><ClipboardCheck size={27} /></div>
    <Button variant="secondary" busy={busy} onClick={check}>Verificar integrações</Button>
    {checks.length ? <ul className="integration-list">{checks.map(item => <li key={item.name}>{item.ready ? <CheckCircle2 size={22} className="integration-ok" /> : <CircleAlert size={22} className="integration-pending" />}<div><strong>{item.name}</strong><p>{item.detail}</p></div><span className="small-tag">{item.ready ? 'CONFIGURADO' : 'PENDENTE'}</span></li>)}</ul> : null}
    {error ? <Notice error>{error}</Notice> : null}
    <p className="helper">Depois das configurações, use duas contas e dois celulares. Confirme o envio de e-mail, a rota, o PIN e a atualização das etapas. Esta conferência não libera corridas automaticamente.</p>
  </section>;
}
