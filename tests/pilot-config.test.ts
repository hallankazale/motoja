import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPilotConfig } from '../scripts/lib/pilot-config.mjs';
const base = { project_ref: 'pgdpjhjnzcohdixqpbsx', site_url: 'https://motoja-gilt.vercel.app' };
test('configuration preserves existing auth redirects and does not alter operation or roles', () => {
  const plan = buildPilotConfig(base, { uri_allow_list: 'https://existing.example.test', mailer_autoconfirm: true });
  assert.ok(plan.auth.uri_allow_list.includes('https://existing.example.test'));
  assert.equal(plan.auth.mailer_autoconfirm, undefined);
  assert.equal(plan.review.email_confirmation, 'pendente: configure SMTP');
  assert.equal(plan.auth.role, undefined); assert.equal(plan.auth.mode, undefined);
});
test('SMTP configuration enables confirmation and review never contains provider or email passwords', () => {
  const plan = buildPilotConfig({ ...base, geoapify_api_key: 'test-key-with-more-than-twenty-characters', smtp: { host: 'smtp.example.test', port: 587, user: 'account', password: 'synthetic-smtp-password', from: 'app@example.test' } });
  assert.equal(plan.auth.mailer_autoconfirm, false);
  assert.equal(plan.secrets[0].value, 'geoapify');
  const review = JSON.stringify(plan.review);
  assert.equal(review.includes('synthetic-smtp-password'), false); assert.equal(review.includes('test-key'), false);
});
test('configuration rejects insecure origins and incomplete SMTP without changing the account', () => {
  assert.throws(() => buildPilotConfig({ ...base, site_url: 'http://localhost' }));
  assert.throws(() => buildPilotConfig({ ...base, site_url: 'https://user:secret@example.test' }));
  assert.throws(() => buildPilotConfig({ ...base, smtp: { host: 'smtp.example.test' } }));
});
