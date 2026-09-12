import { test, expect, type Page } from '@playwright/test';
const id = '10000000-0000-4000-8000-000000000001';
const settings = { mode: 'closed', city: 'Campo Verde', support_phone: '', support_email: '', terms_version: 'piloto-2026-09-v1', base_cents: 400, minimum_cents: 700, per_km_cents: 170, per_minute_cents: 0, routing_ready: false, legal_ready: false, insurance_ready: false };
async function prepare(page: Page, role?: 'passenger' | 'driver' | 'admin') {
  // Only this test fixture supplies synthetic data. Production always calls the authenticated API.
  const user = { id, email: 'synthetic@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const snapshot = { profile: { id, full_name: 'Conta de teste', phone: '', role, terms_version: settings.terms_version, account_status: 'active', is_tester: false }, settings,
    driver: role === 'driver' ? { user_id: id, approval_status: 'pending', is_online: false, model: '', color: '', plate: '', pix_key: '', documents_valid_until: null, review_note: null } : null,
    active_ride: null, rides: [], offer: null, documents: [], incidents: [], ...(role === 'admin' ? { admin: { rides: [], drivers: [], incidents: [] } } : {}) };
  if (role) await page.addInitScript(({ user }) => {
    const payload = btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 }));
    localStorage.setItem('motoja-v2-auth', JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test-only`, refresh_token: 'test-only', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user }));
  }, { user });
  await page.route('**/*.supabase.co/**', async route => {
    const url = route.request().url();
    if (url.includes('/rpc/mj_public_config')) return route.fulfill({ json: settings });
    if (url.includes('/rpc/mj_command')) {
      const action = route.request().postDataJSON()?.action;
      return route.fulfill({ json: action === 'snapshot' ? snapshot : { error: 'Comando não permitido neste teste visual.' } });
    }
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
    return route.fulfill({ status: 401, json: { error: 'External requests disabled in tests' } });
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf1f2"/></svg>' }));
  await page.goto('/');
  if (role === 'passenger' || role === 'admin') await expect(page.getByText('OLÁ, CONTA', { exact: true })).toBeVisible();
  if (role === 'driver') await expect(page.getByText('ÁREA DO MOTOCICLISTA', { exact: true })).toBeVisible();
}
function navigation(page: Page) { return page.getByRole('navigation', { name: page.viewportSize()!.width <= 950 ? 'Menu do celular' : 'Menu principal', exact: true }); }
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
test('guest can choose payment, inspect map and open safety without creating a trip', async ({ page }) => {
  await prepare(page);
  await expect(page.getByRole('heading', { name: 'Bora de moto?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver valor da corrida' })).toBeDisabled();
  await page.getByRole('button', { name: 'Dinheiro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dinheiro', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'EMBARQUE Onde você está?' }).click();
  await expect(page.getByRole('heading', { name: 'Seu ponto de embarque' })).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await navigation(page).getByRole('button', { name: 'Segurança', exact: true }).click();
  await expect(page.getByRole('link', { name: '190 Polícia Militar' })).toHaveAttribute('href', 'tel:190');
  await expect(page.getByText('O MotoJá não aciona os serviços de emergência automaticamente.', { exact: false })).toBeVisible();
  await noOverflow(page);
});
test('passenger sees empty history and account without fictional trips', async ({ page }) => {
  await prepare(page, 'passenger');
  await navigation(page).getByRole('button', { name: 'Viagens', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seu primeiro caminho está por vir' })).toBeVisible();
  await navigation(page).getByRole('button', { name: 'Minha conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minha conta.' })).toBeVisible();
  await noOverflow(page);
});
test('pending driver cannot go online and can edit motorcycle details', async ({ page }) => {
  await prepare(page, 'driver');
  await expect(page.getByRole('button', { name: 'Ficar disponível', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Modelo', { exact: true })).toBeVisible();
  await page.getByLabel('Modelo', { exact: true }).fill('Moto de teste');
  await expect(page.getByRole('heading', { name: 'Seus documentos' })).toBeVisible();
  await noOverflow(page);
});
test('admin sees preparation and invitations, with no public release shortcut', async ({ page }) => {
  await prepare(page, 'admin');
  await navigation(page).getByRole('button', { name: page.viewportSize()!.width <= 950 ? 'Gestão' : 'Administração', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Uma cidade em movimento.' })).toBeVisible();
  await page.getByRole('button', { name: 'Operação', exact: true }).click();
  await expect(page.getByLabel('Disponibilidade')).toHaveValue('closed');
  await expect(page.getByLabel('ID da conta participante')).toBeVisible();
  expect(await page.getByLabel('Disponibilidade').locator('option').allTextContents()).toEqual(['Fechado — em preparação', 'Piloto — apenas convidados']);
  await noOverflow(page);
});

test('reference login supports password visibility and remembers the selected appearance', async ({ page }, testInfo) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sua conta MotoJá' });
  await expect(dialog.getByRole('heading', { name: 'Bem-vindo de volta!' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('entrada-escura.png'), fullPage: true });
  const password = dialog.locator('input[name="password"]');
  await expect(password).toHaveAttribute('type', 'password');
  await dialog.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await dialog.getByRole('button', { name: 'Ativar tema claro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(dialog.getByLabel('Nome completo', { exact: true })).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Voltar para entrar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Vamos recuperar seu acesso.' })).toBeVisible();
});
