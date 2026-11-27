import { DevKeyProvider, type KeyProvider, Platform } from '@whatbox/core';
import { pool } from './db-pool';
import { ExpoPushSender, PgEventBus } from './events';
import { WorldGeo } from './geo';
import { config } from './config';
import { PgControlRepo, PgSiteRepo, siteDbName } from './pg-repo';
import { createPhotoStore } from './photos';
import { createNotifier } from './notify';
import { createIdTokenVerifier } from './idp';
import { createPaymentGateways } from './payments';
import { PgSiteProvisioner } from './provision';
import { createAiClients } from './ai-client';

export { pool, closePools } from './db-pool';

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
  const siteRepo = async (siteId: string) => {
    let r = siteRepos.get(siteId);
    if (!r) {
      const site = await control.getSite(siteId);
      if (!site) throw new Error('Unknown site ' + siteId);
      r = new PgSiteRepo(pool(siteDbName(site.slug)));
      siteRepos.set(siteId, r);
    }
    return r;
  };
  const events = new PgEventBus(siteRepo, config.push === 'expo' ? new ExpoPushSender() : undefined);
  const platform = new Platform({
    control,
    siteRepo,
    keys: keyProvider(),
    notifier: createNotifier(),
    photos,
    ...createAiClients(),
    idTokens: createIdTokenVerifier(),
    events,
    exposeDevCodes: config.exposeDevCodes,
    rateLimitScale: config.rateLimitScale,
    payments: createPaymentGateways(),
    provisioner: new PgSiteProvisioner(),
    allowSelfServeTier: config.allowSelfServeTier && process.env.NODE_ENV !== 'production',
    geo: new WorldGeo(),
  });
  return { platform, control, photos, events };
}
