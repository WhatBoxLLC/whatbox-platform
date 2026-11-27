// Payment processors. Each site brings its own merchant account, so credentials are per site:
//   PAYPAL_JSON={"site_afterh":{"clientId":"...","secret":"...","webhookId":"...","env":"sandbox"}}
// Card details never touch WhatBox: members approve on the processor's page, and the tier is set
// only when the processor's signed webhook confirms it.
import { StubGateway, type PaymentGateway, type Site, type SubscriptionStatus, type WebhookUpdate } from '@whatbox/core';
import { config } from './config';

interface PayPalCreds { clientId: string; secret: string; webhookId: string; env?: 'sandbox' | 'live' }

const PAYPAL_STATUS: Record<string, SubscriptionStatus> = {
  'BILLING.SUBSCRIPTION.ACTIVATED': 'active',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED': 'active',
  'PAYMENT.SALE.COMPLETED': 'active', // renewal
  'BILLING.SUBSCRIPTION.SUSPENDED': 'past_due',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'past_due',
  'BILLING.SUBSCRIPTION.CANCELLED': 'cancelled',
  'BILLING.SUBSCRIPTION.EXPIRED': 'expired',
};

export class PayPalGateway implements PaymentGateway {
  readonly provider = 'paypal' as const;
  private tokens = new Map<string, { token: string; exp: number }>();
  constructor(private creds: Record<string, PayPalCreds>, private fetchFn: typeof fetch = fetch) {}

  private cfg(site: Site) {
    const c = this.creds[site.id];
    if (!c) throw new Error(`PayPal is not configured for ${site.id}`);
    return { ...c, base: c.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' };
  }

  private async token(site: Site) {
    const c = this.cfg(site);
    const hit = this.tokens.get(site.id);
    if (hit && hit.exp > Date.now() + 60_000) return hit.token;
    const res = await this.fetchFn(c.base + '/v1/oauth2/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${c.clientId}:${c.secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error('PayPal auth failed: ' + res.status);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.tokens.set(site.id, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
    return j.access_token;
  }

  private async call(site: Site, method: string, path: string, body?: unknown) {
    const res = await this.fetchFn(this.cfg(site).base + path, {
      method,
      headers: { Authorization: 'Bearer ' + (await this.token(site)), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PayPal ${method} ${path} failed: ${res.status}`);
    return res.status === 204 ? {} : res.json();
  }

  async startCheckout(site: Site, a: { subscriptionId: string; planId?: string; returnUrl: string; cancelUrl: string }) {
    const j = (await this.call(site, 'POST', '/v1/billing/subscriptions', {
      plan_id: a.planId,
      custom_id: a.subscriptionId,
      application_context: {
        // The statement and checkout page show the neutral descriptor, never the site's purpose.
        brand_name: site.settings.billingDescriptor.slice(0, 127),
        shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
        return_url: a.returnUrl, cancel_url: a.cancelUrl,
      },
    })) as { id: string; links: { rel: string; href: string }[] };
    const approve = j.links.find((l) => l.rel === 'approve')?.href;
    if (!approve) throw new Error('PayPal returned no approval link');
    return { checkoutUrl: approve, providerRef: j.id };
  }

  async cancel(site: Site, ref: string) {
    await this.call(site, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(ref)}/cancel`, { reason: 'Cancelled by member' });
  }

  async parseWebhook(site: Site, h: Record<string, string | undefined>, body: unknown): Promise<WebhookUpdate | null> {
    const c = this.cfg(site);
    // Ask PayPal to confirm the signature. Anything it does not confirm is dropped.
    const v = (await this.call(site, 'POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: h['paypal-auth-algo'], cert_url: h['paypal-cert-url'], transmission_id: h['paypal-transmission-id'],
      transmission_sig: h['paypal-transmission-sig'], transmission_time: h['paypal-transmission-time'],
      webhook_id: c.webhookId, webhook_event: body,
    })) as { verification_status?: string };
    if (v.verification_status !== 'SUCCESS') return null;
    const ev = body as { id?: string; event_type?: string; resource?: any };
    const status = ev.event_type ? PAYPAL_STATUS[ev.event_type] : undefined;
    if (!status || !ev.resource) return null;
    const r = ev.resource;
    const sale = ev.event_type === 'PAYMENT.SALE.COMPLETED';
    const providerRef: string | undefined = sale ? r.billing_agreement_id : r.id;
    if (!providerRef) return null;
    return {
      providerRef, status, eventId: ev.id,
      customId: sale ? undefined : r.custom_id,
      currentPeriodEnd: r.billing_info?.next_billing_time,
    };
  }
}

export function createPaymentGateways(): Partial<Record<string, PaymentGateway>> {
  const out: Partial<Record<string, PaymentGateway>> = {};
  if (config.paypalJson) out.paypal = new PayPalGateway(JSON.parse(config.paypalJson));
  if (config.paymentsStub) {
    if (process.env.NODE_ENV === 'production') throw new Error('PAYMENTS_STUB cannot be used in production.');
    out.stub = new StubGateway(config.publicApiUrl + '/dev/checkout');
  }
  return out;
}

// Only send members back to the site's own domains (or the configured app origins in dev).
export function safeReturnUrl(site: Site, url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (u.protocol === 'https:' && site.domains.some((d) => d.replace(/^www\./, '') === host)) return u.toString();
    if (config.corsOrigins.includes(u.origin)) return u.toString();
    // The native apps return through their own scheme, e.g. afterh://membership
    if (u.protocol === `${site.slug}:` || u.protocol === 'whatbox:') return u.toString();
  } catch { /* fall through */ }
  return null;
}
