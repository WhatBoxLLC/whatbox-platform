// Dev and test only: a pretend processor. Checkout "succeeds" when the dev page (or a test)
// posts {ref, status} to the stub webhook. The API refuses to load this in production.
import type { PaymentGateway, WebhookUpdate } from './repo';
import type { Site, SubscriptionStatus } from './types';
import { randomId } from './crypto';

export class StubGateway implements PaymentGateway {
  readonly provider = 'stub' as const;
  cancelled: string[] = [];
  constructor(private checkoutBase = '/dev/checkout') {}
  async startCheckout(site: Site, a: { subscriptionId: string; tier: 'paid' | 'vip'; returnUrl: string }) {
    const providerRef = randomId('stub_');
    const q = new URLSearchParams({ site: site.slug, ref: providerRef, sub: a.subscriptionId, tier: a.tier, return: a.returnUrl });
    return { checkoutUrl: `${this.checkoutBase}?${q}`, providerRef };
  }
  async cancel(_site: Site, ref: string) { this.cancelled.push(ref); }
  async parseWebhook(_site: Site, _h: Record<string, string | undefined>, body: unknown): Promise<WebhookUpdate | null> {
    const b = body as { ref?: string; status?: SubscriptionStatus; periodEnd?: string; sub?: string };
    if (!b?.ref || !b.status) return null;
    return { providerRef: b.ref, status: b.status, currentPeriodEnd: b.periodEnd, customId: b.sub };
  }
}
