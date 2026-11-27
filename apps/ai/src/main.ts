import { createServer } from 'node:http';
import { config } from './config';
import { AzureEngines, StubEngines } from './engines';
import { createHandler } from './server';
import { hashKey, hintOf, migrate, PgStore } from './store';

async function main() {
  const pool = await migrate(config.pgServer, config.db, config.pgSsl);
  const store = new PgStore(pool);
  if (config.engine === 'azure' && !(config.contentSafetyKey && config.visionKey)) throw new Error('AI_ENGINE=azure needs CONTENT_SAFETY_* and VISION_* settings.');
  const engines = config.engine === 'azure'
    ? new AzureEngines({ endpoint: config.contentSafetyEndpoint, key: config.contentSafetyKey }, { endpoint: config.visionEndpoint, key: config.visionKey })
    : new StubEngines();

  // The dating platform's key comes from Key Vault, so it is (re)registered on every start.
  if (config.platformKey.startsWith('wbai_')) {
    const cur = await store.getCaller('whatbox-dating');
    await store.saveCaller({
      id: 'whatbox-dating', name: 'WhatBox dating sites', keyHint: hintOf(config.platformKey),
      billable: false, rateCents: 0, perMinute: cur?.perMinute ?? 600, enabled: cur?.enabled ?? true,
      createdAt: cur?.createdAt ?? new Date().toISOString(),
    }, hashKey(config.platformKey));
  }

  createServer(createHandler({ store, engines, adminKey: config.adminKey })).listen(config.port, () => {
    console.log(`WhatBox AI listening on :${config.port} (engine: ${engines.name})`);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
