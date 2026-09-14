/** Build a narrow, reviewable configuration. Existing redirect URLs are preserved. */
export function buildPilotConfig(input, currentAuth = {}) {
  if (!/^[a-z0-9]{20}$/.test(input.project_ref || '')) throw new Error('Informe a referência válida do projeto Supabase.');
  const origin = new URL(input.site_url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Use somente a origem HTTPS do aplicativo.');
  const auth = { site_url: origin.origin,
    uri_allow_list: [...new Set([...String(currentAuth.uri_allow_list || '').split(',').filter(Boolean), origin.origin, `${origin.origin}/`])].join(',') };
  if (input.smtp) {
    const smtp = input.smtp;
    if (![smtp.host, smtp.user, smtp.password, smtp.from].every(value => typeof value === 'string' && value.trim())
      || ![465, 587, 2525].includes(smtp.port) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtp.from)) throw new Error('Preencha host, porta, usuário, senha e remetente válido do SMTP.');
    Object.assign(auth, { external_email_enabled: true, mailer_autoconfirm: false, mailer_secure_email_change_enabled: true,
      smtp_host: smtp.host, smtp_port: String(smtp.port), smtp_user: smtp.user, smtp_pass: smtp.password,
      smtp_admin_email: smtp.from, smtp_sender_name: 'MotoJá' });
  } else if (currentAuth.mailer_autoconfirm && currentAuth.smtp_host && currentAuth.smtp_admin_email) {
    // A pre-existing SMTP configuration can be retained while turning on verification.
    auth.mailer_autoconfirm = false;
  }
  const secrets = [];
  if (input.geoapify_api_key) {
    if (!/^[a-zA-Z0-9_-]{20,256}$/.test(input.geoapify_api_key) || /YOUR_|SUA_|SUBSTITUA/i.test(input.geoapify_api_key)) throw new Error('Informe uma chave Geoapify válida.');
    secrets.push({ name: 'MAPS_PROVIDER', value: 'geoapify' }, { name: 'GEOAPIFY_API_KEY', value: input.geoapify_api_key });
  }
  return { projectRef: input.project_ref, auth, secrets, review: {
    site_url: auth.site_url, redirects: auth.uri_allow_list.split(','), smtp: input.smtp ? 'configurar' : 'preservar',
    email_confirmation: auth.mailer_autoconfirm === false ? 'ativar' : currentAuth.mailer_autoconfirm === false ? 'já ativa' : 'pendente: configure SMTP',
    map_provider: secrets.length ? 'Geoapify / motorcycle' : 'preservar', operation: 'não alterada; participantes continuam sujeitos a convite e aprovação',
  } };
}
