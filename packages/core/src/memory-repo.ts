// In-memory repositories. Used by tests and by the browser preview, where state is
// snapshotted to localStorage. Each site gets its own MemorySiteRepo instance, mirroring
// the one-database-per-site layout of production.
import type { AdminChallenge, AdminSession, ControlRepo, MemberQuery, MemberSession, SiteRepo } from './repo';
import type {
  AdminUser, Block, Favorite, Pass, ContactOptIn, ContentPage, Like, Member, Message, ModerationItem, Photo,
  PrivateAccess, Report, ReviewStatus, Site, VerificationChallenge, View,
} from './types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export interface ControlSnapshot { sites: Site[]; admins: AdminUser[]; sessions: AdminSession[] }

export class MemoryControlRepo implements ControlRepo {
  sites: Site[] = [];
  admins: AdminUser[] = [];
  sessions: AdminSession[] = [];

  constructor(snap?: Partial<ControlSnapshot>) {
    if (snap) Object.assign(this, clone(snap));
  }
  snapshot(): ControlSnapshot {
    return clone({ sites: this.sites, admins: this.admins, sessions: this.sessions });
  }
  async listSites() { return clone(this.sites); }
  async getSite(id: string) { return clone(this.sites.find((s) => s.id === id) ?? null); }
  async findSite(h: string) {
    const host = h.toLowerCase().replace(/^www\./, '').split(':')[0];
    return clone(this.sites.find((s) => s.slug === host || s.domains.includes(host)) ?? null);
  }
  async saveSite(site: Site) {
    const i = this.sites.findIndex((s) => s.id === site.id);
    if (i >= 0) this.sites[i] = clone(site);
    else this.sites.push(clone(site));
  }
  async getAdmin(id: string) { return clone(this.admins.find((a) => a.id === id) ?? null); }
  async getAdminByEmail(email: string) {
    return clone(this.admins.find((a) => a.email.toLowerCase() === email.toLowerCase()) ?? null);
  }
  async saveAdminSession(s: AdminSession) { this.sessions.push(clone(s)); }
  async getAdminSession(token: string) { return clone(this.sessions.find((s) => s.token === token) ?? null); }
  async deleteAdminSession(token: string) { this.sessions = this.sessions.filter((s) => s.token !== token); }
  private challenges = new Map<string, AdminChallenge>();
  private counters = new Map<string, { window: number; n: number }>();
  async saveAdminChallenge(c: AdminChallenge) { this.challenges.set(c.id, clone(c)); }
  async getAdminChallenge(id: string) { return clone(this.challenges.get(id) ?? null); }
  async deleteAdminChallenge(id: string) { this.challenges.delete(id); }
  async hit(key: string, windowSeconds: number, nowIso: string) {
    const window = Math.floor(Date.parse(nowIso) / 1000 / windowSeconds);
    const c = this.counters.get(key);
    const n = c && c.window === window ? c.n + 1 : 1;
    this.counters.set(key, { window, n });
    return n;
  }
}

export interface SiteSnapshot {
  members: Member[]; photos: Photo[]; access: PrivateAccess[]; likes: Like[]; views: View[];
  blocks: Block[]; passes: Pass[]; favorites: Favorite[]; messages: Message[]; optins: ContactOptIn[]; reports: Report[];
  moderation: ModerationItem[]; pages: ContentPage[]; challenges: VerificationChallenge[];
  sessions: MemberSession[];
}

export class MemorySiteRepo implements SiteRepo {
  d: SiteSnapshot = {
    members: [], photos: [], access: [], likes: [], views: [], blocks: [], passes: [], favorites: [], messages: [], optins: [],
    reports: [], moderation: [], pages: [], challenges: [], sessions: [],
  };
  constructor(snap?: Partial<SiteSnapshot>) {
    if (snap) Object.assign(this.d, clone(snap));
    this.d.passes ??= [];
    this.d.favorites ??= [];
  }
  snapshot(): SiteSnapshot { return clone(this.d); }

  private upsert<T>(list: T[], item: T, match: (x: T) => boolean) {
    const i = list.findIndex(match);
    if (i >= 0) list[i] = clone(item);
    else list.push(clone(item));
  }

  async getMember(id: string) { return clone(this.d.members.find((m) => m.id === id) ?? null); }
  async getMembers(ids: string[]) {
    const set = new Set(ids);
    return clone(this.d.members.filter((m) => set.has(m.id)));
  }
  async findMemberByHash(kind: 'email' | 'phone' | 'identity', hash: string) {
    const m = this.d.members.find((x) => (kind === 'identity' ? x.identityHashes?.includes(hash) : (kind === 'email' ? x.emailHash : x.phoneHash) === hash));
    return clone(m ?? null);
  }
  async deleteMember(id: string) {
    const d = this.d;
    const pair = (a: string, b: string) => a === id || b === id;
    d.members = d.members.filter((m) => m.id !== id);
    d.photos = d.photos.filter((p) => p.memberId !== id);
    d.access = d.access.filter((x) => !pair(x.ownerId, x.viewerId));
    d.likes = d.likes.filter((x) => !pair(x.fromId, x.toId));
    d.passes = d.passes.filter((x) => !pair(x.fromId, x.toId));
    d.favorites = d.favorites.filter((x) => !pair(x.fromId, x.toId));
    d.views = d.views.filter((x) => !pair(x.viewerId, x.viewedId));
    d.blocks = d.blocks.filter((x) => !pair(x.blockerId, x.blockedId));
    d.messages = d.messages.filter((x) => !pair(x.fromId, x.toId));
    d.optins = d.optins.filter((x) => !pair(x.memberId, x.otherId));
    d.reports = d.reports.filter((x) => !pair(x.reporterId, x.targetId));
    d.moderation = d.moderation.filter((x) => x.memberId !== id);
    d.sessions = d.sessions.filter((x) => x.memberId !== id);
  }
  async saveMember(m: Member) { this.upsert(this.d.members, m, (x) => x.id === m.id); }
  async queryMembers(q: MemberQuery) {
    const ex = new Set(q.excludeIds);
    return clone(
      this.d.members.filter((m) =>
        m.status === 'active' &&
        !ex.has(m.id) &&
        (!q.onlyComplete || m.profileComplete) &&
        (!q.genders?.length || q.genders.includes(m.gender)) &&
        (q.birthYearMin == null || m.birthYear >= q.birthYearMin) &&
        (q.birthYearMax == null || m.birthYear <= q.birthYearMax) &&
        (!q.activeSince || m.lastActiveAt >= q.activeSince) &&
        (!q.bbox || (m.lat >= q.bbox.minLat && m.lat <= q.bbox.maxLat && m.lng >= q.bbox.minLng && m.lng <= q.bbox.maxLng)),
      ),
    );
  }
  async listAllMembers(limit: number, offset: number, search?: string) {
    let rows = [...this.d.members].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((m) => m.displayName.toLowerCase().includes(s) || m.city.toLowerCase().includes(s));
    }
    return { total: rows.length, rows: clone(rows.slice(offset, offset + limit)) };
  }

  async listPhotos(memberId: string) {
    return clone(this.d.photos.filter((p) => p.memberId === memberId).sort((a, b) => a.sort - b.sort));
  }
  async listPhotosFor(ids: string[]) {
    const set = new Set(ids);
    return clone(this.d.photos.filter((p) => set.has(p.memberId)).sort((a, b) => a.sort - b.sort));
  }
  async getPhoto(id: string) { return clone(this.d.photos.find((p) => p.id === id) ?? null); }
  async savePhoto(p: Photo) { this.upsert(this.d.photos, p, (x) => x.id === p.id); }
  async deletePhoto(id: string) { this.d.photos = this.d.photos.filter((p) => p.id !== id); }

  async getAccess(o: string, v: string) {
    return clone(this.d.access.find((a) => a.ownerId === o && a.viewerId === v) ?? null);
  }
  async saveAccess(a: PrivateAccess) {
    this.upsert(this.d.access, a, (x) => x.ownerId === a.ownerId && x.viewerId === a.viewerId);
  }
  async listAccessForOwner(o: string) { return clone(this.d.access.filter((a) => a.ownerId === o)); }
  async listAccessForViewer(v: string) { return clone(this.d.access.filter((a) => a.viewerId === v)); }

  async addLike(l: Like) {
    const i = this.d.likes.findIndex((x) => x.fromId === l.fromId && x.toId === l.toId);
    if (i < 0) this.d.likes.push(clone(l));
    else if (l.vip && !this.d.likes[i].vip) this.d.likes[i] = clone(l);
  }
  async addPass(p: Pass) {
    this.upsert(this.d.passes, p, (x) => x.fromId === p.fromId && x.toId === p.toId);
  }
  async setFavorite(f: Favorite, on: boolean) {
    this.d.favorites = this.d.favorites.filter((x) => !(x.fromId === f.fromId && x.toId === f.toId));
    if (on) this.d.favorites.push(clone(f));
  }
  async listFavoritesFrom(id: string) { return clone(this.d.favorites.filter((f) => f.fromId === id)); }
  async listPassesFrom(id: string, since: string) {
    return clone(this.d.passes.filter((p) => p.fromId === id && p.at >= since));
  }
  async removeLike(f: string, t: string) {
    this.d.likes = this.d.likes.filter((x) => !(x.fromId === f && x.toId === t));
  }
  async listLikesTo(id: string) { return clone(this.d.likes.filter((l) => l.toId === id)); }
  async listLikesFrom(id: string) { return clone(this.d.likes.filter((l) => l.fromId === id)); }
  async recordView(v: View) {
    this.upsert(this.d.views, v, (x) => x.viewerId === v.viewerId && x.viewedId === v.viewedId);
  }
  async listViewsOf(id: string) { return clone(this.d.views.filter((v) => v.viewedId === id)); }
  async addBlock(b: Block) {
    if (!this.d.blocks.some((x) => x.blockerId === b.blockerId && x.blockedId === b.blockedId)) this.d.blocks.push(clone(b));
  }
  async removeBlock(a: string, b: string) {
    this.d.blocks = this.d.blocks.filter((x) => !(x.blockerId === a && x.blockedId === b));
  }
  async listBlocksInvolving(id: string) {
    return clone(this.d.blocks.filter((b) => b.blockerId === id || b.blockedId === id));
  }

  async saveMessage(m: Message) { this.upsert(this.d.messages, m, (x) => x.id === m.id); }
  async getMessage(id: string) { return clone(this.d.messages.find((m) => m.id === id) ?? null); }
  async listMessagesInvolving(id: string) {
    return clone(this.d.messages.filter((m) => m.fromId === id || m.toId === id).sort((a, b) => a.at.localeCompare(b.at)));
  }
  async listMessagesBetween(a: string, b: string) {
    return clone(
      this.d.messages
        .filter((m) => (m.fromId === a && m.toId === b) || (m.fromId === b && m.toId === a))
        .sort((x, y) => x.at.localeCompare(y.at)),
    );
  }
  async listMessagesFromSince(f: string, since: string) {
    return clone(this.d.messages.filter((m) => m.fromId === f && m.at >= since));
  }
  async markRead(toId: string, fromId: string, at: string) {
    for (const m of this.d.messages) if (m.toId === toId && m.fromId === fromId && !m.readAt && !m.held) m.readAt = at;
  }
  async addOptIn(o: ContactOptIn) {
    if (!this.d.optins.some((x) => x.memberId === o.memberId && x.otherId === o.otherId)) this.d.optins.push(clone(o));
  }
  async listOptIns(a: string, b: string) {
    return clone(this.d.optins.filter((o) => (o.memberId === a && o.otherId === b) || (o.memberId === b && o.otherId === a)));
  }

  async saveReport(r: Report) { this.d.reports.push(clone(r)); }
  async countReports(t: string) { return this.d.reports.filter((r) => r.targetId === t).length; }
  async saveModeration(i: ModerationItem) { this.upsert(this.d.moderation, i, (x) => x.id === i.id); }
  async getModeration(id: string) { return clone(this.d.moderation.find((m) => m.id === id) ?? null); }
  async listModeration(status: ReviewStatus | 'all') {
    return clone(
      this.d.moderation
        .filter((m) => status === 'all' || m.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async listPages() { return clone(this.d.pages); }
  async getPage(slug: string) { return clone(this.d.pages.find((p) => p.slug === slug) ?? null); }
  async savePage(p: ContentPage) { this.upsert(this.d.pages, p, (x) => x.slug === p.slug); }
  async deletePage(slug: string) { this.d.pages = this.d.pages.filter((p) => p.slug !== slug); }

  async saveChallenge(c: VerificationChallenge) { this.upsert(this.d.challenges, c, (x) => x.id === c.id); }
  async getChallenge(id: string) { return clone(this.d.challenges.find((c) => c.id === id) ?? null); }
  async saveSession(s: MemberSession) { this.d.sessions.push(clone(s)); }
  async getSession(t: string) { return clone(this.d.sessions.find((s) => s.token === t) ?? null); }
  async deleteSession(t: string) { this.d.sessions = this.d.sessions.filter((s) => s.token !== t); }

  async stats(nowIso: string) {
    const now = Date.parse(nowIso);
    const day = new Date(now - 86_400_000).toISOString();
    const week = new Date(now - 7 * 86_400_000).toISOString();
    return {
      members: this.d.members.length,
      activeToday: this.d.members.filter((m) => m.lastActiveAt >= day).length,
      newThisWeek: this.d.members.filter((m) => m.createdAt >= week).length,
      paid: this.d.members.filter((m) => m.tier === 'paid' || m.tier === 'vip').length,
      messagesToday: this.d.messages.filter((m) => m.at >= day).length,
    };
  }
}
