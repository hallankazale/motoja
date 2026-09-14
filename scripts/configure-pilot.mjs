import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { buildPilotConfig } from './lib/pilot-config.mjs';

// Run locally: credentials travel only to the authenticated Supabase Management API.
const args = process.argv.slice(2);
if (!args.includes('--file') || args.includes('--help')) {
  console.log('Uso: node scripts/configure-pilot.mjs --file /caminho/privado/piloto.json [--apply]\nSem --apply, mostra apenas o plano sem valores secretos. SUPABASE_ACCESS_TOKEN deve existir no ambiente.');
  process.exit(args.includes('--help') ? 0 : 1);
}
async function main() {
  const inputPath = args[args.indexOf('--file') + 1];
  const file = await realpath(inputPath);
  const project = await realpath(new URL('../', import.meta.url));
  if (file.startsWith(project + path.sep)) throw new Error('Guarde o arquivo de credenciais fora do repositório.');
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Autentique a configuração com SUPABASE_ACCESS_TOKEN no ambiente local. Não envie o token pelo chat.');
  const input = JSON.parse(await readFile(file, 'utf8'));
  const preliminary = buildPilotConfig(input);
  const prefix = `https://api.supabase.com/v1/projects/${preliminary.projectRef}`;
  async function api(endpoint, method = 'GET', body) {
    const response = await fetch(`${prefix}/${endpoint}`, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    // Remote error bodies can echo submitted settings: never write them to logs.
    if (!response.ok) throw new Error(`Supabase recusou ${endpoint} (${response.status}). Confira acesso ao projeto e os valores informados.`);
    if (response.status === 204) return null;
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  const current = await api('config/auth');
  const plan = buildPilotConfig(input, current);
  console.log(JSON.stringify(plan.review, null, 2));
  if (!args.includes('--apply')) { console.log('Plano conferido. Acrescente --apply para aplicar exatamente estas configurações.'); return; }
  await api('config/auth', 'PATCH', plan.auth);
  if (plan.secrets.length) await api('secrets', 'POST', plan.secrets);
  const after = await api('config/auth');
  if (after.site_url !== plan.auth.site_url || (plan.auth.mailer_autoconfirm === false && after.mailer_autoconfirm !== false)) throw new Error('A configuração retornada não corresponde ao plano. Revise antes do teste.');
  console.log('Configuração aplicada e conferida. Teste a entrega do e-mail e uma rota no app; a operação não foi liberada automaticamente.');
}
main().catch(() => { console.error('Configuração não concluída. Confira o JSON privado, SUPABASE_ACCESS_TOKEN e o acesso ao projeto. Nenhuma credencial foi exibida. Se houve aplicação parcial, executar novamente preserva os mesmos valores.'); process.exitCode = 1; });
