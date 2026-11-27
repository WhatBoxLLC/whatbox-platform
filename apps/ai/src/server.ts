// WhatBox AI HTTP API. Plain node:http, no framework: a handful of routes.
//
//   POST /v1/photos/check            caller key   photo in the body -> rating + contact info found
//   GET  /v1/usage?month=YYYY-MM     caller key   the caller's own counts for the month
//   GET  /v1/admin/callers?month=    admin key    every caller, usage and bill estimate
//   POST /v1/admin/callers           admin key    add a caller; returns its key once
//   PATCH /v1/admin/callers/:id      admin key    rename, enable/disable, billable, rate
//   POST /v1/admin/callers/:id/key   admin key    replace a caller's key; returns it once
//   GET  /healthz
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { checkPhoto, CheckError, MAX_BYTES } from './check';
import { hashKey, hintOf, newKey } from './store';
import type { Caller, Engines, Store, UsageRow } from './types';

export interface Deps {
  store: Store;
  engines: Engines;
  adminKey: string; // empty turns the admin routes off
  now?: () => Date;
  log?: (line: string) => void;
}

class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] ?? 0);
    if (len > limit) { reject(new HttpError(413, 'too_big', 'Photos can be up to 10 MB.')); req.resume(); return; }
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > limit) { reject(new HttpError(413, 'too_big', 'Photos can be up to 10 MB.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const bearer = (req: IncomingMessage) => {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : String(req.headers['x-api-key'] ?? '').trim();
};

function monthRange(q: string | null, now: Date) {
  const m = q && /^\d{4}-(0[1-9]|1[0-2])$/.test(q) ? q : now.toISOString().slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  return { month: m, since: m + '-01', until: new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10) };
}

export const estimateCents = (c: Caller, checks: number) => (c.billable ? Math.round(c.rateCents * checks * 100) / 100 : 0);

function summarize(c: Caller, rows: UsageRow[]) {
  const mine = rows.filter((r) => r.callerId === c.id);
  const sum = (k: 'checks' | 'flaggedAdult' | 'flaggedContact') => mine.reduce((a, r) => a + r[k], 0);
  const checks = sum('checks');
  return {
    ...c, checks, flaggedAdult: sum('flaggedAdult'), flaggedContact: sum('flaggedContact'), estimateCents: estimateCents(c, checks),
    accounts: mine.filter((r) => r.account).map(({ callerId: _c, ...r }) => r).sort((a, b) => a.account.localeCompare(b.account)),
  };
}

export function createHandler(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((l: string) => console.log(l));
  const burst = new Map<string, { win: number; n: number }>();

  const caller = async (req: IncomingMessage): Promise<Caller> => {
    const key = bearer(req);
    if (!key.startsWith('wbai_')) throw new HttpError(401, 'no_key', 'Send your WhatBox AI key as "Authorization: Bearer <key>".');
    const c = await deps.store.callerByKeyHash(hashKey(key));
    if (!c) throw new HttpError(401, 'bad_key', 'That WhatBox AI key is not valid.');
    if (!c.enabled) throw new HttpError(403, 'disabled', 'This WhatBox AI key is turned off. Contact WhatBox.');
    return c;
  };
  const requireAdmin = (req: IncomingMessage) => {
    const got = Buffer.from(bearer(req));
    const want = Buffer.from(deps.adminKey);
    if (!deps.adminKey || got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'not_admin', 'Admin key required.');
  };
  const limit = (c: Caller) => {
    const win = Math.floor(now().getTime() / 60_000);
    const b = burst.get(c.id);
    if (!b || b.win !== win) { burst.set(c.id, { win, n: 1 }); return; }
    if (++b.n > c.perMinute) throw new HttpError(429, 'slow_down', `Up to ${c.perMinute} photos a minute. Try again shortly.`);
  };

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const m = req.method ?? 'GET';

    if (p === '/healthz') return send(res, 200, { ok: true, engine: deps.engines.name });

    if (p === '/v1/photos/check' && m === 'POST') {
      const c = await caller(req);
      limit(c);
      const account = (url.searchParams.get('account') ?? '').slice(0, 64);
      if (account && !/^[A-Za-z0-9_.-]+$/.test(account)) throw new HttpError(400, 'bad_account', 'account may use letters, digits, dot, dash and underscore.');
      const checks = (url.searchParams.get('checks') ?? 'adult,contact').split(',');
      const want = { adult: checks.includes('adult'), contact: checks.includes('contact') };
      if (!want.adult && !want.contact) throw new HttpError(400, 'bad_checks', 'checks must include adult, contact or both.');
      let body = await readBody(req, Math.ceil(MAX_BYTES * 1.4));
      if ((req.headers['content-type'] ?? '').startsWith('application/json')) {
        try { body = Buffer.from(String(JSON.parse(body.toString('utf8')).imageBase64 ?? ''), 'base64'); } catch { throw new HttpError(400, 'bad_json', 'Send {"imageBase64": "..."} or the raw image bytes.'); }
      }
      const result = await checkPhoto(body, deps.engines, want);
      await deps.store.addUsage(c.id, account, now().toISOString().slice(0, 10), {
        checks: 1, flaggedAdult: result.rating === 'safe' ? 0 : 1, flaggedContact: result.contact.found ? 1 : 0,
      });
      // Counts only: no image, no text read from it.
      log(`check ${result.id} caller=${c.id} account=${account || '-'} rating=${result.rating} contact=${result.contact.kinds.join('+') || 'none'} ${result.ms}ms`);
      return send(res, 200, result);
    }

    if (p === '/v1/usage' && m === 'GET') {
      const c = await caller(req);
      const r = monthRange(url.searchParams.get('month'), now());
      const s = summarize(c, await deps.store.usage(r.since, r.until));
      return send(res, 200, { month: r.month, name: c.name, billable: c.billable, rateCents: c.rateCents, checks: s.checks, flaggedAdult: s.flaggedAdult, flaggedContact: s.flaggedContact, estimateCents: s.estimateCents, accounts: s.accounts });
    }

    if (p === '/v1/admin/callers' && m === 'GET') {
      requireAdmin(req);
      const r = monthRange(url.searchParams.get('month'), now());
      const rows = await deps.store.usage(r.since, r.until);
      const callers = (await deps.store.listCallers()).map((c) => summarize(c, rows));
      return send(res, 200, {
        month: r.month, callers,
        totalChecks: callers.reduce((a, c) => a + c.checks, 0),
        totalCents: Math.round(callers.reduce((a, c) => a + c.estimateCents, 0) * 100) / 100,
      });
    }

    if (p === '/v1/admin/callers' && m === 'POST') {
      requireAdmin(req);
      const b = parse(await readBody(req, 64 * 1024));
      const name = String(b.name ?? '').trim().slice(0, 80);
      if (!name) throw new HttpError(400, 'bad_name', 'Give the app or site a name.');
      const id = (String(b.id ?? '').trim() || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      if (!id) throw new HttpError(400, 'bad_id', 'Pick a short id of letters and digits.');
      if (await deps.store.getCaller(id)) throw new HttpError(409, 'taken', `There is already a caller called ${id}.`);
      const key = newKey();
      const c: Caller = {
        id, name, keyHint: hintOf(key), billable: b.billable !== false, rateCents: rate(b.rateCents, 0.5),
        perMinute: perMinute(b.perMinute, 120), enabled: true, createdAt: now().toISOString(),
      };
      await deps.store.saveCaller(c, hashKey(key));
      log(`caller added ${id} billable=${c.billable}`);
      return send(res, 201, { caller: c, key });
    }

    const one = p.match(/^\/v1\/admin\/callers\/([a-z0-9-]+)(\/key)?$/);
    if (one) {
      requireAdmin(req);
      const c = await deps.store.getCaller(one[1]);
      if (!c) throw new HttpError(404, 'not_found', 'No such caller.');
      if (one[2] && m === 'POST') {
        const key = newKey();
        const next = { ...c, keyHint: hintOf(key) };
        await deps.store.saveCaller(next, hashKey(key));
        log(`caller key replaced ${c.id}`);
        return send(res, 200, { caller: next, key });
      }
      if (!one[2] && m === 'PATCH') {
        const b = parse(await readBody(req, 64 * 1024));
        const next: Caller = {
          ...c,
          name: b.name !== undefined ? String(b.name).trim().slice(0, 80) || c.name : c.name,
          enabled: b.enabled !== undefined ? !!b.enabled : c.enabled,
          billable: b.billable !== undefined ? !!b.billable : c.billable,
          rateCents: b.rateCents !== undefined ? rate(b.rateCents, c.rateCents) : c.rateCents,
          perMinute: b.perMinute !== undefined ? perMinute(b.perMinute, c.perMinute) : c.perMinute,
        };
        await deps.store.saveCaller(next);
        return send(res, 200, { caller: next });
      }
    }
    throw new HttpError(404, 'not_found', 'Not found.');
  }

  return (req: IncomingMessage, res: ServerResponse) => {
    route(req, res).catch((e) => {
      if (e instanceof HttpError || e instanceof CheckError) return send(res, e.status, { code: e.code, message: e.message });
      log(`error ${req.method} ${req.url?.split('?')[0]}: ${(e as Error).message}`);
      send(res, 502, { code: 'engine_error', message: 'The photo check is unavailable right now. Try again shortly.' });
    });
  };
}

function parse(b: Buffer): Record<string, unknown> {
  try { const v = JSON.parse(b.toString('utf8') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { throw new HttpError(400, 'bad_json', 'Send JSON.'); }
}
function rate(v: unknown, dflt: number) {
  const n = Number(v ?? dflt);
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw new HttpError(400, 'bad_rate', 'Rate is cents per photo, zero or more.');
  return n;
}
function perMinute(v: unknown, dflt: number) {
  const n = Math.round(Number(v ?? dflt));
  if (!Number.isFinite(n) || n < 1 || n > 10_000) throw new HttpError(400, 'bad_limit', 'Per-minute limit is 1 to 10000.');
  return n;
}
