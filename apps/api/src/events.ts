// Real-time delivery across API instances.
// emit() → NOTIFY on the site's own database → every instance LISTENing on that database hands the
// event to its open streams. Push notifications go out once, from the instance that emitted.
import { LocalEventHub, type EventSink, type MemberEvent, type Site, type SiteRepo } from '@whatbox/core';
import { Client } from 'pg';
import { config, dbUrl } from './config';
import { pool } from './db-pool';
import { siteDbName } from './pg-repo';

const CHANNEL = 'member_events';

export interface PushSender {
  send(site: Site, tokens: string[], title: string, body: string): Promise<string[]>; // returns dead tokens
}

// Expo's push service fronts both APNs and FCM. Text is generic on purpose: a lock screen
// should never reveal what kind of site this is or who wrote.
export class ExpoPushSender implements PushSender {
  async send(_site: Site, tokens: string[], title: string, body: string) {
    if (!tokens.length) return [];
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(config.expoAccessToken ? { Authorization: 'Bearer ' + config.expoAccessToken } : {}) },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, sound: 'default', priority: 'high' }))),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    return (json.data ?? []).flatMap((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? [tokens[i]] : []));
  }
}

function pushText(site: Site, ev: MemberEvent): { title: string; body: string } | null {
  const title = site.settings.mode === 'sensitive' ? 'New activity' : site.name;
  switch (ev.type) {
    case 'message': return { title, body: 'You have a new message.' };
    case 'match': return { title, body: "It's mutual. Say hello!" };
    case 'access': return ev.status === 'granted' ? { title, body: 'Someone shared private photos with you.' } : { title, body: 'You have a new photo request.' };
    default: return null; // likes: shown in the app, no push (busy inboxes would never stop buzzing)
  }
}

export class PgEventBus implements EventSink {
  readonly hub = new LocalEventHub();
  private listeners = new Map<string, Promise<Client>>();

  constructor(private siteRepo: (siteId: string) => Promise<SiteRepo>, private push?: PushSender) {}

  emit(site: Site, memberId: string, ev: MemberEvent) {
    const payload = JSON.stringify({ s: site.id, m: memberId, e: ev });
    pool(siteDbName(site.slug)).query('SELECT pg_notify($1, $2)', [CHANNEL, payload]).catch((e) => console.error('[events] notify failed', e.message));
    void this.sendPush(site, memberId, ev);
  }

  private async sendPush(site: Site, memberId: string, ev: MemberEvent) {
    const text = pushText(site, ev);
    if (!text || !this.push) return;
    try {
      const repo = await this.siteRepo(site.id);
      const tokens = (await repo.listPushTokens(memberId)).filter((t) => t.platform !== 'web').map((t) => t.token);
      const dead = await this.push.send(site, tokens, text.title, text.body);
      for (const t of dead) await repo.deletePushToken(t);
    } catch (e) {
      console.error('[events] push failed', (e as Error).message);
    }
  }

  // Start listening on a site's database the first time someone on that site opens a stream.
  async ensureListening(site: Site) {
    if (this.listeners.has(site.id)) return;
    const p = (async () => {
      const c = new Client({ connectionString: dbUrl(siteDbName(site.slug)), ssl: config.pgSsl ? { rejectUnauthorized: true } : undefined });
      c.on('notification', (n) => {
        if (n.channel !== CHANNEL || !n.payload) return;
        try {
          const { s, m, e } = JSON.parse(n.payload) as { s: string; m: string; e: MemberEvent };
          this.hub.deliver(s, m, e);
        } catch { /* ignore */ }
      });
      c.on('error', () => {
        // Connection lost: forget it so the next stream reconnects.
        this.listeners.delete(site.id);
        c.end().catch(() => {});
      });
      await c.connect();
      await c.query(`LISTEN ${CHANNEL}`);
      return c;
    })();
    this.listeners.set(site.id, p);
    try { await p; } catch (e) { this.listeners.delete(site.id); throw e; }
  }

  async close() {
    for (const p of this.listeners.values()) (await p.catch(() => null))?.end().catch(() => {});
    this.listeners.clear();
  }
}
