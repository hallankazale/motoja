import { expect, test, type Page } from '@playwright/test';

const accountId = '20000000-0000-4000-8000-000000000001';
const factorId = '20000000-0000-4000-8000-000000000002';
const abandonedId = '20000000-0000-4000-8000-000000000003';
const otherAppId = '20000000-0000-4000-8000-000000000004';
// Synthetic enrollment material, never used with the hosted Auth service.
const setupSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const factorName = 'MotoJá administração';
const settings = {
  mode: 'closed', city: 'Campo Verde', support_phone: '', support_email: '',
  terms_version: 'piloto-2026-09-v1', base_cents: 400, minimum_cents: 700,
  per_km_cents: 170, per_minute_cents: 0, routing_ready: false,
  legal_ready: false, insurance_ready: false,
};

async function prepareMfa(page: Page, options: { enrolled?: boolean; clipboardBlocked?: boolean; cleanupFails?: boolean } = {}) {
  const state = { verified: false, enrollments: 0, challenges: 0, verifications: 0, removed: [] as string[] };
  let factors = options.enrolled
    ? [{ id: factorId, factor_type: 'totp', status: 'verified', friendly_name: factorName }]
    : [
      { id: abandonedId, factor_type: 'totp', status: 'unverified', friendly_name: factorName },
      { id: otherAppId, factor_type: 'totp', status: 'unverified', friendly_name: 'Outro aplicativo' },
    ];
  const user = () => ({
    id: accountId, email: 'admin-mfa@example.invalid', aud: 'authenticated',
    role: 'authenticated', app_metadata: {}, user_metadata: {}, factors,
    created_at: '2026-09-01T00:00:00.000Z',
  });
  const session = (aal: 'aal1' | 'aal2') => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const payload = btoa(JSON.stringify({ sub: accountId, role: 'authenticated', aal, exp: expires }));
    return {
      access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.synthetic-test-only',
      refresh_token: 'synthetic-test-only', expires_at: expires, expires_in: 3600,
      token_type: 'bearer', user: user(),
    };
  };

  await page.addInitScript(({ initialSession, clipboardBlocked }) => {
    localStorage.setItem('motoja-v2-auth', JSON.stringify(initialSession));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => {
        if (clipboardBlocked) throw new Error('Synthetic clipboard denial');
        (window as typeof window & { copiedMfaKey?: string }).copiedMfaKey = value;
      },
    } });
  }, { initialSession: session('aal1'), clipboardBlocked: Boolean(options.clipboardBlocked) });

  await page.routeWebSocket(/^wss:\/\/[^/]+\.supabase\.co\//, () => {});
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf1f2"/></svg>',
  }));
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/rpc/mj_public_config')) return route.fulfill({ json: settings });
    if (path.endsWith('/rpc/mj_command')) {
      if (request.postDataJSON()?.action !== 'snapshot') return route.fulfill({ status: 403, json: { error: 'Fixture permits snapshots only' } });
      if (!state.verified) return route.fulfill({ json: { error: 'Confirme a autenticação em duas etapas para esta ação.' } });
      return route.fulfill({ json: {
        profile: { id: accountId, full_name: 'Administrador de teste', phone: '', role: 'admin', terms_version: settings.terms_version, account_status: 'active', is_tester: false },
        settings, driver: null, active_ride: null, rides: [], offer: null, documents: [], incidents: [],
        admin: { rides: [], drivers: [], incidents: [] },
      } });
    }
    if (path === '/auth/v1/user') return route.fulfill({ json: user() });
    if (path.startsWith('/auth/v1/factors/') && request.method() === 'DELETE') {
      const removedId = path.split('/').at(-1)!;
      state.removed.push(removedId);
      if (options.cleanupFails) return route.fulfill({ status: 400, json: { error_code: 'mfa_factor_not_found', msg: 'Synthetic cleanup failure' } });
      factors = factors.filter(factor => factor.id !== removedId);
      return route.fulfill({ json: { id: removedId } });
    }
    if (path === '/auth/v1/factors' && request.method() === 'POST') {
      state.enrollments++;
      expect(request.postDataJSON()).toMatchObject({ factor_type: 'totp', friendly_name: factorName });
      factors.push({ id: factorId, factor_type: 'totp', status: 'unverified', friendly_name: factorName });
      return route.fulfill({ json: {
        id: factorId, type: 'totp', friendly_name: factorName,
        totp: { secret: setupSecret, uri: 'otpauth://totp/MotoJa:synthetic?secret=' + setupSecret + '&issuer=MotoJa',
          qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><text x="20" y="120">Synthetic test QR</text></svg>' },
      } });
    }
    if (path === '/auth/v1/factors/' + factorId + '/challenge') {
      state.challenges++;
      return route.fulfill({ json: { id: '20000000-0000-4000-8000-000000000005', expires_at: Math.floor(Date.now() / 1000) + 300 } });
    }
    if (path === '/auth/v1/factors/' + factorId + '/verify') {
      state.verifications++;
      if (request.postDataJSON()?.code !== '123456') return route.fulfill({
        // Use the supported legacy body; this cross-origin fixture does not expose an API version header.
        status: 422, json: { error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code' },
      });
      state.verified = true;
      factors = factors.map(factor => factor.id === factorId ? { ...factor, status: 'verified' } : factor);
      return route.fulfill({ json: session('aal2') });
    }
    return route.fulfill({ status: 401, json: { error: 'External requests disabled in this test' } });
  });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Proteção da conta' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Configurar ou confirmar acesso' }).click();
  return { state, dialog };
}

for (const clipboardBlocked of [false, true]) {
  test('admin configures MFA on one phone; clipboard ' + (clipboardBlocked ? 'denied' : 'available'), async ({ page }) => {
    const { state, dialog } = await prepareMfa(page, { clipboardBlocked });
    await dialog.getByText('Configurar no mesmo celular', { exact: true }).click();
    await expect(dialog.getByLabel('Chave de configuração', { exact: true })).toHaveValue(setupSecret);
    await dialog.getByRole('button', { name: 'Copiar chave', exact: true }).click();
    if (clipboardBlocked) {
      await expect(dialog.getByText('Cópia automática indisponível.', { exact: false })).toBeVisible();
      await expect(dialog.getByLabel('Chave de configuração', { exact: true })).toHaveValue(setupSecret);
    } else {
      await expect(dialog.getByText('Chave copiada.', { exact: false })).toBeVisible();
      expect(await page.evaluate(() => (window as typeof window & { copiedMfaKey?: string }).copiedMfaKey)).toBe(setupSecret);
    }
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })) ).not.toContain(setupSecret);
    expect(state.verified).toBe(false);
    expect(state.removed).toEqual([abandonedId]);
    expect(state.enrollments).toBe(1);
    await dialog.getByLabel('Código do autenticador', { exact: true }).fill('000000');
    await dialog.getByRole('button', { name: 'Confirmar código', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Código inválido ou expirado');
    expect(state.verified).toBe(false);
    await expect(dialog.getByLabel('Chave de configuração', { exact: true })).toHaveValue(setupSecret);
    await dialog.getByLabel('Código do autenticador', { exact: true }).fill('123456');
    await dialog.getByRole('button', { name: 'Confirmar código', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('OLÁ, ADMINISTRADOR', { exact: true })).toBeVisible();
    expect(state.challenges).toBe(2);
    expect(state.verifications).toBe(2);
    expect(state.enrollments).toBe(1);
    await expect(page.getByLabel('Chave de configuração', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })) ).not.toContain(setupSecret);
  });
}

test('verified authenticator is reused without replacing any factor', async ({ page }) => {
  const { state, dialog } = await prepareMfa(page, { enrolled: true });
  await expect(dialog.getByText('Abra o autenticador que você já configurou', { exact: false })).toBeVisible();
  await expect(dialog.getByLabel('Chave de configuração', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Código do autenticador', { exact: true }).fill('123456');
  await dialog.getByRole('button', { name: 'Confirmar código', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.verified).toBe(true);
  expect(state.enrollments).toBe(0);
  expect(state.removed).toEqual([]);
});

test('failed cleanup keeps setup retryable without enrolling a duplicate', async ({ page }) => {
  const { state, dialog } = await prepareMfa(page, { cleanupFails: true });
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível preparar o autenticador');
  await expect(dialog.getByRole('button', { name: 'Configurar ou confirmar acesso' })).toBeEnabled();
  expect(state.enrollments).toBe(0);
  expect(state.verified).toBe(false);
  expect(state.removed).toEqual([abandonedId]);
});
