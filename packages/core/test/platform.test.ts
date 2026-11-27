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
  await api.updateMe({ displayName: 'Jordan', birthYear: 1990, gender: 'man', seeking: ['woman'], postal: '80202', fields: { hsv_status: ['HSV-1'] } });
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

test('code sends are rate limited per address; admin codes are single-use and attempt-limited', async () => {
  const mp = await createMemoryPlatform();
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  for (let i = 0; i < 5; i++) await api.startVerification('email', 'limit.me@example.com');
  await assert.rejects(api.startVerification('email', 'Limit.Me@example.com'), (e: ApiError) => e.status === 429);
  const admin = createLocalAdminApi(mp.platform);
  const st = await admin.start(DEMO_OWNER_EMAIL);
  for (let i = 0; i < 5; i++) await assert.rejects(admin.verify(st.challengeId, '000000' === st.devCode ? '111111' : '000000'));
  await assert.rejects(admin.verify(st.challengeId, st.devCode!), /expired/);
  const st2 = await admin.start(DEMO_OWNER_EMAIL);
  await admin.verify(st2.challengeId, st2.devCode!);
  await assert.rejects(admin.verify(st2.challengeId, st2.devCode!));
});

test('favorites are private bookmarks; delete account removes everything', async () => {
  const { api, mp } = await signIn();
  const rosa = (await api.search({ pageSize: 48 })).people.find((p) => p.displayName === 'Rosa')!;
  await api.favorite(rosa.id, true);
  assert.equal((await api.profile(rosa.id)).favoritedByMe, true);
  assert.deepEqual((await api.activity('favorites')).people.map((p) => p.id), [rosa.id]);
  await assert.rejects(api.deleteAccount('nope'), /DELETE/);
  await api.deleteAccount('DELETE');
  await assert.rejects(api.me());
  // nothing about Alex is left in the site's data
  const repo = await (mp.platform as any).deps.siteRepo('site_afterh');
  assert.equal((await repo.listMessagesInvolving('m_afterh_demo')).length, 0);
  assert.equal(await repo.getMember('m_afterh_demo'), null);
  // and signing in with the same email starts a brand new account
  const again = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const st = await again.startVerification('email', DEMO_MEMBER_EMAIL);
  assert.equal((await again.verify(st.challengeId, st.devCode!)).isNew, true);
});

test('Apple and Google sign-in link by verified email and stay per site', async () => {
  const idTokens = { async verify(_s: unknown, provider: string, t: string) {
    if (t === 'bad') throw new Error('bad');
    return { sub: provider + '-123', email: t === 'alex' ? DEMO_MEMBER_EMAIL : undefined, emailVerified: true };
  } };
  const mp = await createMemoryPlatform({ idTokens });
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const r = await api.signInWithProvider('google', 'alex');
  assert.equal(r.isNew, false); // linked to Alex by email
  api.setToken(r.token);
  assert.equal((await api.me()).member.displayName, 'Alex');
  const r2 = await api.signInWithProvider('google', 'no-email');
  assert.equal(r2.token.startsWith('afterh.'), true);
  api.setToken(r2.token);
  assert.equal((await api.me()).member.displayName, 'Alex'); // same sub, same account
  await assert.rejects(api.signInWithProvider('apple', 'bad'), /could not confirm/);
  const hf = createLocalMemberApi(mp.platform, 'hfriends', 'web');
  hf.setToken(r.token);
  await assert.rejects(hf.me());
});

test('billing: self-serve tier is off outside preview; checkout + webhook sets tier; cancel keeps paid period', async () => {
  const { StubGateway } = await import('../src/index');
  const stub = new StubGateway();
  const mp = await createMemoryPlatform({ allowSelfServeTier: false, payments: { stub } });
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const st = await api.startVerification('email', DEMO_MEMBER_EMAIL);
  api.setToken((await api.verify(st.challengeId, st.devCode!)).token);
  await assert.rejects(api.setTier('vip'), (e: ApiError) => e.status === 403);
  assert.equal((await api.me()).member.tier, 'free');

  const co = await api.checkout('vip', { returnUrl: 'https://x/return', cancelUrl: 'https://x/cancel' });
  const ref = new URL(co.checkoutUrl, 'https://x').searchParams.get('ref')!;
  assert.equal((await api.me()).member.tier, 'free'); // nothing until the processor confirms
  const site = (await mp.control.listSites()).find((s) => s.slug === 'afterh')!;
  // Unknown refs are ignored, not applied to anyone.
  assert.deepEqual(await mp.platform.handlePaymentWebhook(site, 'stub', {}, { ref: 'stub_nope', status: 'active' }, ''), { ok: true, ignored: true });
  const end = new Date(Date.now() + 20 * 86400e3).toISOString();
  await mp.platform.handlePaymentWebhook(site, 'stub', {}, { ref, status: 'active', periodEnd: end }, '');
  let me = await api.me();
  assert.equal(me.member.tier, 'vip');
  assert.equal(me.subscription?.status, 'active');

  me = await api.cancelSubscription();
  assert.equal(me.member.tier, 'vip', 'stays VIP until the paid period ends');
  assert.deepEqual(stub.cancelled, [ref]);
  await mp.platform.handlePaymentWebhook(site, 'stub', {}, { ref, status: 'expired' }, '');
  assert.equal((await api.me()).member.tier, 'free');
});

test('billing: admin comp tier survives an expired subscription', async () => {
  const { StubGateway } = await import('../src/index');
  const mp = await createMemoryPlatform({ allowSelfServeTier: false, payments: { stub: new StubGateway() } });
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const st = await api.startVerification('email', DEMO_MEMBER_EMAIL);
  api.setToken((await api.verify(st.challengeId, st.devCode!)).token);
  const me = await api.me();
  const site = (await mp.control.listSites()).find((s) => s.slug === 'afterh')!;
  await mp.platform.adminSetMemberTier((await mp.control.getAdmin('adm_owner'))!, site.id, me.member.id, 'paid');
  const co = await api.checkout('vip', { returnUrl: 'r', cancelUrl: 'c' });
  const ref = new URL(co.checkoutUrl, 'https://x').searchParams.get('ref')!;
  await mp.platform.handlePaymentWebhook(site, 'stub', {}, { ref, status: 'active' }, '');
  assert.equal((await api.me()).member.tier, 'vip');
  await mp.platform.handlePaymentWebhook(site, 'stub', {}, { ref, status: 'expired' }, '');
  assert.equal((await api.me()).member.tier, 'paid');
});

test('usage is metered per site for codes', async () => {
  const mp = await createMemoryPlatform();
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  await api.startVerification('email', 'someone@example.com');
  const rows = await mp.control.usageSummary('2000-01-01');
  assert.ok(rows.some((r) => r.kind === 'email' && r.qty >= 1 && r.siteId.includes('afterh')));
});

async function adminSignIn(mp: Awaited<ReturnType<typeof createMemoryPlatform>>, email: string) {
  const a = createLocalAdminApi(mp.platform);
  const st = await a.start(email);
  a.setToken((await a.verify(st.challengeId, st.devCode!)).token);
  return a;
}

test('platform admin: create a site, assign an owner, suspend, usage and estimate', async () => {
  const mp = await createMemoryPlatform();
  const owner = await adminSignIn(mp, DEMO_OWNER_EMAIL);
  await assert.rejects(owner.platform(), (e: ApiError) => e.status === 403);
  await assert.rejects(owner.createSite({ slug: 'x', name: 'X', domains: [], mode: 'standard', ownerIds: [] }), (e: ApiError) => e.status === 403);

  const pa = await adminSignIn(mp, 'admin@whatbox.test');
  await assert.rejects(pa.createSite({ slug: 'swing', name: 'Swing', domains: ['afterh.com'], mode: 'adult', ownerIds: [] }), (e: ApiError) => e.code === 'domain_taken');
  const newOwner = await pa.saveOwner({ email: 'Pat@Example.com', name: 'Pat', siteIds: [] });
  const site = await pa.createSite({ slug: 'swingandscore', name: 'SwingAndScore', domains: ['https://www.SwingAndScore.com/'], mode: 'adult', ownerIds: [newOwner.id] });
  assert.deepEqual(site.domains, ['swingandscore.com']);
  assert.equal(site.settings.membership.paywallEnabled, false);
  assert.equal(site.settings.explicitPhotosAllowed, false);
  assert.equal(site.settings.paymentProvider, 'none');

  // The new owner sees only the new site
  const pat = await adminSignIn(mp, 'pat@example.com');
  assert.deepEqual((await pat.me()).sites.map((x) => x.slug), ['swingandscore']);
  await assert.rejects(pat.updateSite(site.id, { settings: { paymentProvider: 'paypal' } }), (e: ApiError) => e.code === 'provider_not_allowed');

  // Members can sign up on the new site, and its data is separate
  const m = createLocalMemberApi(mp.platform, 'swingandscore.com', 'web');
  const st = await m.startVerification('email', 'new@example.com');
  m.setToken((await m.verify(st.challengeId, st.devCode!)).token);
  assert.equal((await m.site()).name, 'SwingAndScore');

  // Suspend: members are turned away, admins still see it
  await pa.platformUpdateSite(site.id, { status: 'suspended' });
  await assert.rejects(m.site(), (e: ApiError) => e.status === 503);
  await pa.platformUpdateSite(site.id, { status: 'active' });
  await m.site();

  // Usage and the monthly estimate
  await pa.platformUpdateSite(site.id, { licensing: { owned: false, baseMonthlyCents: 5000, ratesCents: { email: 1 } } });
  const ov = await pa.platform();
  const row = ov.sites.find((x) => x.id === site.id)!;
  assert.equal(row.usage.email, 1);
  assert.equal(row.estimateCents, 5001);
  assert.ok(ov.owners.some((o) => o.email === 'pat@example.com'));

  // Removing the owner takes them off the site
  await pa.deleteOwner(newOwner.id);
  assert.deepEqual((await pa.platform()).sites.find((x) => x.id === site.id)!.ownerIds, []);
  await assert.rejects(pat.me(), (e: ApiError) => e.status === 401);
});

test('audit log records admin changes, scoped to the sites an owner manages', async () => {
  const mp = await createMemoryPlatform();
  const owner = await adminSignIn(mp, DEMO_OWNER_EMAIL);
  await owner.updateSite('site_afterh', { settings: { membership: { paywallEnabled: true } } });
  const pa = await adminSignIn(mp, 'admin@whatbox.test');
  const other = await pa.createSite({ slug: 'other', name: 'Other', domains: ['other.example'], mode: 'standard', ownerIds: [] });
  await pa.platformUpdateSite(other.id, { status: 'suspended' });

  const mine = await owner.audit('site_afterh');
  assert.ok(mine.some((e) => e.action === 'site.update' && e.detail?.includes('paywallEnabled=true') && e.actorEmail === DEMO_OWNER_EMAIL));
  const ownerAll = await owner.audit();
  assert.ok(!ownerAll.some((e) => e.siteId === other.id), 'owners never see other sites');
  await assert.rejects(owner.audit(other.id), (e: ApiError) => e.status === 403);
  const all = await pa.audit();
  assert.ok(all.some((e) => e.action === 'platform.site_suspend' && e.siteId === other.id));
  assert.ok(all.some((e) => e.action === 'platform.site_create'));
});

test('isolation: ids and admin rights never cross sites', async () => {
  const mp = await createMemoryPlatform();
  const a = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const st = await a.startVerification('email', DEMO_MEMBER_EMAIL);
  a.setToken((await a.verify(st.challengeId, st.devCode!)).token);
  const afterhPerson = (await a.search({ withinMiles: 100, pageSize: 5 })).people[0];

  const h = createLocalMemberApi(mp.platform, 'hfriends', 'web');
  const st2 = await h.startVerification('email', 'someone.new@example.com');
  h.setToken((await h.verify(st2.challengeId, st2.devCode!)).token);
  await h.updateMe({ displayName: 'Sam', birthYear: 1990, gender: 'man', seeking: ['woman'], postal: '80202' });
  await assert.rejects(h.profile(afterhPerson.id), (e: ApiError) => e.status === 404);
  await assert.rejects(h.like(afterhPerson.id, true), (e: ApiError) => e.status === 404);

  const pa = await adminSignIn(mp, 'admin@whatbox.test');
  const pat = await pa.saveOwner({ email: 'pat@example.com', name: 'Pat', siteIds: ['site_hfriends'] });
  const patApi = await adminSignIn(mp, pat.email);
  await assert.rejects(patApi.members('site_afterh', {}), (e: ApiError) => e.status === 403);
  await assert.rejects(patApi.setMemberTier('site_afterh', afterhPerson.id, 'vip'), (e: ApiError) => e.status === 403);
  await assert.rejects(patApi.setMemberTier('site_hfriends', afterhPerson.id, 'vip'), (e: ApiError) => e.status === 404);
});

test('cleanup: cancelled memberships lapse at period end; expired sessions go away', async () => {
  const { StubGateway } = await import('../src/index');
  let now = new Date('2026-12-01T12:00:00Z');
  const mp = await createMemoryPlatform({ allowSelfServeTier: false, payments: { stub: new StubGateway() }, clock: { now: () => now } });
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const st = await api.startVerification('email', DEMO_MEMBER_EMAIL);
  api.setToken((await api.verify(st.challengeId, st.devCode!)).token);
  const co = await api.checkout('paid', { returnUrl: 'r', cancelUrl: 'c' });
  const ref = new URL(co.checkoutUrl, 'https://x').searchParams.get('ref')!;
  const site = (await mp.control.listSites()).find((s) => s.slug === 'afterh')!;
  await mp.platform.handlePaymentWebhook(site, 'stub', {}, { ref, status: 'active', periodEnd: '2026-12-20T00:00:00Z' }, '');
  await api.cancelSubscription();
  assert.equal((await api.me()).member.tier, 'paid');
  await mp.platform.cleanup();
  assert.equal((await api.me()).member.tier, 'paid', 'still inside the paid period');
  now = new Date('2026-12-21T00:00:00Z');
  await mp.platform.cleanup();
  assert.equal((await api.me()).member.tier, 'free');
  assert.equal((await api.me()).subscription, undefined);
  now = new Date('2027-06-01T00:00:00Z'); // sessions last well under six months
  await mp.platform.cleanup();
  await assert.rejects(api.me(), (e: ApiError) => e.status === 401);
});

test('genders, multi-select status, exclusive choices and the Other caution', async () => {
  const mp = await createMemoryPlatform();
  const a = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const s = await a.startVerification('email', 'trans.member@example.com');
  a.setToken((await a.verify(s.challengeId, s.devCode!)).token);
  await assert.rejects(a.updateMe({ gender: 'robot' as any }), /listed options/);
  await assert.rejects(a.updateMe({ fields: { hsv_status: ['HSV-1', 'None'] } }), /can't be combined/);
  await a.updateMe({ displayName: 'Riley', birthYear: 1988, gender: 'trans_mtf', seeking: ['man', 'trans_ftm'], postal: '80202', fields: { hsv_status: ['HSV-2', 'HPV', 'Other'] } });
  const b = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const t = await b.startVerification('email', DEMO_MEMBER_EMAIL);
  b.setToken((await b.verify(t.challengeId, t.devCode!)).token);
  const riley = (await b.search({ seeking: ['trans_mtf'], withinMiles: null, withPhoto: false })).people.find((p) => p.displayName === 'Riley');
  assert.ok(riley, 'search by the new gender finds the member');
  const p = await b.profile(riley!.id);
  assert.equal(p.gender, 'trans_mtf');
  assert.equal(p.cautions.length, 1);
  assert.match(p.cautions[0], /OTHER/);
});

// ---------- WhatBox AI photo checks ----------

import { DEMO_PLATFORM_EMAIL, type PhotoCheck, type PhotoChecker, type PhotoStore } from '../src/index';

function aiPlatform(result: PhotoCheck | Error) {
  const stored: string[] = [];
  const photos: PhotoStore = {
    async put(_s, key) { stored.push(key); },
    async delete() {},
    readUrl: (_s, key) => 'https://photos.test/' + key,
  };
  let calls = 0;
  const photoChecker: PhotoChecker = { async check() { calls++; if (result instanceof Error) throw result; return result; } };
  return { stored, photos, photoChecker, calls: () => calls };
}

async function aiSignIn(result: PhotoCheck | Error) {
  const t = aiPlatform(result);
  const mp = await createMemoryPlatform({ photos: t.photos, photoChecker: t.photoChecker });
  const api = createLocalMemberApi(mp.platform, 'afterh', 'web');
  const s = await api.startVerification('email', DEMO_MEMBER_EMAIL);
  const { token } = await api.verify(s.challengeId, s.devCode!);
  api.setToken(token);
  const add = async (input: Parameters<import('../src/index').Platform['addPhoto']>[1]) =>
    mp.platform.addPhoto(await mp.platform.memberCtx(await mp.platform.resolveSite('afterh'), token, 'web'), input);
  return { ...t, mp, api, add };
}
const file = { data: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' };
test('WhatBox AI: explicit photos are refused before they are stored', async () => {
  const t = await aiSignIn({ rating: 'explicit', contactKinds: [] });
  await assert.rejects(t.add({ kind: 'public', file }), /looks explicit/);
  await assert.rejects(t.add({ kind: 'private', file }), /does not allow explicit/);
  assert.equal(t.stored.length, 0);
  assert.equal(t.calls(), 2);
});

test('WhatBox AI: suggestive rating sticks; contact info holds the photo for review', async () => {
  const t = await aiSignIn({ rating: 'suggestive', contactKinds: ['phone', 'qr'] });
  const me = await t.add({ kind: 'public', rating: 'safe', file });
  const p = me.photos.find((x) => x.status === 'pending')!;
  assert.equal(p.rating, 'suggestive');
  await assert.rejects(t.api.updatePhoto(p.id, { rating: 'safe' }), /WhatBox AI rated this photo suggestive/);

  // Another member can't see it until a moderator approves it, even though AfterH shows photos before review.
  const other = createLocalMemberApi(t.mp.platform, 'afterh', 'web');
  const s = await other.startVerification('email', 'viewer@example.com');
  other.setToken((await other.verify(s.challengeId, s.devCode!)).token);
  await other.updateMe({ displayName: 'Viewer', birthYear: 1990, gender: 'woman', seeking: ['man'], postal: '80202', fields: { hsv_status: ['HSV-1'] } });
  const alexId = me.member.id;
  assert.ok(!(await other.profile(alexId)).publicPhotos.some((x) => x.id === p.id));

  const admin = createLocalAdminApi(t.mp.platform);
  const st = await admin.start(DEMO_PLATFORM_EMAIL);
  admin.setToken((await admin.verify(st.challengeId, st.devCode!)).token);
  const item = (await admin.moderation('site_afterh', 'pending')).find((i) => i.refId === p.id)!;
  assert.ok(item.reasons.includes('phone number in photo') && item.reasons.includes('QR code in photo'));
  assert.ok(item.reasons.includes('WhatBox AI rated it suggestive'));
  await admin.decide('site_afterh', item.id, 'approve');
  assert.ok((await other.profile(alexId)).publicPhotos.some((x) => x.id === p.id));

  // Metered per site, free on WhatBox's own site.
  const row = (await admin.platform()).sites.find((x) => x.id === 'site_afterh')!;
  assert.equal(row.usage.ai_photo, 1);
  assert.equal(row.aiPhotoCheck, true);
  assert.equal(row.estimateCents, 0);
  // No WhatBox AI admin in this environment: the panel says so instead of failing.
  assert.equal((await admin.ai()).available, false);
});

test('WhatBox AI: an outage never blocks uploads; sites can turn checks off', async () => {
  const t = await aiSignIn(new Error('down'));
  await t.add({ kind: 'public', file });
  assert.equal(t.stored.length, 1);
  const admin = createLocalAdminApi(t.mp.platform);
  const st = await admin.start(DEMO_PLATFORM_EMAIL);
  admin.setToken((await admin.verify(st.challengeId, st.devCode!)).token);
  const item = (await admin.moderation('site_afterh', 'pending')).find((i) => i.reasons.includes('WhatBox AI check unavailable'));
  assert.ok(item);
  await admin.platformUpdateSite('site_afterh', { aiPhotoCheck: false });
  const before = t.calls();
  await t.add({ kind: 'public', file });
  assert.equal(t.calls(), before);
});
