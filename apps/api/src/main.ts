import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { buildModule, ErrorFilter } from './app';
import { config } from './config';
import { createPlatform } from './db';
import { LocalPhotoStore } from './photos';
import { startCleanup } from './cleanup';

async function main() {
  const { platform, photos, events, control } = createPlatform();
  const app = await NestFactory.create(buildModule(platform), { bodyParser: false, logger: ['error', 'warn', 'log'] });
  app.use(json({ limit: config.photoStore === 'inline' ? '8mb' : '256kb' }));
  app.useGlobalFilters(new ErrorFilter());
  // Browsers may call from the configured origins, or from https://<site domain> / https://app.<site domain>.
  const corsCache = new Map<string, { ok: boolean; at: number }>();
  const originAllowed = async (origin: string) => {
    if (config.corsOrigins.includes(origin)) return true;
    const hit = corsCache.get(origin);
    if (hit && Date.now() - hit.at < 60_000) return hit.ok;
    let ok = false;
    try {
      const u = new URL(origin);
      const host = u.hostname.replace(/^(app|www)\./, '');
      ok = u.protocol === 'https:' && !u.port && !!(await control.findSite(host))?.domains.includes(host);
    } catch { ok = false; }
    if (corsCache.size > 1000) corsCache.clear();
    corsCache.set(origin, { ok, at: Date.now() });
    return ok;
  };
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => { if (!origin) return cb(null, false); originAllowed(origin).then((ok) => cb(null, ok), () => cb(null, false)); },
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Site', 'X-Client-Platform'],
  });
  const http = app.getHttpAdapter().getInstance() as import('express').Express;
  // Only the load balancer's hop is trusted, so clients can't fake their IP for rate limits.
  http.set('trust proxy', config.trustProxyHops);
  http.disable('x-powered-by');
  http.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-site',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Content-Security-Policy': req.path.startsWith('/dev/') ? "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" : "default-src 'none'; frame-ancestors 'none'",
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Member data must never sit in a shared cache.
    if (req.path.startsWith('/v1/')) res.set('Cache-Control', 'no-store');
    next();
  });
  // Liveness for Azure Container Apps probes: the process is up and the control database answers.
  http.get('/healthz', async (_req, res) => {
    try { await control.listSites(); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });
  // Live events (server-sent events). Clients connect with their normal session header.
  http.get('/v1/events', async (req, res) => {
    let site, ctx;
    try {
      site = await platform.resolveSite((req.headers['x-site'] as string) || req.hostname);
      const auth = req.headers.authorization;
      ctx = await platform.memberCtx(site, auth?.startsWith('Bearer ') ? auth.slice(7) : undefined, 'web');
      await events.ensureListening(site);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status === 403 ? 403 : status === 404 ? 404 : 401).json({ code: 'signed_out', message: 'Please sign in.' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    const token = req.headers.authorization!.slice(7);
    const off = events.hub.subscribe(site.id, ctx.me.id, (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
    const beat = setInterval(() => res.write(': hb\n\n'), 25_000);
    // Close streams whose session was signed out, deleted or suspended.
    const check = setInterval(async () => {
      try { await platform.memberCtx(site, token, 'web'); } catch { res.end(); }
    }, 5 * 60_000);
    req.on('close', () => { off(); clearInterval(beat); clearInterval(check); });
  });

  if (photos instanceof LocalPhotoStore) {
    // Dev only: serves signed photo URLs from disk. In Azure, browsers fetch from Blob storage directly.
    http.get('/files/:slug/:member/:photo', async (req, res) => {
      const { slug, member, photo } = req.params;
      const buf = await photos.read(slug, `${member}/${photo}`, Number(req.query.e), String(req.query.s ?? ''));
      if (!buf) { res.status(404).end(); return; }
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).send(buf);
    });
  }
  if (config.paymentsStub && process.env.NODE_ENV !== 'production') {
    // Dev only: stands in for the processor's approval page.
    http.get('/dev/checkout', (req, res) => {
      const q = req.query as Record<string, string>;
      const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      const js = (v: unknown) => JSON.stringify(String(v ?? '')).replace(/</g, '\\u003c');
      const back = /^(https?:|[a-z]+:\/\/)/.test(String(q.return ?? '')) && !/^javascript:/i.test(String(q.return)) ? String(q.return) : '/';
      res.set('Content-Type', 'text/html').send(`<!doctype html><meta name="viewport" content="width=device-width">
<title>Test checkout</title><body style="font:16px system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<h1>Test checkout</h1><p>No money moves. This page stands in for PayPal in local development.</p>
<p>Plan: <b>${esc(q.tier)}</b></p>
<button id="ok" style="font-size:16px;padding:10px 18px">Approve</button> <a href="${esc(back)}">Cancel</a>
<script>document.getElementById('ok').onclick=async()=>{await fetch('/v1/webhooks/stub/'+encodeURIComponent(${js(q.site)}),{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({ref:${js(q.ref)},sub:${js(q.sub)},status:'active',periodEnd:new Date(Date.now()+30*864e5).toISOString()})});location.href=${js(back)};}</script>`);
    });
  }
  if (config.cleanupMinutes > 0) startCleanup(platform, config.cleanupMinutes);
  await app.listen(config.port);
  console.log(`WhatBox API listening on :${config.port}`);
}
main();
