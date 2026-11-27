import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { contactIn, ratingFor } from '../src/check';
import { createHandler } from '../src/server';
import { hashKey, MemoryStore } from '../src/store';
import type { Engines } from '../src/types';

// Fake engines: the photo's pixel color decides the result, so no Azure calls are made.
// Red = explicit (severity 6), orange = suggestive (2). Text comes from the `text` variable.
let text = '';
const engines: Engines = {
  name: 'fake',
  async adultSeverity(jpeg) {
    const { dominant } = await sharp(jpeg).stats();
    if (dominant.r > 200 && dominant.g < 60) return 6;
    if (dominant.r > 200 && dominant.g > 100 && dominant.g < 180 && dominant.b < 60) return 2;
    return 0;
  },
  async readText() { return text; },
};

const solid = (r: number, g: number, b: number) => sharp({ create: { width: 200, height: 200, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();

describe('rules', () => {
  it('maps Content Safety severities to ratings', () => {
    assert.equal(ratingFor(0), 'safe');
    assert.equal(ratingFor(2), 'suggestive');
    assert.equal(ratingFor(4), 'explicit');
    assert.equal(ratingFor(6), 'explicit');
  });
  it('finds contact info in OCR text, including a number wrapped over two lines', () => {
    const kinds = (t: string) => contactIn(t).map((m) => m.kind);
    assert.deepEqual(kinds('Text me 555-123-\n4567'), ['phone']);
    assert.ok(kinds('snap: jenny_b').includes('handle'));
    assert.ok(kinds('me at jen@mail.com').includes('email'));
    assert.deepEqual(kinds('Sunset at the lake'), []);
  });
});

describe('HTTP API', () => {
  let server: Server;
  let base = '';
  const store = new MemoryStore();
  const ADMIN = 'admin-test-key-0123456789';
  let appKey = '';
  const logs: string[] = [];

  before(async () => {
    server = createServer(createHandler({ store, engines, adminKey: ADMIN, log: (l) => logs.push(l) }));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await store.saveCaller({ id: 'whatbox-dating', name: 'WhatBox dating sites', keyHint: 'test', billable: false, rateCents: 0, perMinute: 600, enabled: true, createdAt: new Date().toISOString() }, hashKey('wbai_platform'));
  });
  after(() => server.close());

  const check = (key: string, body: Buffer, q = '') => fetch(`${base}/v1/photos/check${q}`, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(body) });
  const admin = (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' } });

  it('refuses calls without a valid key', async () => {
    assert.equal((await check('', await solid(0, 0, 255))).status, 401);
    assert.equal((await check('wbai_nope', await solid(0, 0, 255))).status, 401);
    assert.equal((await admin('/v1/admin/callers', { headers: {} })).status, 200);
    assert.equal((await fetch(base + '/v1/admin/callers', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  });

  it('adds a caller and shows its key once', async () => {
    const r = await admin('/v1/admin/callers', { method: 'POST', body: JSON.stringify({ name: 'Other WhatBox app', billable: false }) });
    assert.equal(r.status, 201);
    const j = await r.json() as { caller: { id: string; billable: boolean; keyHint: string }; key: string };
    assert.equal(j.caller.id, 'other-whatbox-app');
    assert.equal(j.caller.billable, false);
    assert.ok(j.key.startsWith('wbai_') && j.key.endsWith(j.caller.keyHint));
    appKey = j.key;
    const list = await (await admin('/v1/admin/callers')).json() as { callers: Record<string, unknown>[] };
    assert.ok(!JSON.stringify(list).includes(appKey), 'keys are never listed');
  });

  it('rates photos and finds contact info', async () => {
    text = '';
    let j = await (await check(appKey, await solid(0, 0, 255))).json() as { rating: string; contact: { found: boolean } };
    assert.equal(j.rating, 'safe');
    assert.equal(j.contact.found, false);
    j = await (await check(appKey, await solid(255, 0, 0))).json() as typeof j;
    assert.equal(j.rating, 'explicit');
    j = await (await check(appKey, await solid(255, 140, 0))).json() as typeof j;
    assert.equal(j.rating, 'suggestive');
    try {
      text = 'Call me\n555 123 4567';
      const k = await (await check(appKey, await solid(0, 0, 255))).json() as { contact: { found: boolean; kinds: string[] } };
      assert.equal(k.contact.found, true);
      assert.deepEqual(k.contact.kinds, ['phone']);
    } finally { text = ''; }
  });

  it('decodes QR codes in photos', async () => {
    const qr = await QRCode.toBuffer('https://instagram.com/someone', { width: 400, margin: 4 });
    const j = await (await check(appKey, qr)).json() as { contact: { found: boolean; kinds: string[]; matches: { text: string }[] } };
    assert.equal(j.contact.found, true);
    assert.deepEqual(j.contact.kinds, ['qr']);
    assert.equal(j.contact.matches[0].text, 'https://instagram.com/someone');
  });

  it('rejects files that are not photos', async () => {
    const r = await check(appKey, Buffer.from('hello, not an image'));
    assert.equal(r.status, 415);
  });

  it('meters per caller and per account, and bills only billable callers', async () => {
    const img = await solid(0, 0, 255);
    await check('wbai_platform', img, '?account=site_afterh');
    await check('wbai_platform', img, '?account=site_afterh');
    await check('wbai_platform', img, '?account=site_hfriends');
    const r = await admin('/v1/admin/callers', { method: 'POST', body: JSON.stringify({ name: 'Acme Dating', rateCents: 0.5 }) });
    const acme = await r.json() as { key: string };
    for (let i = 0; i < 4; i++) await check(acme.key, img);

    const all = await (await admin('/v1/admin/callers')).json() as { callers: { id: string; checks: number; estimateCents: number; accounts: { account: string; checks: number }[] }[]; totalCents: number };
    const by = Object.fromEntries(all.callers.map((c) => [c.id, c]));
    assert.equal(by['whatbox-dating'].checks, 3);
    assert.deepEqual(by['whatbox-dating'].accounts.map((a) => [a.account, a.checks]), [['site_afterh', 2], ['site_hfriends', 1]]);
    assert.equal(by['whatbox-dating'].estimateCents, 0);
    assert.equal(by['other-whatbox-app'].estimateCents, 0);
    assert.equal(by['acme-dating'].checks, 4);
    assert.equal(by['acme-dating'].estimateCents, 2);
    assert.equal(all.totalCents, 2);

    const mine = await (await fetch(base + '/v1/usage', { headers: { Authorization: 'Bearer ' + acme.key } })).json() as { checks: number; estimateCents: number };
    assert.equal(mine.checks, 4);
    assert.equal(mine.estimateCents, 2);
  });

  it('turns a caller off and replaces keys', async () => {
    await admin('/v1/admin/callers/acme-dating', { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
    const img = await solid(0, 0, 255);
    const list = await (await admin('/v1/admin/callers')).json() as { callers: { id: string }[] };
    assert.ok(list.callers.some((c) => c.id === 'acme-dating'));
    const old = appKey;
    const r = await (await admin('/v1/admin/callers/other-whatbox-app/key', { method: 'POST' })).json() as { key: string };
    assert.equal((await check(old, img)).status, 401);
    assert.equal((await check(r.key, img)).status, 200);
  });

  it('never logs photo text', () => {
    assert.ok(logs.length > 0);
    assert.ok(!logs.some((l) => /555|WhatsApp|instagram/i.test(l)));
  });
});
