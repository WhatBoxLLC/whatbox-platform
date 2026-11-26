// End-to-end check against a running API: the same client the app uses, over HTTP.
import assert from 'node:assert/strict';
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

  const likes = await api.activity('likes');
  assert.equal(likes.locked, true);
  assert.equal(likes.total, 12);

  const conv = await api.send(rosa.id, 'Text me at 303-555-0142');
  assert.ok(conv.messages.at(-1)!.notice?.includes('hidden'));
  const held = await api.send(rosa.id, 'Can you send a gift card? Stuck at the airport.');
  assert.ok(held.messages.at(-1)!.held);

  // A token for AfterH must not work on HFriends
  const other = createHttpMemberApi(base, 'hfriends', 'web');
  other.setToken(token);
  await assert.rejects(other.me());

  // Explicit-photo rule enforced server-side
  await assert.rejects(api.addPhoto({ kind: 'private', rating: 'explicit' }));

  const admin = createHttpAdminApi(base);
  const st = await admin.start(DEMO_OWNER_EMAIL);
  admin.setToken((await admin.verify(st.challengeId, st.devCode!)).token);
  const adm = await admin.me();
  assert.equal(adm.sites.length, 3);
  const queue = await admin.moderation('site_afterh', 'pending');
  assert.ok(queue.some((q) => q.kind === 'message' && q.messageBody?.includes('gift card')));
  const stats = await admin.stats('site_afterh');
  assert.ok(stats.members > 40);
  console.log('smoke ok:', { members: stats.members, openModeration: stats.openModeration, searchTotal: res.total });
})().catch((e) => { console.error('smoke FAILED', e); process.exit(1); });
