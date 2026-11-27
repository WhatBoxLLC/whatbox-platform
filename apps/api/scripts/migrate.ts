// Creates the control database and one database per site, then applies the schemas.
// Safe to re-run. Covers the seed sites plus any site a platform admin has added.
import { seedSites } from '@whatbox/core';
import { Client } from 'pg';
import { config, dbUrl } from '../src/config';
import { siteDbName } from '../src/pg-repo';
import { applySql, ensureDb } from '../src/provision';

(async () => {
  await ensureDb(config.controlDb);
  await applySql(config.controlDb, 'control.sql');
  const c = new Client({ connectionString: dbUrl(config.controlDb), ssl: config.pgSsl ? { rejectUnauthorized: true } : undefined });
  await c.connect();
  const added = (await c.query('SELECT slug FROM sites')).rows.map((r) => r.slug as string);
  await c.end();
  const slugs = [...new Set([...seedSites(new Date()).map((s) => s.slug), ...added])];
  for (const slug of slugs) {
    const db = siteDbName(slug);
    await ensureDb(db);
    await applySql(db, 'site.sql');
  }
})().catch((e) => { console.error(e); process.exit(1); });
