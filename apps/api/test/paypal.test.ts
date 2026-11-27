// PayPal gateway against a fake PayPal: request shapes, signature check, event mapping.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedSites } from '@whatbox/core';
import { PayPalGateway } from '../src/payments';

const site = seedSites(new Date())[0];
function fakePayPal(verify = 'SUCCESS') {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = init.body && String(init.body).startsWith('{') ? JSON.parse(String(init.body)) : init.body;
    calls.push({ url, body });
    const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 'tok', expires_in: 3600 });
    if (url.endsWith('/v1/billing/subscriptions')) return json({ id: 'I-123', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approve?ba=1' }] });
    if (url.includes('/cancel')) return new Response(null, { status: 204 });
    if (url.endsWith('/verify-webhook-signature')) return json({ verification_status: verify });
    return new Response('no', { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}
const creds = { [site.id]: { clientId: 'c', secret: 's', webhookId: 'WH-1', env: 'sandbox' as const } };

test('checkout creates a subscription with our id and the neutral descriptor', async () => {
  const { f, calls } = fakePayPal();
  const g = new PayPalGateway(creds, f);
  const r = await g.startCheckout(site, { subscriptionId: 'sub_1', planId: 'P-9', returnUrl: 'https://afterh.com/ok', cancelUrl: 'https://afterh.com/no' });
  assert.equal(r.providerRef, 'I-123');
  const create = calls.find((c) => c.url.endsWith('/v1/billing/subscriptions'))!;
  assert.equal(create.body.plan_id, 'P-9');
  assert.equal(create.body.custom_id, 'sub_1');
  assert.equal(create.body.application_context.brand_name, site.settings.billingDescriptor);
  assert.ok(create.url.startsWith('https://api-m.sandbox.paypal.com'));
});

test('webhooks are applied only when PayPal confirms the signature', async () => {
  const ev = { id: 'WH-EV-1', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-123', custom_id: 'sub_1', billing_info: { next_billing_time: '2027-01-01T00:00:00Z' } } };
  const ok = await new PayPalGateway(creds, fakePayPal().f).parseWebhook(site, {}, ev);
  assert.deepEqual(ok, { providerRef: 'I-123', status: 'active', eventId: 'WH-EV-1', customId: 'sub_1', currentPeriodEnd: '2027-01-01T00:00:00Z' });
  assert.equal(await new PayPalGateway(creds, fakePayPal('FAILURE').f).parseWebhook(site, {}, ev), null);
  const renewal = await new PayPalGateway(creds, fakePayPal().f).parseWebhook(site, {}, { id: 'e2', event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-1', billing_agreement_id: 'I-123' } });
  assert.equal(renewal?.providerRef, 'I-123');
  assert.equal(await new PayPalGateway(creds, fakePayPal().f).parseWebhook(site, {}, { id: 'e3', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: {} }), null);
});

test('a site without PayPal credentials cannot check out', async () => {
  const g = new PayPalGateway({}, fakePayPal().f);
  await assert.rejects(g.startCheckout(site, { subscriptionId: 's', planId: 'p', returnUrl: 'r', cancelUrl: 'c' }), /not configured/);
});
