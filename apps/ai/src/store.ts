import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Pool } from 'pg';
import type { Caller, Store, UsageCounts, UsageRow } from './types';

export function newKey(): string { return 'wbai_' + randomBytes(24).toString('base64url'); }
export function hashKey(key: string): string { return createHash('sha256').update(key).digest('hex'); }
export const hintOf = (key: string) => key.slice(-4);

export class MemoryStore implements Store {
  callers = new Map<string, { c: Caller; hash: string }>();
  rows = new Map<string, UsageRow & { day: string }>();
  async callerByKeyHash(hash: string) { return [...this.callers.values()].find((x) => x.hash === hash)?.c ?? null; }
  async getCaller(id: string) { return this.callers.get(id)?.c ?? null; }
  async listCallers() { return [...this.callers.values()].map((x) => x.c).sort((a, b) => a.name.localeCompare(b.name)); }
  async saveCaller(c: Caller, keyHash?: string) {
    const cur = this.callers.get(c.id);
    const hash = keyHash ?? cur?.hash;
    if (!hash) throw new Error('New callers need a key');
    this.callers.set(c.id, { c: { ...c }, hash });
  }
  async addUsage(callerId: string, account: string, day: string, n: UsageCounts) {
    const k = `${callerId}|${account}|${day}`;
    const r = this.rows.get(k) ?? { callerId, account, day, checks: 0, flaggedAdult: 0, flaggedContact: 0 };
    r.checks += n.checks; r.flaggedAdult += n.flaggedAdult; r.flaggedContact += n.flaggedContact;
    this.rows.set(k, r);
  }
  async usage(since: string, until: string) {
    const out = new Map<string, UsageRow>();
    for (const r of this.rows.values()) {
      if (r.day < since || r.day >= until) continue;
      const k = r.callerId + '|' + r.account;
      const o = out.get(k) ?? { callerId: r.callerId, account: r.account, checks: 0, flaggedAdult: 0, flaggedContact: 0 };
      o.checks += r.checks; o.flaggedAdult += r.flaggedAdult; o.flaggedContact += r.flaggedContact;
      out.set(k, o);
    }
    return [...out.values()];
  }
}

const toCaller = (r: Record<string, unknown>): Caller => ({
  id: r.id as string, name: r.name as string, keyHint: r.key_hint as string, billable: r.billable as boolean,
  rateCents: Number(r.rate_cents), perMinute: r.per_minute as number, enabled: r.enabled as boolean,
  createdAt: new Date(r.created_at as string).toISOString(),
});

export class PgStore implements Store {
  constructor(private db: Pool) {}
  async callerByKeyHash(hash: string) { const r = (await this.db.query('SELECT * FROM callers WHERE key_hash=$1', [hash])).rows[0]; return r ? toCaller(r) : null; }
  async getCaller(id: string) { const r = (await this.db.query('SELECT * FROM callers WHERE id=$1', [id])).rows[0]; return r ? toCaller(r) : null; }
  async listCallers() { return (await this.db.query('SELECT * FROM callers ORDER BY name')).rows.map(toCaller); }
  async saveCaller(c: Caller, keyHash?: string) {
    if (keyHash) {
      await this.db.query(
        `INSERT INTO callers (id, name, key_hash, key_hint, billable, rate_cents, per_minute, enabled, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET name=$2, key_hash=$3, key_hint=$4, billable=$5, rate_cents=$6, per_minute=$7, enabled=$8`,
        [c.id, c.name, keyHash, c.keyHint, c.billable, c.rateCents, c.perMinute, c.enabled, c.createdAt]);
    } else {
      await this.db.query('UPDATE callers SET name=$2, billable=$3, rate_cents=$4, per_minute=$5, enabled=$6 WHERE id=$1',
        [c.id, c.name, c.billable, c.rateCents, c.perMinute, c.enabled]);
    }
  }
  async addUsage(callerId: string, account: string, day: string, n: UsageCounts) {
    await this.db.query(
      `INSERT INTO usage_daily (caller_id, account, day, checks, flagged_adult, flagged_contact) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (caller_id, account, day) DO UPDATE SET checks=usage_daily.checks+$4,
         flagged_adult=usage_daily.flagged_adult+$5, flagged_contact=usage_daily.flagged_contact+$6`,
      [callerId, account, day, n.checks, n.flaggedAdult, n.flaggedContact]);
  }
  async usage(since: string, until: string) {
    const r = await this.db.query(
      `SELECT caller_id, account, sum(checks)::int AS checks, sum(flagged_adult)::int AS fa, sum(flagged_contact)::int AS fc
       FROM usage_daily WHERE day >= $1 AND day < $2 GROUP BY caller_id, account`, [since, until]);
    return r.rows.map((x) => ({ callerId: x.caller_id, account: x.account, checks: x.checks, flaggedAdult: x.fa, flaggedContact: x.fc }));
  }
}

// Creates the database on first start and applies the schema. Safe to run every start.
export async function migrate(serverUrl: string, dbName: string, ssl: boolean) {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error('Bad database name');
  const url = (db: string) => { const u = new URL(serverUrl); u.pathname = '/' + db; return u.toString(); };
  const opts = ssl ? { rejectUnauthorized: true } : undefined;
  const admin = new Client({ connectionString: url('postgres'), ssl: opts });
  await admin.connect();
  try {
    if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally { await admin.end(); }
  const pool = new Pool({ connectionString: url(dbName), max: 10, ssl: opts });
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'ai.sql'), 'utf8'));
  return pool;
}
