// Loads placeholder demo data. Never point this at a production database.
// It wipes and reloads the demo sites' member data, so run it only on purpose.
// In Azure dev it runs as the `seed` job (ALLOW_DEMO_SEED=true); prod has no seed job.
// SEED_ADMIN_EMAIL, if set, adds that person as a Platform Admin so they can sign in for real.
import { DEMO_MEMBER_EMAIL, seedAdmins, seedSite, seedSites, SiteCrypto } from '@whatbox/core';
import { closePools, keyProvider, pool } from '../src/db';
import { config } from '../src/config';
import { PgControlRepo, PgSiteRepo, siteDbName } from '../src/pg-repo';

(async () => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Refusing to seed in production.');
  const now = new Date();
  const control = new PgControlRepo(pool(config.controlDb));
  const keys = keyProvider();
  for (const a of seedAdmins()) await control.saveAdmin(a);
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (adminEmail) {
    const existing = await control.getAdminByEmail(adminEmail);
    await control.saveAdmin({ id: existing?.id ?? 'adm_seed_platform', email: adminEmail, name: existing?.name ?? 'Platform Admin', role: 'platform', siteIds: [] });
    console.log('platform admin added');
  }
  for (const site of seedSites(now)) {
    await control.saveSite(site);
    const db = pool(siteDbName(site.slug));
    await db.query('TRUNCATE members, photos, private_access, likes, passes, favorites, views, blocks, messages, contact_optins, reports, moderation, pages, events, event_rsvps, challenges, sessions, subscriptions, webhook_events CASCADE');
    const repo = new PgSiteRepo(db);
    const crypto = new SiteCrypto(keys, site.id);
    const s = seedSite(site, now, { demoMemberHash: { emailHash: await crypto.lookupHash(DEMO_MEMBER_EMAIL), emailEnc: await crypto.encrypt(DEMO_MEMBER_EMAIL) } });
    for (const m of s.members) await repo.saveMember(m);
    for (const p of s.photos) await repo.savePhoto(p);
    for (const l of s.likes) await repo.addLike(l);
    for (const v of s.views) await repo.recordView(v);
    for (const m of s.messages) await repo.saveMessage(m);
    for (const a of s.access) await repo.saveAccess(a);
    for (const i of s.moderation) await repo.saveModeration(i);
    for (const p of s.pages) await repo.savePage(p);
    for (const e of s.events) await repo.saveEvent(e);
    for (const r of s.rsvps) await repo.setRsvp(r);
    console.log(`seeded ${site.slug}: ${s.members.length} members`);
  }
  await closePools();
})().catch((e) => { console.error(e); process.exit(1); });
