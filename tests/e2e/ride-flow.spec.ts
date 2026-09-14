import { test, expect, type Page } from '@playwright/test';
import { createRideFixture } from '../support/ride-fixture';

async function chooseTrip(page: Page) {
  await page.getByRole('button', { name: 'EMBARQUE Onde você está?' }).click();
  await page.getByLabel('Endereço em Campo Verde').fill('embarque teste');
  await page.getByRole('button', { name: 'Buscar endereço' }).click();
  await page.getByRole('button', { name: 'Embarque de teste', exact: true }).click();
  await page.getByRole('button', { name: 'DESTINO Para onde você vai?' }).click();
  await page.getByLabel('Endereço em Campo Verde').fill('destino teste');
  await page.getByRole('button', { name: 'Buscar endereço' }).click();
  await page.getByRole('button', { name: 'Destino de teste', exact: true }).click();
  await page.getByRole('button', { name: 'Ver valor da corrida' }).click();
}
function nav(page: Page) { return page.getByRole('navigation', { name: page.viewportSize()!.width <= 700 ? 'Menu do celular' : 'Menu principal', exact: true }); }

test('two accounts complete a trip, recover a lost request response, and persist payment and rating', async ({ browser }, info) => {
  test.setTimeout(100000);
  const fixture = await createRideFixture({ loseFirstRequest: true });
  const options = { ...info.project.use, baseURL: 'http://127.0.0.1:5173' };
  const passengerContext = await browser.newContext(options);
  const driverContext = await browser.newContext(options);
  const passenger = await passengerContext.newPage(); const driver = await driverContext.newPage();
  try {
    await fixture.install(passenger, 'passenger'); await fixture.install(driver, 'driver');
    await driver.getByRole('button', { name: 'Ficar disponível', exact: true }).click();
    await expect(driver.getByRole('heading', { name: 'Você está disponível' })).toBeVisible();
    await chooseTrip(passenger);
    await passenger.getByRole('button', { name: 'Confirmar corrida' }).click();
    await expect(passenger.getByRole('button', { name: 'Confirmar corrida' })).toBeEnabled();
    await passenger.getByRole('button', { name: 'Confirmar corrida' }).click();
    await expect(passenger.getByRole('heading', { name: 'Buscando motociclista' })).toBeVisible();
    expect((await fixture.db.query('select count(*)::int as total from motoja_private.rides')).rows[0].total).toBe(1);
    await expect(driver.getByRole('button', { name: 'Aceitar corrida' })).toBeVisible({ timeout: 15000 });
    await driver.getByRole('button', { name: 'Aceitar corrida' }).click();
    await expect(driver.getByRole('heading', { name: 'Motociclista encontrado' })).toBeVisible();
    await expect(driver.locator('.pin-card')).toHaveCount(0);
    await passenger.reload();
    const pin = await passenger.locator('.pin-card strong').innerText();
    await driver.getByRole('button', { name: 'Estou a caminho' }).click();
    await driver.getByRole('button', { name: 'Cheguei ao embarque' }).click();
    const pinInput = driver.getByLabel('PIN informado pelo passageiro');
    await pinInput.fill(pin === '0000' ? '0001' : '0000');
    await driver.getByLabel('Passageiro e motociclista estão com capacetes afivelados.').check();
    await driver.getByRole('button', { name: 'Iniciar viagem' }).click();
    await expect(driver.getByText(/PIN incorreto/)).toBeVisible();
    await pinInput.fill(pin);
    await driver.getByRole('button', { name: 'Iniciar viagem' }).click();
    await expect(driver.getByRole('heading', { name: 'Você está em viagem' })).toBeVisible();
    await expect(driver.getByRole('button', { name: 'Cancelar corrida', exact: true })).toHaveCount(0);
    await driver.getByRole('button', { name: 'Finalizar no destino' }).click();
    await nav(driver).getByRole('button', { name: 'Viagens', exact: true }).click();
    await driver.getByRole('button', { name: /Destino de teste/ }).click();
    await driver.getByRole('button', { name: 'Já recebi o pagamento' }).click();
    await expect(driver.getByText(/recebimento registrado pelo motociclista/)).toBeVisible();
    await passenger.reload();
    await nav(passenger).getByRole('button', { name: 'Viagens', exact: true }).click();
    await passenger.getByRole('button', { name: /Destino de teste/ }).click();
    await passenger.getByRole('button', { name: '5 estrelas', exact: true }).click();
    await passenger.getByRole('button', { name: 'Enviar avaliação' }).click();
    await expect(passenger.getByText('Avaliação registrada: 5 estrelas.')).toBeVisible();
    const ride = (await fixture.db.query('select status,payment_status,pin_failures from motoja_private.rides')).rows[0];
    expect(ride).toEqual({ status: 'completed', payment_status: 'confirmed', pin_failures: 1 });
    expect(await passenger.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally { await passengerContext.close(); await driverContext.close(); await fixture.close(); }
});

test('provider outage never displays a made-up fare or creates a trip', async ({ page }) => {
  const fixture = await createRideFixture({ mapsUnavailable: true });
  try {
    await fixture.install(page, 'passenger');
    await chooseTrip(page);
    await expect(page.getByText('O serviço de mapas não respondeu. Tente novamente.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar corrida' })).toHaveCount(0);
    expect((await fixture.db.query('select count(*)::int as total from motoja_private.rides')).rows[0].total).toBe(0);
  } finally { await fixture.close(); }
});
