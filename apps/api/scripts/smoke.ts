// End-to-end check against a running API: the same client the app uses, over HTTP.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHttpAdminApi, createHttpMemberApi, DEMO_MEMBER_EMAIL, DEMO_OWNER_EMAIL } from '@whatbox/core';

const base = process.env.API_URL ?? 'http://localhost:4000';

(async () => {
  const api = createHttpMemberApi(base, 'afterh', 'web');
  const site = await api.site();
  assert.equal(site.name, 'AfterH');
  const s = await api.startVerification('email', DEMO_MEMBER_EMAIL);
  assert.ok(s.devCode, 'dev codes must be exposed for this test');
  const { token } = await api.verify(s.challengeId, s.devCode!);
  api.setToken(token);
  const me = await api.me();
  assert.equal(me.member.displayName, 'Alex');

  const res = await api.search({ withinMiles: 50, pageSize: 48 });
  assert.ok(res.total > 5);
  const rosa = res.people.find((p) => p.displayName === 'Rosa')!;
  const prof = await api.profile(rosa.id);
  assert.equal(prof.privatePhotos[0].placeholder, 'locked');
  assert.equal(await api.requestAccess(rosa.id), 'requested');

  // Live events: a stream opened on a second API instance (if running) sees a message sent through the first
  const streamBase = process.env.API_URL_2 ?? base;
  const ctl = new AbortController();
  const got: unknown[] = [];
  const stream = await fetch(streamBase + '/v1/events', { headers: { 'X-Site': 'afterh', Authorization: 'Bearer ' + token }, signal: ctl.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  const pump = (async () => {
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buf += dec.decode(value);
      for (const m of buf.matchAll(/data: (.+)\n\n/g)) got.push(JSON.parse(m[1]));
      buf = buf.slice(buf.lastIndexOf('\n\n') + 2);
    }
  })();
  // Alex likes someone who already liked him -> match event to Alex
  const likers = await api.activity('likes');
  const liker = likers.people.find((p) => !p.likedBack)!;
  await api.like(liker.id, true);
  for (let i = 0; i < 30 && !got.length; i++) await new Promise((r) => setTimeout(r, 100));
  ctl.abort();
  await pump;
  assert.deepEqual(got[0], { type: 'match', otherId: liker.id }, JSON.stringify(got));
  await api.like(liker.id, false);
  assert.equal((await fetch(base + '/v1/events', { headers: { 'X-Site': 'afterh', Authorization: 'Bearer afterh.nope' } })).status, 401);

  const likes = await api.activity('likes');
  assert.equal(likes.locked, false); // paywall is off at launch
  assert.equal(likes.total, 12);
  assert.ok(likes.vipCount > 0 && likes.people[0].vip);

  const deck = await api.discover();
  assert.ok(deck.length > 3);
  await api.pass(deck[0].id);
  assert.ok(!(await api.discover()).some((c) => c.id === deck[0].id));
  assert.equal((await api.like(deck[1].id, true)).vip, false);
  assert.equal((await api.setTier('vip')).member.tier, 'vip');
  assert.equal((await api.like(deck[2].id, true)).vip, true);
  await api.setTier('free');
  assert.match(prof.details.find((d) => d.key === 'height')!.value, /cm/);

  const conv = await api.send(rosa.id, 'Text me at 303-555-0142');
  assert.ok(conv.messages.at(-1)!.notice?.includes('hidden'));
  const held = await api.send(rosa.id, 'Can you send a gift card? Stuck at the airport.');
  assert.ok(held.messages.at(-1)!.held);

  // A token for AfterH must not work on HFriends
  const other = createHttpMemberApi(base, 'hfriends', 'web');
  other.setToken(token);
  await assert.rejects(other.me());

  // Real upload: re-encoded, GPS and other metadata stripped, served from a signed URL
  const jpg = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#7FA39B' } })
    .withExif({ IFD0: { Copyright: 'SECRET-EXIF-MARKER' } }).jpeg().toBuffer();
  assert.ok(jpg.includes('SECRET-EXIF-MARKER'));
  const fd = new FormData();
  fd.append('kind', 'public');
  fd.append('file', new Blob([jpg], { type: 'image/jpeg' }), 'x.jpg');
  const up = await fetch(base + '/v1/me/photos/upload', { method: 'POST', body: fd, headers: { 'X-Site': 'afterh', Authorization: 'Bearer ' + token } });
  assert.equal(up.status, 201, await up.clone().text());
  const mine = (await up.json()) as Awaited<ReturnType<typeof api.me>>;
  const added = mine.photos.at(-1)!;
  assert.ok(added.url?.includes('/files/afterh/'), added.url);
  const img = Buffer.from(await (await fetch(added.url!)).arrayBuffer());
  const meta = await sharp(img).metadata();
  assert.ok(meta.width! <= 1600 && !meta.exif && !img.includes('SECRET-EXIF-MARKER'));
  assert.equal((await fetch(added.url!.replace(/s=[^&]+/, 's=forged'))).status, 404);
  const bad = new FormData();
  bad.append('kind', 'public');
  bad.append('file', new Blob(['not an image'], { type: 'image/jpeg' }), 'x.jpg');
  assert.equal((await fetch(base + '/v1/me/photos/upload', { method: 'POST', body: bad, headers: { 'X-Site': 'afterh', Authorization: 'Bearer ' + token } })).status, 415);
  await api.deletePhoto(added.id);
  assert.equal((await fetch(added.url!)).status, 404);

  // Favorites and provider sign-in (not configured here, so it is refused cleanly)
  await api.favorite(rosa.id, true);
  assert.equal((await api.activity('favorites')).people[0].id, rosa.id);
  await api.favorite(rosa.id, false);
  await assert.rejects(api.signInWithProvider('google', 'x'), /not available/);

  // Explicit-photo rule enforced server-side
  await assert.rejects(api.addPhoto({ kind: 'private', rating: 'explicit' }));

  const admin = createHttpAdminApi(base);
  const st = await admin.start(DEMO_OWNER_EMAIL);
  admin.setToken((await admin.verify(st.challengeId, st.devCode!)).token);
  const adm = await admin.me();
  assert.equal(adm.sites.length, 3);
  const queue = await admin.moderation('site_afterh', 'pending');
  assert.ok(queue.some((q) => q.kind === 'message' && q.messageBody?.includes('gift card')));
  const site2 = await admin.updateSite('site_afterh', { settings: { membership: { paywallEnabled: true } } });
  assert.equal(site2.settings.membership.paywallEnabled, true);
  const locked = await api.activity('likes');
  assert.ok(locked.locked && locked.people.every((p) => p.vip));
  await admin.updateSite('site_afterh', { settings: { membership: { paywallEnabled: false } } });
  const stats = await admin.stats('site_afterh');
  assert.ok(stats.members > 40);
  // Account deletion, on a throwaway member
  const temp = createHttpMemberApi(base, 'afterh', 'web');
  const ts = await temp.startVerification('email', `delete.me.${Date.now()}@example.com`);
  temp.setToken((await temp.verify(ts.challengeId, ts.devCode!)).token);
  await temp.updateMe({ displayName: 'Temp', birthYear: 1990, gender: 'man', seeking: ['woman'], postal: '80202', fields: { hsv_status: 'HSV-1' } });
  await temp.like(rosa.id, true);
  await temp.deleteAccount('DELETE');

  console.log('smoke ok:', { members: stats.members, openModeration: stats.openModeration, searchTotal: res.total });
})().catch((e) => { console.error('smoke FAILED', e); process.exit(1); });
