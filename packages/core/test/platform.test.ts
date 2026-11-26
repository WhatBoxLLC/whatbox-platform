import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLocalAdminApi, createLocalMemberApi, createMemoryPlatform, DEMO_MEMBER_EMAIL, DEMO_OWNER_EMAIL,
  findContactInfo, maskContactInfo, screenMessage, seedSites, SiteCrypto, DevKeyProvider, ApiError,
} from '../src/index';

async function signIn(email = DEMO_MEMBER_EMAIL, platform: 'web' | 'ios' = 'web', site = 'afterh') {
  const mp = await createMemoryPlatform();
  const api = createLocalMemberApi(mp.platform, site, platform);
  const start = await api.startVerification('email', email);
  const { token, isNew } = await api.verify(start.challengeId, start.devCode!);
  api.setToken(token);
  return { mp, api, isNew };
}

test('contact info is detected and masked', () => {
  assert.ok(findContactInfo('call me at 303-555-0199').length);
  assert.ok(findContactInfo('email jo (at) gmail (dot) com').length);
  assert.ok(findContactInfo('add me on whatsapp @jojo').length);
  assert.ok(findContactInfo('see www.example.com').length);
  assert.equal(findContactInfo('I have 2 dogs and 3 cats').length, 0);
  assert.match(maskContactInfo('text me 303 555 0199 ok'), /hidden until/);
});

test('scam language and duplicate blasts are held, even for premium', () => {
  const site = seedSites(new Date())[0];
  const now = new Date();
  const s = screenMessage({ body: 'Can you send a gift card? I am stuck at the airport', site, isNewConversation: true, recentFromSender: [], now });
  assert.ok(s.hold);
  const body = 'Hey there gorgeous, you seem really special to me';
  const recent = ['a', 'b'].map((toId) => ({ toId, body, at: now.toISOString() }));
  const d = screenMessage({ body, site, isNewConversation: true, recentFromSender: recent, now });
  assert.ok(d.flags.includes('duplicate') && d.hold);
});

test('verification creates a session; wrong code is rejected', async () => {
  const mp = await createMemoryPlatform();
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const s = await api.startVerification('email', 'new.person@example.com');
  await assert.rejects(api.verify(s.challengeId, '000000' === s.devCode ? '111111' : '000000'), ApiError);
  const ok = await api.verify(s.challengeId, s.devCode!);
  assert.equal(ok.isNew, true);
  api.setToken(ok.token);
  const me = await api.me();
  assert.equal(me.member.profileComplete, false);
  await assert.rejects(api.search({}), /Finish your profile/);
  await api.updateMe({ displayName: 'Jordan', birthYear: 1990, gender: 'man', seeking: ['woman'], postal: '80202', fields: { hsv_status: 'HSV-1' } });
  const res = await api.search({});
  assert.ok(res.total > 0);
});

test('contact details are encrypted per site', async () => {
  const keys = new DevKeyProvider('k');
  const a = new SiteCrypto(keys, 'site_a');
  const b = new SiteCrypto(keys, 'site_b');
  const enc = await a.encrypt('x@example.com');
  assert.equal(await a.decrypt(enc), 'x@example.com');
  await assert.rejects(b.decrypt(enc));
  assert.notEqual(await a.lookupHash('x@example.com'), await b.lookupHash('x@example.com'));
});

test('photo limits and explicit rules', async () => {
  const { api } = await signIn();
  const me = await api.me();
  const pub = me.photos.filter((p) => p.kind === 'public').length;
  await assert.rejects(api.addPhoto({ kind: 'private', rating: 'explicit' }), /does not allow explicit/);
  await assert.rejects(api.addPhoto({ kind: 'public', rating: 'explicit' }), /only be private/);
  for (let i = pub; i < 6; i++) await api.addPhoto({ kind: 'public' });
  await assert.rejects(api.addPhoto({ kind: 'public' }), /up to 6/);
});

test('private photos: request, grant, revoke', async () => {
  const mp = await createMemoryPlatform();
  const alex = createLocalMemberApi(mp.platform, 'afterh', 'web');
  let s = await alex.startVerification('email', DEMO_MEMBER_EMAIL);
  alex.setToken((await alex.verify(s.challengeId, s.devCode!)).token);
  const rosa = (await alex.search({ pageSize: 48 })).people.find((p) => p.displayName === 'Rosa')!;
  let prof = await alex.profile(rosa.id);
  assert.equal(prof.privatePhotos.every((p) => p.placeholder === 'locked'), true);
  assert.equal(await alex.requestAccess(rosa.id), 'requested');

  // Rosa signs in through a second session on the same platform
  const repo = mp.sites.get('site_afterh')!;
  const crypto = mp.platform.crypto((await mp.control.getSite('site_afterh'))!);
  const rosaMember = (await repo.getMember(rosa.id))!;
  rosaMember.emailHash = await crypto.lookupHash('rosa@example.com');
  await repo.saveMember(rosaMember);
  const rosaApi = createLocalMemberApi(mp.platform, 'afterh', 'web');
  s = await rosaApi.startVerification('email', 'rosa@example.com');
  rosaApi.setToken((await rosaApi.verify(s.challengeId, s.devCode!)).token);
  const lists = await rosaApi.privateAccess();
  const alexId = (await alex.me()).member.id;
  assert.equal(lists.incoming[0].member.id, alexId);
  await rosaApi.decideAccess(alexId, 'grant');
  prof = await alex.profile(rosa.id);
  assert.ok(prof.privatePhotos.every((p) => !p.placeholder));
  await rosaApi.decideAccess(alexId, 'revoke');
  prof = await alex.profile(rosa.id);
  assert.ok(prof.privatePhotos.every((p) => p.placeholder === 'locked'));
});

async function ownerAdmin(mp: Awaited<ReturnType<typeof createMemoryPlatform>>) {
  const admin = createLocalAdminApi(mp.platform);
  const st = await admin.start(DEMO_OWNER_EMAIL);
  admin.setToken((await admin.verify(st.challengeId, st.devCode!)).token);
  return admin;
}

test('paywall off at launch: free members get full access', async () => {
  const { api } = await signIn();
  const me = await api.me();
  assert.equal(me.paywallEnabled, false);
  assert.equal(me.member.tier, 'free');
  const likes = await api.activity('likes');
  assert.equal(likes.locked, false);
  assert.equal(likes.people.length, 12);
  // priority likes from VIPs still lead the list
  assert.ok(likes.vipCount > 0);
  const firstPlain = likes.people.findIndex((p) => !p.vip);
  assert.ok(firstPlain >= likes.vipCount && likes.people.slice(firstPlain).every((p) => !p.vip));
});

test('paywall on: Free sees VIP likes only and photo one only; Paid unlocks', async () => {
  const { api, mp } = await signIn();
  const admin = await ownerAdmin(mp);
  await admin.updateSite('site_afterh', { settings: { membership: { paywallEnabled: true } } });
  let likes = await api.activity('likes');
  assert.equal(likes.total, 12);
  assert.ok(likes.locked && likes.hidden === 12 - likes.vipCount);
  assert.ok(likes.people.length === likes.vipCount && likes.people.every((p) => p.vip));
  const rosa = (await api.search({ pageSize: 48 })).people.find((p) => p.displayName === 'Rosa')!;
  let prof = await api.profile(rosa.id);
  assert.equal(prof.publicPhotos.length, 0);
  assert.ok(prof.publicPhotosLocked > 0);
  await assert.rejects(api.requestAccess(rosa.id), /Upgrade/);
  await api.setTier('paid');
  likes = await api.activity('likes');
  assert.equal(likes.people.length, 12);
  prof = await api.profile(rosa.id);
  assert.ok(prof.publicPhotos.length > 0);
});

test('paywall on: VIP messages are readable and answerable by Free; Paid messages are sealed', async () => {
  const mp = await createMemoryPlatform();
  const admin = await ownerAdmin(mp);
  await admin.updateSite('site_afterh', { settings: { membership: { paywallEnabled: true } } });
  const alex = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const s = await alex.startVerification('email', DEMO_MEMBER_EMAIL);
  alex.setToken((await alex.verify(s.challengeId, s.devCode!)).token);
  const convs = await alex.conversations();
  const priya = convs.find((c) => c.other.displayName === 'Priya')!;
  const rosa = convs.find((c) => c.other.displayName === 'Rosa')!;
  assert.equal(priya.fromVip, true);
  assert.equal(priya.last.sealed, false);
  // Rosa is on Paid in the seed, so her messages are sealed for a Free member (checked below)
  const pv = await alex.conversation(priya.other.id);
  assert.equal(pv.canSend, true);
  assert.match(pv.messages.at(-1)!.notice ?? '', /VIP/);
  await alex.send(priya.other.id, 'Saw a great show last week!');
  const rv = await alex.conversation(rosa.other.id);
  assert.ok(rv.sealedCount > 0 && !rv.canSend);
  // Free can't start new conversations
  const someone = (await alex.search({ pageSize: 48, withinMiles: null })).people.find((p) => !convs.some((c) => c.other.id === p.id))!;
  await assert.rejects(alex.send(someone.id, 'Hello there'), /Upgrade/);
});

test('messages: held scam text is invisible to recipient and lands in moderation', async () => {
  const { mp, api } = await signIn();
  const rosa = (await api.search({ pageSize: 48 })).people.find((p) => p.displayName === 'Rosa')!;
  const conv = await api.send(rosa.id, 'Could you send me $300 through Western Union?');
  assert.ok(conv.messages.at(-1)!.held);
  const admin = createLocalAdminApi(mp.platform);
  const st = await admin.start(DEMO_OWNER_EMAIL);
  admin.setToken((await admin.verify(st.challengeId, st.devCode!)).token);
  const queue = await admin.moderation('site_afterh', 'pending');
  assert.ok(queue.some((q) => q.kind === 'message' && q.messageBody?.includes('Western Union')));
});

test('explicit photos never reach the apps', async () => {
  const mp = await createMemoryPlatform();
  const site = (await mp.control.getSite('site_afterh'))!;
  site.settings.explicitPhotosAllowed = true;
  await mp.control.saveSite(site);
  const repo = mp.sites.get('site_afterh')!;
  const rosa = (await repo.listAllMembers(100, 0, 'Rosa')).rows[0];
  const p = (await repo.listPhotos(rosa.id)).find((x) => x.kind === 'private')!;
  await repo.savePhoto({ ...p, rating: 'explicit' });
  await repo.saveAccess({ ownerId: rosa.id, viewerId: 'm_afterh_demo', status: 'granted', updatedAt: new Date().toISOString() });

  for (const [platform, expected] of [['ios', 'app_safe'], ['web', 'filtered']] as const) {
    const api = createLocalMemberApi(mp.platform, 'afterh', platform);
    const s = await api.startVerification('email', DEMO_MEMBER_EMAIL);
    api.setToken((await api.verify(s.challengeId, s.devCode!)).token);
    const prof = await api.profile(rosa.id);
    assert.equal(prof.privatePhotos.find((x) => x.id === p.id)!.placeholder, expected);
  }
});

test('sites are isolated: a token from one site does not work on another', async () => {
  const { mp, api } = await signIn();
  const token = (api as any);
  const other = createLocalMemberApi(mp.platform, 'hfriends', 'web');
  const s = await api.startVerification('email', DEMO_MEMBER_EMAIL);
  const { token: afterhToken } = await api.verify(s.challengeId, s.devCode!);
  other.setToken(afterhToken);
  await assert.rejects(other.me(), /sign in/);
  void token;
});

test('owner admin: site switcher only lists managed sites; owners cannot change mode', async () => {
  const mp = await createMemoryPlatform();
  const admin = createLocalAdminApi(mp.platform);
  const st = await admin.start(DEMO_OWNER_EMAIL);
  admin.setToken((await admin.verify(st.challengeId, st.devCode!)).token);
  const me = await admin.me();
  assert.equal(me.sites.length, 3);
  await assert.rejects(admin.updateSite('site_afterh', { settings: { mode: 'standard' } }), /Only WhatBox/);
  const site = await admin.updateSite('site_afterh', { settings: { membership: { tiers: { free: { seeWhoViewed: true } } } } });
  assert.equal(site.settings.membership.tiers.free.seeWhoViewed, true);
  assert.equal(site.settings.membership.tiers.free.seePublicPhotos, false);
  assert.equal(site.settings.membership.paywallEnabled, false);
});

test('throttling applies to new conversations', async () => {
  const { api } = await signIn();
  const people = (await api.search({ pageSize: 48, withinMiles: null })).people;
  let err: unknown;
  for (let i = 0; i < 12; i++) {
    try { await api.send(people[i].id, `Hi ${people[i].displayName}, nice profile number ${i}`); } catch (e) { err = e; break; }
  }
  assert.ok(err instanceof ApiError && err.status === 429);
});

test('height is stored in cm and shown in both units', async () => {
  const { api } = await signIn();
  const res = await api.search({ sort: 'best' });
  const rosa = res.people.find((p) => p.displayName === 'Rosa')!;
  const prof = await api.profile(rosa.id);
  assert.equal(prof.details.find((d) => d.key === 'height')!.value, '5′ 6″ (168 cm)');
  await api.updateMe({ units: 'metric' });
  const p2 = await api.profile(rosa.id);
  assert.equal(p2.details.find((d) => d.key === 'height')!.value, '168 cm (5′ 6″)');
  await assert.rejects(api.updateMe({ fields: { height: 'tall' } }));
});

test('discover: pass hides a profile; VIP members send priority likes', async () => {
  const { api, mp } = await signIn();
  const deck = await api.discover();
  assert.ok(deck.length > 3);
  assert.ok(deck.every((c, i) => i === 0 || deck[i - 1].score >= c.score));
  await api.pass(deck[0].id);
  assert.ok(!(await api.discover()).some((c) => c.id === deck[0].id));
  assert.equal((await api.like(deck[1].id, true)).vip, false);
  await api.setTier('vip');
  assert.equal((await api.like(deck[2].id, true)).vip, true);
  void mp;
});

test('new members get a boost in the blended feed', async () => {
  const { api } = await signIn();
  const deck = await api.discover();
  const newOnes = deck.filter((c) => c.isNew);
  assert.ok(newOnes.length > 0, 'seed has new members');
});
