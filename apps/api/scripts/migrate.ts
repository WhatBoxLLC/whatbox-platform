// Creates the control database and one database per site, then applies the schemas.
// Safe to re-run. Site list comes from the seed definitions for the prototype.
import { seedSites } from '@whatbox/core';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { config, dbUrl } from '../src/config';
import { siteDbName } from '../src/pg-repo';

const sqlDir = path.join(__dirname, '..', 'sql');

async function ensureDb(name: string) {
  const admin = new Client({ connectionString: dbUrl('postgres') });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (!exists.rowCount) { await admin.query(`CREATE DATABASE "${name}"`); console.log('created database', name); }
  await admin.end();
}

async function apply(name: string, file: string) {
  const c = new Client({ connectionString: dbUrl(name) });
  await c.connect();
  await c.query(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
  await c.end();
  console.log('applied', file, 'to', name);
}

(async () => {
  await ensureDb(config.controlDb);
  await apply(config.controlDb, 'control.sql');
  for (const site of seedSites(new Date())) {
    const db = siteDbName(site.slug);
    await ensureDb(db);
    await apply(db, 'site.sql');
  }
})().catch((e) => { console.error(e); process.exit(1); });
