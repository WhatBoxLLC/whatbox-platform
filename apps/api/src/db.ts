import { DevKeyProvider, type KeyProvider, Platform, type Notifier } from '@whatbox/core';
import { Pool } from 'pg';
import { config, dbUrl } from './config';
import { PgControlRepo, PgSiteRepo, siteDbName } from './pg-repo';
import { createPhotoStore } from './photos';

const pools = new Map<string, Pool>();
export function pool(dbName: string): Pool {
  let p = pools.get(dbName);
  if (!p) {
    p = new Pool({ connectionString: dbUrl(dbName), max: 10, ssl: config.pgSsl ? { rejectUnauthorized: true } : undefined });
    pools.set(dbName, p);
  }
  return p;
}

export async function closePools() {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}

class StaticKeyProvider implements KeyProvider {
  constructor(private keys: Record<string, string>) {}
  async siteKey(siteId: string) {
    const hex = this.keys[siteId];
    if (!hex || hex.length !== 64) throw new Error(`No encryption key configured for ${siteId}`);
    return new Uint8Array(hex.match(/../g)!.map((x) => parseInt(x, 16)));
  }
}

export function keyProvider(): KeyProvider {
  if (config.siteKeysJson) return new StaticKeyProvider(JSON.parse(config.siteKeysJson));
  if (!config.devMasterKey) throw new Error('Set SITE_KEYS_JSON (production) or DEV_MASTER_KEY (local dev).');
  return new DevKeyProvider(config.devMasterKey);
}

const consoleNotifier: Notifier = {
  async sendCode({ site, channel, target, code }) {
    // Stub: in Azure this goes through Azure Communication Services (email + SMS).
    const masked = channel === 'email' ? target.replace(/^(.).*@/, '$1•••@') : '•••' + target.slice(-2);
    console.log(`[notify] ${site.slug} ${channel} ${masked} code=${config.exposeDevCodes ? code : '(hidden)'}`);
  },
};

export function createPlatform() {
  const control = new PgControlRepo(pool(config.controlDb));
  const siteRepos = new Map<string, PgSiteRepo>();
  const photos = createPhotoStore();
  const platform = new Platform({
    control,
    async siteRepo(siteId) {
      let r = siteRepos.get(siteId);
      if (!r) {
        const site = await control.getSite(siteId);
        if (!site) throw new Error('Unknown site ' + siteId);
        r = new PgSiteRepo(pool(siteDbName(site.slug)));
        siteRepos.set(siteId, r);
      }
      return r;
    },
    keys: keyProvider(),
    notifier: consoleNotifier,
    photos,
    exposeDevCodes: config.exposeDevCodes,
  });
  return { platform, control, photos };
}
