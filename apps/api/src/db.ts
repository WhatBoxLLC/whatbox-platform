import { DevKeyProvider, type KeyProvider, Platform } from '@whatbox/core';
import { Pool } from 'pg';
import { config, dbUrl } from './config';
import { PgControlRepo, PgSiteRepo, siteDbName } from './pg-repo';
import { createPhotoStore } from './photos';
import { createNotifier } from './notify';
import { createIdTokenVerifier } from './idp';

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
    notifier: createNotifier(),
    photos,
    idTokens: createIdTokenVerifier(),
    exposeDevCodes: config.exposeDevCodes,
    rateLimitScale: config.rateLimitScale,
  });
  return { platform, control, photos };
}
