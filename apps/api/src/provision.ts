// Creates a site's own database and applies the schema. Used by `npm run migrate` and when a
// platform admin adds a site. The API's database role needs CREATEDB for the second case.
import type { Site, SiteProvisioner } from '@whatbox/core';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { config, dbUrl } from './config';
import { siteDbName } from './pg-repo';

const sqlDir = path.join(__dirname, '..', 'sql');
const ssl = () => (config.pgSsl ? { rejectUnauthorized: true } : undefined);

export async function ensureDb(name: string) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Bad database name ' + name);
  const admin = new Client({ connectionString: dbUrl('postgres'), ssl: ssl() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
    if (!exists.rowCount) { await admin.query(`CREATE DATABASE "${name}"`); console.log('created database', name); }
  } finally { await admin.end(); }
}

export async function applySql(name: string, file: 'control.sql' | 'site.sql') {
  const c = new Client({ connectionString: dbUrl(name), ssl: ssl() });
  await c.connect();
  try { await c.query(fs.readFileSync(path.join(sqlDir, file), 'utf8')); } finally { await c.end(); }
  console.log('applied', file, 'to', name);
}

export class PgSiteProvisioner implements SiteProvisioner {
  async provision(site: Site) {
    const db = siteDbName(site.slug);
    await ensureDb(db);
    await applySql(db, 'site.sql');
  }
}
