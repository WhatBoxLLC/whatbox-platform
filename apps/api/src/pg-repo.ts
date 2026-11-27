// PostgreSQL implementations of the core repositories.
// PgControlRepo talks to the shared control database; each PgSiteRepo talks to one site's own database.
import type {
  AdminChallenge, AdminSession, AdminUser, Block, ContactOptIn, ContentPage, ControlRepo, Favorite, Like, Pass, Member, MemberQuery, MemberSession,
  Message, ModerationItem, Photo, PrivateAccess, PushToken, Report, ReviewStatus, Site, SiteRepo, Subscription, UsageKind, VerificationChallenge, View,
} from '@whatbox/core';
import type { Pool } from 'pg';

const docs = <T>(rows: { doc: T }[]) => rows.map((r) => r.doc);

export class PgControlRepo implements ControlRepo {
  constructor(private db: Pool) {}
  async listSites() { return docs<Site>((await this.db.query('SELECT doc FROM sites ORDER BY slug')).rows); }
  async getSite(id: string) { return (await this.db.query('SELECT doc FROM sites WHERE id=$1', [id])).rows[0]?.doc ?? null; }
  async findSite(h: string) {
    const host = h.toLowerCase().replace(/^www\./, '').split(':')[0];
    const r = await this.db.query('SELECT doc FROM sites WHERE slug=$1 OR $1 = ANY(domains) LIMIT 1', [host]);
    return r.rows[0]?.doc ?? null;
  }
  async saveSite(site: Site) {
    await this.db.query(
      `INSERT INTO sites (id, slug, domains, db_name, key_ref, doc) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET slug=$2, domains=$3, doc=$6, updated_at=now()`,
      [site.id, site.slug, site.domains, siteDbName(site.slug), 'site-key-' + site.slug, site],
    );
  }
  async listAdmins() { return docs<AdminUser>((await this.db.query('SELECT doc FROM admins ORDER BY email')).rows); }
  async saveAdmin(a: AdminUser) {
    await this.db.query('INSERT INTO admins (id, email, doc) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET email=$2, doc=$3', [a.id, a.email, a]);
  }
  async deleteAdmin(id: string) { await this.db.query('DELETE FROM admins WHERE id=$1', [id]); }
  async getAdmin(id: string) { return (await this.db.query('SELECT doc FROM admins WHERE id=$1', [id])).rows[0]?.doc ?? null; }
  async getAdminByEmail(email: string) {
    return (await this.db.query('SELECT doc FROM admins WHERE lower(email)=lower($1)', [email])).rows[0]?.doc ?? null;
  }
  async saveAdminSession(s: AdminSession) {
    await this.db.query('INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1,$2,$3)', [s.token, s.adminId, s.expiresAt]);
  }
  async getAdminSession(token: string) {
    const r = (await this.db.query('SELECT token, admin_id, expires_at FROM admin_sessions WHERE token=$1', [token])).rows[0];
    return r ? { token: r.token, adminId: r.admin_id, expiresAt: new Date(r.expires_at).toISOString() } : null;
  }
  async deleteAdminSession(token: string) { await this.db.query('DELETE FROM admin_sessions WHERE token=$1', [token]); }
  async saveAdminChallenge(c: AdminChallenge) {
    await this.db.query(
      `INSERT INTO admin_challenges (id, admin_id, code_hash, expires_at, attempts) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET attempts=$5`,
      [c.id, c.adminId, c.codeHash, c.expiresAt, c.attempts],
    );
  }
  async getAdminChallenge(id: string): Promise<AdminChallenge | null> {
    const r = (await this.db.query('SELECT * FROM admin_challenges WHERE id=$1', [id])).rows[0];
    return r ? { id: r.id, adminId: r.admin_id, codeHash: r.code_hash, expiresAt: new Date(r.expires_at).toISOString(), attempts: r.attempts } : null;
  }
  async deleteAdminChallenge(id: string) { await this.db.query('DELETE FROM admin_challenges WHERE id=$1', [id]); }
  async hit(key: string, windowSeconds: number, nowIso: string) {
    const win = Math.floor(Date.parse(nowIso) / 1000 / windowSeconds);
    const r = await this.db.query(
      `INSERT INTO rate_limits (key, win, n) VALUES ($1,$2,1) ON CONFLICT (key, win) DO UPDATE SET n = rate_limits.n + 1 RETURNING n`,
      [key, win],
    );
    return r.rows[0].n as number;
  }
  async recordUsage(siteId: string, kind: UsageKind, qty: number, at: string) {
    await this.db.query('INSERT INTO usage_events (site_id, kind, qty, at) VALUES ($1,$2,$3,$4)', [siteId, kind, qty, at]);
  }
  async usageSummary(since: string, until?: string) {
    const r = await this.db.query(
      'SELECT site_id, kind, SUM(qty)::int AS qty FROM usage_events WHERE at >= $1 AND ($2::timestamptz IS NULL OR at < $2) GROUP BY site_id, kind ORDER BY site_id, kind',
      [since, until ?? null],
    );
    return r.rows.map((x: any) => ({ siteId: x.site_id, kind: x.kind as UsageKind, qty: x.qty as number }));
  }
}

export function siteDbName(slug: string) {
  return 'whatbox_site_' + slug.replace(/[^a-z0-9_]/g, '_');
}

export class PgSiteRepo implements SiteRepo {
  constructor(private db: Pool) {}

  // ---- members
  async getMember(id: string) { return (await this.db.query('SELECT doc FROM members WHERE id=$1', [id])).rows[0]?.doc ?? null; }
  async getMembers(ids: string[]) {
    if (!ids.length) return [];
    return docs<Member>((await this.db.query('SELECT doc FROM members WHERE id = ANY($1)', [ids])).rows);
  }
  async findMemberByHash(kind: 'email' | 'phone' | 'identity', hash: string) {
    if (kind === 'identity') return (await this.db.query('SELECT doc FROM members WHERE $1 = ANY(identity_hashes)', [hash])).rows[0]?.doc ?? null;
    const col = kind === 'email' ? 'email_hash' : 'phone_hash';
    return (await this.db.query(`SELECT doc FROM members WHERE ${col}=$1`, [hash])).rows[0]?.doc ?? null;
  }
  // Rows that point at the member cascade (photos, likes, messages, sessions...). Reports and
  // moderation items keep the id only inside text/json, so they are removed explicitly.
  async deleteMember(id: string) {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM reports WHERE reporter_id=$1 OR target_id=$1', [id]);
      await c.query(`DELETE FROM moderation WHERE doc->>'memberId'=$1`, [id]);
      await c.query('DELETE FROM members WHERE id=$1', [id]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async saveMember(m: Member) {
    await this.db.query(
      `INSERT INTO members (id,status,profile_complete,display_name,gender,birth_year,lat,lng,city,premium,email_hash,phone_hash,created_at,last_active_at,doc,identity_hashes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET status=$2,profile_complete=$3,display_name=$4,gender=$5,birth_year=$6,lat=$7,lng=$8,city=$9,
         premium=$10,email_hash=$11,phone_hash=$12,last_active_at=$14,doc=$15,identity_hashes=$16`,
      [m.id, m.status, m.profileComplete, m.displayName, m.gender, m.birthYear, m.lat, m.lng, m.city, m.tier === 'paid' || m.tier === 'vip',
        m.emailHash ?? null, m.phoneHash ?? null, m.createdAt, m.lastActiveAt, m, m.identityHashes ?? []],
    );
  }
  async queryMembers(q: MemberQuery) {
    const where = [`status='active'`, `NOT (id = ANY($1))`];
    const args: unknown[] = [q.excludeIds];
    const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace('?', '$' + args.length)); };
    if (q.onlyComplete) where.push('profile_complete');
    if (q.genders?.length) add('gender = ANY(?)', q.genders);
    if (q.birthYearMin != null) add('birth_year >= ?', q.birthYearMin);
    if (q.birthYearMax != null) add('birth_year <= ?', q.birthYearMax);
    if (q.activeSince) add('last_active_at >= ?', q.activeSince);
    if (q.bbox) {
      add('lat >= ?', q.bbox.minLat); add('lat <= ?', q.bbox.maxLat);
      add('lng >= ?', q.bbox.minLng); add('lng <= ?', q.bbox.maxLng);
    }
    const sql = `SELECT doc FROM members WHERE ${where.join(' AND ')} ORDER BY last_active_at DESC LIMIT 2000`;
    return docs<Member>((await this.db.query(sql, args)).rows);
  }
  async listAllMembers(limit: number, offset: number, search?: string) {
    const args: unknown[] = [limit, offset];
    let where = '';
    if (search) { args.push('%' + search.toLowerCase() + '%'); where = 'WHERE lower(display_name) LIKE $3 OR lower(city) LIKE $3'; }
    const rows = (await this.db.query(`SELECT doc, count(*) OVER() AS total FROM members ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, args)).rows;
    return { total: Number(rows[0]?.total ?? 0), rows: rows.map((r) => r.doc as Member) };
  }

  // ---- photos
  async listPhotos(memberId: string) { return docs<Photo>((await this.db.query('SELECT doc FROM photos WHERE member_id=$1 ORDER BY sort', [memberId])).rows); }
  async listPhotosFor(ids: string[]) {
    if (!ids.length) return [];
    return docs<Photo>((await this.db.query('SELECT doc FROM photos WHERE member_id = ANY($1) ORDER BY sort', [ids])).rows);
  }
  async getPhoto(id: string) { return (await this.db.query('SELECT doc FROM photos WHERE id=$1', [id])).rows[0]?.doc ?? null; }
  async savePhoto(p: Photo) {
    await this.db.query(
      `INSERT INTO photos (id, member_id, kind, rating, status, sort, doc) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET kind=$3, rating=$4, status=$5, sort=$6, doc=$7`,
      [p.id, p.memberId, p.kind, p.rating, p.status, p.sort, p],
    );
  }
  async deletePhoto(id: string) { await this.db.query('DELETE FROM photos WHERE id=$1', [id]); }

  // ---- private access
  private access = (r: any): PrivateAccess => ({ ownerId: r.owner_id, viewerId: r.viewer_id, status: r.status, updatedAt: iso(r.updated_at) });
  async getAccess(o: string, v: string) {
    const r = (await this.db.query('SELECT * FROM private_access WHERE owner_id=$1 AND viewer_id=$2', [o, v])).rows[0];
    return r ? this.access(r) : null;
  }
  async saveAccess(a: PrivateAccess) {
    await this.db.query(
      `INSERT INTO private_access (owner_id, viewer_id, status, updated_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (owner_id, viewer_id) DO UPDATE SET status=$3, updated_at=$4`, [a.ownerId, a.viewerId, a.status, a.updatedAt]);
  }
  async listAccessForOwner(o: string) { return (await this.db.query('SELECT * FROM private_access WHERE owner_id=$1', [o])).rows.map(this.access); }
  async listAccessForViewer(v: string) { return (await this.db.query('SELECT * FROM private_access WHERE viewer_id=$1', [v])).rows.map(this.access); }

  // ---- likes, views, blocks
  async addLike(l: Like) {
    await this.db.query(
      `INSERT INTO likes (from_id,to_id,at,vip) VALUES ($1,$2,$3,$4)
       ON CONFLICT (from_id,to_id) DO UPDATE SET vip = likes.vip OR EXCLUDED.vip,
         at = CASE WHEN EXCLUDED.vip AND NOT likes.vip THEN EXCLUDED.at ELSE likes.at END`,
      [l.fromId, l.toId, l.at, !!l.vip],
    );
  }
  async savePushToken(t: PushToken) {
    await this.db.query(
      'INSERT INTO push_tokens (token, member_id, platform, at) VALUES ($1,$2,$3,$4) ON CONFLICT (token) DO UPDATE SET member_id=$2, platform=$3, at=$4',
      [t.token, t.memberId, t.platform, t.at],
    );
  }
  async listPushTokens(id: string) {
    return (await this.db.query('SELECT * FROM push_tokens WHERE member_id=$1', [id])).rows
      .map((r: any): PushToken => ({ token: r.token, memberId: r.member_id, platform: r.platform, at: iso(r.at) }));
  }
  async saveSubscription(x: Subscription) {
    await this.db.query(
      `INSERT INTO subscriptions (id, member_id, provider, provider_ref, tier, status, period_end, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET provider_ref=$4, status=$6, period_end=$7, updated_at=$9`,
      [x.id, x.memberId, x.provider, x.providerRef, x.tier, x.status, x.currentPeriodEnd ?? null, x.createdAt, x.updatedAt],
    );
  }
  async getSubscription(id: string) {
    const r = (await this.db.query('SELECT * FROM subscriptions WHERE id=$1', [id])).rows[0];
    return r ? subRow(r) : null;
  }
  async findSubscriptionByRef(provider: string, ref: string) {
    if (!ref) return null;
    const r = (await this.db.query('SELECT * FROM subscriptions WHERE provider=$1 AND provider_ref=$2 LIMIT 1', [provider, ref])).rows[0];
    return r ? subRow(r) : null;
  }
  async listSubscriptions(memberId: string) {
    return (await this.db.query('SELECT * FROM subscriptions WHERE member_id=$1 ORDER BY created_at', [memberId])).rows.map(subRow);
  }
  // True the first time an event id is seen.
  async claimWebhookEvent(provider: string, eventId: string) {
    const r = await this.db.query('INSERT INTO webhook_events (provider, event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [provider, eventId]);
    return r.rowCount === 1;
  }
  async deletePushToken(token: string) { await this.db.query('DELETE FROM push_tokens WHERE token=$1', [token]); }
  async setFavorite(f: Favorite, on: boolean) {
    if (on) await this.db.query('INSERT INTO favorites (from_id,to_id,at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [f.fromId, f.toId, f.at]);
    else await this.db.query('DELETE FROM favorites WHERE from_id=$1 AND to_id=$2', [f.fromId, f.toId]);
  }
  async listFavoritesFrom(id: string) {
    return (await this.db.query('SELECT * FROM favorites WHERE from_id=$1 ORDER BY at DESC', [id])).rows
      .map((r: any): Favorite => ({ fromId: r.from_id, toId: r.to_id, at: iso(r.at) }));
  }
  async addPass(p: Pass) {
    await this.db.query('INSERT INTO passes (from_id,to_id,at) VALUES ($1,$2,$3) ON CONFLICT (from_id,to_id) DO UPDATE SET at=EXCLUDED.at', [p.fromId, p.toId, p.at]);
  }
  async listPassesFrom(id: string, since: string) {
    return (await this.db.query('SELECT * FROM passes WHERE from_id=$1 AND at >= $2::timestamptz', [id, since])).rows
      .map((r: any): Pass => ({ fromId: r.from_id, toId: r.to_id, at: iso(r.at) }));
  }
  async removeLike(f: string, t: string) { await this.db.query('DELETE FROM likes WHERE from_id=$1 AND to_id=$2', [f, t]); }
  async listLikesTo(id: string) { return (await this.db.query('SELECT * FROM likes WHERE to_id=$1', [id])).rows.map(like); }
  async listLikesFrom(id: string) { return (await this.db.query('SELECT * FROM likes WHERE from_id=$1', [id])).rows.map(like); }
  async recordView(v: View) {
    await this.db.query('INSERT INTO views VALUES ($1,$2,$3) ON CONFLICT (viewer_id, viewed_id) DO UPDATE SET at=$3', [v.viewerId, v.viewedId, v.at]);
  }
  async listViewsOf(id: string) {
    return (await this.db.query('SELECT * FROM views WHERE viewed_id=$1', [id])).rows.map((r) => ({ viewerId: r.viewer_id, viewedId: r.viewed_id, at: iso(r.at) }));
  }
  async addBlock(b: Block) { await this.db.query('INSERT INTO blocks VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [b.blockerId, b.blockedId, b.at]); }
  async removeBlock(a: string, b: string) { await this.db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [a, b]); }
  async listBlocksInvolving(id: string) {
    return (await this.db.query('SELECT * FROM blocks WHERE blocker_id=$1 OR blocked_id=$1', [id])).rows
      .map((r) => ({ blockerId: r.blocker_id, blockedId: r.blocked_id, at: iso(r.at) }));
  }

  // ---- messaging
  async saveMessage(m: Message) {
    await this.db.query(
      `INSERT INTO messages (id, from_id, to_id, at, held, read_at, doc) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET at=$4, held=$5, read_at=$6, doc=$7`,
      [m.id, m.fromId, m.toId, m.at, m.held, m.readAt ?? null, m],
    );
  }
  async getMessage(id: string) { return (await this.db.query('SELECT doc FROM messages WHERE id=$1', [id])).rows[0]?.doc ?? null; }
  async listMessagesInvolving(id: string) {
    return docs<Message>((await this.db.query('SELECT doc FROM messages WHERE from_id=$1 OR to_id=$1 ORDER BY at', [id])).rows);
  }
  async listMessagesBetween(a: string, b: string) {
    return docs<Message>((await this.db.query(
      'SELECT doc FROM messages WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1) ORDER BY at', [a, b])).rows);
  }
  async listMessagesFromSince(f: string, since: string) {
    return docs<Message>((await this.db.query('SELECT doc FROM messages WHERE from_id=$1 AND at >= $2', [f, since])).rows);
  }
  async markRead(toId: string, fromId: string, at: string) {
    await this.db.query(
      `UPDATE messages SET read_at=$3, doc = jsonb_set(doc, '{readAt}', to_jsonb($4::text))
       WHERE to_id=$1 AND from_id=$2 AND read_at IS NULL AND NOT held`, [toId, fromId, at, at]);
  }
  async addOptIn(o: ContactOptIn) { await this.db.query('INSERT INTO contact_optins VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [o.memberId, o.otherId, o.at]); }
  async listOptIns(a: string, b: string) {
    return (await this.db.query(
      'SELECT * FROM contact_optins WHERE (member_id=$1 AND other_id=$2) OR (member_id=$2 AND other_id=$1)', [a, b])).rows
      .map((r) => ({ memberId: r.member_id, otherId: r.other_id, at: iso(r.at) }));
  }

  // ---- safety
  async saveReport(r: Report) {
    await this.db.query('INSERT INTO reports VALUES ($1,$2,$3,$4,$5)', [r.id, r.reporterId, r.targetId, r.reason, r.at]);
  }
  async countReports(t: string) { return Number((await this.db.query('SELECT count(*) FROM reports WHERE target_id=$1', [t])).rows[0].count); }
  async saveModeration(i: ModerationItem) {
    await this.db.query(
      'INSERT INTO moderation (id, status, created_at, doc) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET status=$2, doc=$4',
      [i.id, i.status, i.createdAt, i]);
  }
  async getModeration(id: string) { return (await this.db.query('SELECT doc FROM moderation WHERE id=$1', [id])).rows[0]?.doc ?? null; }
  async listModeration(status: ReviewStatus | 'all') {
    const r = status === 'all'
      ? await this.db.query('SELECT doc FROM moderation ORDER BY created_at DESC LIMIT 200')
      : await this.db.query('SELECT doc FROM moderation WHERE status=$1 ORDER BY created_at DESC LIMIT 200', [status]);
    return docs<ModerationItem>(r.rows);
  }

  // ---- pages
  async listPages() { return docs<ContentPage>((await this.db.query('SELECT doc FROM pages ORDER BY slug')).rows); }
  async getPage(slug: string) { return (await this.db.query('SELECT doc FROM pages WHERE slug=$1', [slug])).rows[0]?.doc ?? null; }
  async savePage(p: ContentPage) { await this.db.query('INSERT INTO pages VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET doc=$2', [p.slug, p]); }
  async deletePage(slug: string) { await this.db.query('DELETE FROM pages WHERE slug=$1', [slug]); }

  // ---- auth
  async saveChallenge(c: VerificationChallenge) {
    await this.db.query('INSERT INTO challenges VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET doc=$3', [c.id, c.expiresAt, c]);
  }
  async getChallenge(id: string) { return (await this.db.query('SELECT doc FROM challenges WHERE id=$1', [id])).rows[0]?.doc ?? null; }
  async saveSession(s: MemberSession) {
    await this.db.query('INSERT INTO sessions VALUES ($1,$2,$3)', [s.token, s.memberId, s.expiresAt]);
  }
  async getSession(t: string) {
    const r = (await this.db.query('SELECT * FROM sessions WHERE token=$1', [t])).rows[0];
    return r ? { token: r.token, memberId: r.member_id, expiresAt: iso(r.expires_at) } : null;
  }
  async deleteSession(t: string) { await this.db.query('DELETE FROM sessions WHERE token=$1', [t]); }

  async stats(nowIso: string) {
    const r = (await this.db.query(
      `SELECT
         (SELECT count(*) FROM members) AS members,
         (SELECT count(*) FROM members WHERE last_active_at >= $1::timestamptz - interval '1 day') AS active_today,
         (SELECT count(*) FROM members WHERE created_at >= $1::timestamptz - interval '7 days') AS new_week,
         (SELECT count(*) FROM members WHERE premium) AS paid,
         (SELECT count(*) FROM messages WHERE at >= $1::timestamptz - interval '1 day') AS messages_today`, [nowIso])).rows[0];
    return {
      members: Number(r.members), activeToday: Number(r.active_today), newThisWeek: Number(r.new_week),
      paid: Number(r.paid), messagesToday: Number(r.messages_today),
    };
  }
}

function iso(v: Date | string) { return new Date(v).toISOString(); }
function like(r: any): Like { return { fromId: r.from_id, toId: r.to_id, at: iso(r.at), ...(r.vip ? { vip: true } : {}) }; }

function subRow(r: any): Subscription {
  return {
    id: r.id, memberId: r.member_id, provider: r.provider, providerRef: r.provider_ref, tier: r.tier, status: r.status,
    currentPeriodEnd: r.period_end ? iso(r.period_end) : undefined, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}
