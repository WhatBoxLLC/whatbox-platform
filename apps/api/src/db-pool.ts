import { Pool } from 'pg';
import { config, dbUrl } from './config';

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
