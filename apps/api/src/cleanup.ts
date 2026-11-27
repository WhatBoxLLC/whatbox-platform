// Housekeeping: expired sessions and codes, old rate-limit windows, lapsed memberships.
// Every instance schedules it; a Postgres advisory lock lets only one run at a time.
import type { Platform } from '@whatbox/core';
import { config } from './config';
import { pool } from './db-pool';

const LOCK_ID = 7_314_001;

export async function runCleanupOnce(platform: Platform) {
  const c = await pool(config.controlDb).connect();
  try {
    const got = (await c.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID])).rows[0].ok as boolean;
    if (!got) return { skipped: true };
    try { return await platform.cleanup(); } finally { await c.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); }
  } finally { c.release(); }
}

export function startCleanup(platform: Platform, minutes: number) {
  const tick = () => runCleanupOnce(platform).catch((e) => console.error('[cleanup] failed', (e as Error).message));
  setTimeout(tick, 30_000).unref();
  setInterval(tick, minutes * 60_000).unref();
}
