// The platform's use cases. Both the HTTP API and the in-browser preview call these,
// so the rules a member hits are the same everywhere.
import { DevKeyProvider, type KeyProvider, randomCode, randomId, SiteCrypto } from './crypto';
import { lookupPostal } from './geo';
import type { ControlRepo, Clock, Notifier, SiteRepo } from './repo';
import { systemClock } from './repo';
import {
  ageFromBirthYear, checkPhotoAllowed, CODE_MAX_ATTEMPTS, CODE_TTL_MS, formatHeight, maskContactInfo, milesBetween,
  ONLINE_WINDOW_MS, PHOTO_LIMITS, effectivePerms, tierFor, photoVisibleTo, RuleError, scoreCandidate, screenMessage,
} from './rules';
import type {
  AccessStatus, ActivityList, ActivityPerson, AdminMemberRow, DiscoverCard, Units, Tier, TierPerms, MembershipSettings, Message, AdminUser, ClientPlatform, ContentPage, ConversationSummary,
  ConversationView, Gender, Member, MemberCard, MemberProfile, MemberStatus, ModerationView, MyProfile, Photo,
  PhotoKind, PhotoRating, PhotoView, ProfileFieldDef, PublicSite, SearchFilters, SearchResult, Site,
  SiteSettings, SiteStats, SiteTheme,
} from './types';

export interface PlatformDeps {
  control: ControlRepo;
  siteRepo(siteId: string): SiteRepo | Promise<SiteRepo>;
  keys?: KeyProvider;
  notifier: Notifier;
  clock?: Clock;
  exposeDevCodes?: boolean; // return codes to the client (dev and preview only)
  onChange?: () => void; // preview persistence hook
}

export interface MemberCtx {
  site: Site;
  repo: SiteRepo;
  me: Member;
  platform: ClientPlatform;
}

export interface ProfilePatch {
  displayName?: string;
  birthYear?: number;
  gender?: Gender;
  seeking?: Gender[];
  ageMin?: number;
  ageMax?: number;
  postal?: string;
  about?: string;
  fields?: Member['fields'];
  hideExplicit?: boolean;
  units?: Units;
}

export interface AccessRow { member: MemberCard; status: AccessStatus; updatedAt: string }

const SESSION_TTL_MS = 30 * 86_400_000;
const NAME_MAX = 24;
const ABOUT_MAX = 2000;
const MESSAGE_MAX = 2000;

function maskTarget(channel: 'email' | 'phone', target: string): string {
  if (channel === 'email') {
    const [u, d] = target.split('@');
    return (u?.slice(0, 1) ?? '') + '•••@' + (d ?? '');
  }
  const digits = target.replace(/\D/g, '');
  return '(•••) ••• ••' + digits.slice(-2);
}

function normalizeTarget(channel: 'email' | 'phone', raw: string): string {
  const t = raw.trim();
  if (channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) throw new RuleError('bad_email', 'Enter a valid email address.');
    return t.toLowerCase();
  }
  const digits = t.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new RuleError('bad_phone', 'Enter a valid mobile number.');
  return digits.length === 10 ? '+1' + digits : '+' + digits;
}

export class Platform {
  private keys: KeyProvider;
  private clock: Clock;
  private adminChallenges = new Map<string, { adminId: string; code: string; expiresAt: number }>();

  constructor(private deps: PlatformDeps) {
    this.keys = deps.keys ?? new DevKeyProvider('dev-only-master-key');
    this.clock = deps.clock ?? systemClock;
  }

  private now() { return this.clock.now(); }
  private iso() { return this.now().toISOString(); }
  private changed() { this.deps.onChange?.(); }
  private async repo(site: Site) { return this.deps.siteRepo(site.id); }
  crypto(site: Site) { return new SiteCrypto(this.keys, site.id); }

  // ---------------- Sites and public content ----------------

  async resolveSite(hostOrSlug: string): Promise<Site> {
    const site = await this.deps.control.findSite(hostOrSlug);
    if (!site) throw new RuleError('site_not_found', 'Unknown site.', 404);
    return site;
  }

  publicSite(site: Site): PublicSite {
    return {
      id: site.id, slug: site.slug, name: site.name, tagline: site.tagline, audience: site.audience,
      theme: site.theme, mode: site.settings.mode, fields: [...site.fields].sort((a, b) => a.order - b.order),
      membership: site.settings.membership,
      billingDescriptor: site.settings.billingDescriptor,
      explicitPhotosAllowed: site.settings.explicitPhotosAllowed,
      publicTeasers: site.settings.mode !== 'sensitive' && site.settings.publicTeasers,
      units: site.settings.units,
    };
  }

  async publicPages(site: Site): Promise<ContentPage[]> {
    const repo = await this.repo(site);
    return (await repo.listPages()).filter((p) => p.published);
  }

  async publicPage(site: Site, slug: string): Promise<ContentPage | null> {
    const repo = await this.repo(site);
    const p = await repo.getPage(slug);
    return p && p.published ? p : null;
  }

  // ---------------- Verification and sessions ----------------

  async startVerification(site: Site, channel: 'email' | 'phone', rawTarget: string) {
    const target = normalizeTarget(channel, rawTarget);
    const repo = await this.repo(site);
    const crypto = this.crypto(site);
    const code = randomCode();
    const id = randomId('vc_');
    await repo.saveChallenge({
      id, channel,
      targetHash: await crypto.lookupHash(target),
      targetEnc: await crypto.encrypt(target),
      codeHash: await crypto.lookupHash('code:' + id + ':' + code),
      expiresAt: new Date(this.now().getTime() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      consumed: false,
    });
    await this.deps.notifier.sendCode({ site, channel, target, code });
    this.changed();
    return { challengeId: id, sentTo: maskTarget(channel, target), devCode: this.deps.exposeDevCodes ? code : undefined };
  }

  async verifyCode(site: Site, challengeId: string, code: string) {
    const repo = await this.repo(site);
    const crypto = this.crypto(site);
    const c = await repo.getChallenge(challengeId);
    if (!c || c.consumed) throw new RuleError('code_invalid', 'That code is no longer valid. Request a new one.');
    if (Date.parse(c.expiresAt) < this.now().getTime()) throw new RuleError('code_expired', 'That code expired. Request a new one.');
    if (c.attempts >= CODE_MAX_ATTEMPTS) throw new RuleError('code_locked', 'Too many tries. Request a new code.', 429);
    const ok = (await crypto.lookupHash('code:' + c.id + ':' + code.trim())) === c.codeHash;
    if (!ok) {
      c.attempts++;
      await repo.saveChallenge(c);
      this.changed();
      throw new RuleError('code_wrong', `That code doesn't match. ${CODE_MAX_ATTEMPTS - c.attempts} tries left.`);
    }
    c.consumed = true;
    await repo.saveChallenge(c);

    let member = await repo.findMemberByHash(c.channel, c.targetHash);
    const isNew = !member;
    if (!member) {
      const now = this.iso();
      member = {
        id: randomId('m_'), displayName: '', verifiedAt: now, profileComplete: false,
        birthYear: this.now().getUTCFullYear() - 30, gender: 'woman', seeking: ['man'], ageMin: 25, ageMax: 50,
        city: '', region: '', postal: '', lat: 0, lng: 0, about: '', fields: {}, status: 'active',
        tier: 'free', hideExplicit: true, createdAt: now, lastActiveAt: now,
      };
      if (c.channel === 'email') { member.emailHash = c.targetHash; member.emailEnc = c.targetEnc; }
      else { member.phoneHash = c.targetHash; member.phoneEnc = c.targetEnc; }
      await repo.saveMember(member);
    }
    if (member.status === 'suspended') throw new RuleError('suspended', 'This account is suspended.', 403);
    const token = site.slug + '.' + randomId();
    await repo.saveSession({ token, memberId: member.id, expiresAt: new Date(this.now().getTime() + SESSION_TTL_MS).toISOString() });
    this.changed();
    return { token, isNew: isNew || !member.profileComplete };
  }

  async memberCtx(site: Site, token: string | null | undefined, platform: ClientPlatform): Promise<MemberCtx> {
    if (!token || !token.startsWith(site.slug + '.')) throw new RuleError('signed_out', 'Please sign in.', 401);
    const repo = await this.repo(site);
    const s = await repo.getSession(token);
    if (!s || Date.parse(s.expiresAt) < this.now().getTime()) throw new RuleError('signed_out', 'Please sign in.', 401);
    const me = await repo.getMember(s.memberId);
    if (!me) throw new RuleError('signed_out', 'Please sign in.', 401);
    if (me.status === 'suspended') throw new RuleError('suspended', 'This account is suspended.', 403);
    // touch activity at most once a minute
    if (this.now().getTime() - Date.parse(me.lastActiveAt) > 60_000) {
      me.lastActiveAt = this.iso();
      await repo.saveMember(me);
    }
    return { site, repo, me, platform };
  }

  async signOut(site: Site, token: string) {
    const repo = await this.repo(site);
    await repo.deleteSession(token);
    this.changed();
  }

  private requireComplete(ctx: MemberCtx) {
    if (!ctx.me.profileComplete) throw new RuleError('profile_incomplete', 'Finish your profile first.', 403);
  }

  // ---------------- Views ----------------

  private photoView(ctx: MemberCtx, p: Photo, opts: { owner: boolean; unlocked?: boolean }): PhotoView {
    const base: PhotoView = { id: p.id, kind: p.kind, rating: p.rating, status: p.status };
    if (!opts.owner && p.kind === 'private' && !opts.unlocked) return { ...base, placeholder: 'locked' };
    const vis = photoVisibleTo({
      rating: p.rating, platform: ctx.platform, viewerHidesExplicit: opts.owner ? false : ctx.me.hideExplicit,
    });
    if (vis !== 'show') return { ...base, placeholder: vis };
    return { ...base, url: p.url, tone: p.tone };
  }

  private visibleToOthers(site: Site, p: Photo) {
    if (p.status === 'rejected') return false;
    if (p.status === 'pending' && site.settings.photoModeration === 'pre') return false;
    return true;
  }

  private headline(site: Site, m: Member): string {
    const firstLine = m.about.split(/(?<=[.!?])\s/)[0] ?? '';
    return firstLine.length > 70 ? firstLine.slice(0, 67) + '…' : firstLine;
  }

  private async cards(ctx: MemberCtx, members: Member[]): Promise<MemberCard[]> {
    if (!members.length) return [];
    const photos = await ctx.repo.listPhotosFor(members.map((m) => m.id));
    const liked = new Set((await ctx.repo.listLikesFrom(ctx.me.id)).map((l) => l.toId));
    const now = this.now();
    return members.map((m) => {
      const mine = photos.filter((p) => p.memberId === m.id && this.visibleToOthers(ctx.site, p));
      const main = mine.find((p) => p.kind === 'main');
      return {
        id: m.id, displayName: m.displayName, age: ageFromBirthYear(m.birthYear, now), city: m.city, region: m.region,
        miles: ctx.me.lat || ctx.me.lng ? Math.round(milesBetween(ctx.me, m)) : null,
        online: now.getTime() - Date.parse(m.lastActiveAt) < ONLINE_WINDOW_MS,
        photoCount: mine.filter((p) => p.kind !== 'private').length,
        mainPhoto: main ? this.photoView(ctx, main, { owner: false }) : undefined,
        headline: this.headline(ctx.site, m),
        likedByMe: liked.has(m.id),
        isNew: now.getTime() - Date.parse(m.createdAt) < ctx.site.settings.discover.newMemberDays * 86_400_000,
      };
    });
  }

  private async card(ctx: MemberCtx, m: Member) { return (await this.cards(ctx, [m]))[0]; }

  private async blockedIds(ctx: MemberCtx): Promise<Set<string>> {
    const blocks = await ctx.repo.listBlocksInvolving(ctx.me.id);
    return new Set(blocks.map((b) => (b.blockerId === ctx.me.id ? b.blockedId : b.blockerId)));
  }

  private async other(ctx: MemberCtx, id: string): Promise<Member> {
    const m = await ctx.repo.getMember(id);
    if (!m || m.status !== 'active' || !m.profileComplete || m.id === ctx.me.id) throw new RuleError('not_found', 'Member not found.', 404);
    const blocked = await ctx.repo.listBlocksInvolving(ctx.me.id);
    if (blocked.some((b) => b.blockerId === id && b.blockedId === ctx.me.id)) throw new RuleError('not_found', 'Member not found.', 404);
    return m;
  }

  // ---------------- My profile and photos ----------------

  async myProfile(ctx: MemberCtx): Promise<MyProfile> {
    const { emailHash, emailEnc, phoneHash, phoneEnc, ...rest } = ctx.me;
    const crypto = this.crypto(ctx.site);
    const contactRaw = emailEnc ? await crypto.decrypt(emailEnc) : phoneEnc ? await crypto.decrypt(phoneEnc) : '';
    const photos = await ctx.repo.listPhotos(ctx.me.id);
    return {
      member: {
        ...rest, contact: contactRaw ? maskTarget(emailEnc ? 'email' : 'phone', contactRaw) : '',
        unitsResolved: this.units(ctx),
      },
      perms: this.perms(ctx), paywallEnabled: ctx.site.settings.membership.paywallEnabled,
      photos: photos.map((p) => this.photoView(ctx, p, { owner: true })),
      limits: PHOTO_LIMITS,
    };
  }

  async updateProfile(ctx: MemberCtx, patch: ProfilePatch): Promise<MyProfile> {
    const m = ctx.me;
    const year = this.now().getUTCFullYear();
    if (patch.displayName !== undefined) {
      const n = patch.displayName.trim();
      if (n.length < 2 || n.length > NAME_MAX) throw new RuleError('bad_name', `Display name must be 2 to ${NAME_MAX} characters.`);
      if (/\d{3,}|@|https?:/i.test(n)) throw new RuleError('bad_name', 'Display names cannot contain contact details.');
      m.displayName = n;
    }
    if (patch.birthYear !== undefined) {
      if (year - patch.birthYear < 18) throw new RuleError('too_young', 'You must be 18 or older.');
      if (year - patch.birthYear > 100) throw new RuleError('bad_age', 'Check your birth year.');
      m.birthYear = patch.birthYear;
    }
    if (patch.gender) m.gender = patch.gender;
    if (patch.seeking) {
      if (!patch.seeking.length) throw new RuleError('bad_seeking', 'Choose who you want to meet.');
      m.seeking = patch.seeking;
    }
    if (patch.ageMin !== undefined) m.ageMin = Math.max(18, patch.ageMin);
    if (patch.ageMax !== undefined) m.ageMax = Math.min(99, patch.ageMax);
    if (m.ageMin > m.ageMax) [m.ageMin, m.ageMax] = [m.ageMax, m.ageMin];
    if (patch.postal !== undefined) {
      const loc = lookupPostal(patch.postal);
      if (!loc) throw new RuleError('bad_postal', 'We could not find that ZIP code. Try 80202 in this prototype.');
      Object.assign(m, { postal: patch.postal.trim(), lat: loc.lat, lng: loc.lng, city: loc.city, region: loc.region });
    }
    if (patch.about !== undefined) {
      if (patch.about.length > ABOUT_MAX) throw new RuleError('about_long', `Keep it under ${ABOUT_MAX} characters.`);
      m.about = patch.about.trim();
      if (m.profileComplete && m.about) await this.flagProfileText(ctx, m.about);
    }
    if (patch.fields) {
      for (const [key, value] of Object.entries(patch.fields)) {
        const def = ctx.site.fields.find((f) => f.key === key);
        if (!def) throw new RuleError('bad_field', `Unknown field ${key}.`);
        validateField(def, value);
        m.fields[key] = value;
      }
    }
    if (patch.hideExplicit !== undefined) m.hideExplicit = patch.hideExplicit;
    if (patch.units === 'imperial' || patch.units === 'metric') m.units = patch.units;

    if (!m.profileComplete) {
      const missing = ctx.site.fields.filter((f) => f.required && (m.fields[f.key] === undefined || m.fields[f.key] === ''));
      if (m.displayName && m.postal && !missing.length) m.profileComplete = true;
    }
    await ctx.repo.saveMember(m);
    this.changed();
    return this.myProfile(ctx);
  }

  private async flagProfileText(ctx: MemberCtx, text: string) {
    const screen = screenMessage({ body: text, site: ctx.site, isNewConversation: false, recentFromSender: [], now: this.now() });
    const reasons = [...screen.reasons];
    if (screen.flags.includes('contact_info')) reasons.push('contact info in profile');
    if (reasons.length) {
      await ctx.repo.saveModeration({
        id: randomId('mod_'), kind: 'profile', refId: ctx.me.id, memberId: ctx.me.id,
        summary: text.slice(0, 280), reasons, status: 'pending', createdAt: this.iso(),
      });
    }
  }

  async addPhoto(ctx: MemberCtx, input: { kind: PhotoKind; rating?: PhotoRating; url?: string; tone?: [string, string] }) {
    const rating = input.rating ?? 'safe';
    const existing = await ctx.repo.listPhotos(ctx.me.id);
    checkPhotoAllowed(ctx.site, input.kind, rating, existing);
    if (input.kind === 'main') {
      const oldMain = existing.find((p) => p.kind === 'main');
      if (oldMain) {
        if (existing.filter((p) => p.kind === 'public').length >= PHOTO_LIMITS.public) await ctx.repo.deletePhoto(oldMain.id);
        else await ctx.repo.savePhoto({ ...oldMain, kind: 'public', sort: Date.now() });
      }
    }
    const photo: Photo = {
      id: randomId('ph_'), memberId: ctx.me.id, kind: input.kind, rating, status: 'pending',
      url: input.url, tone: input.tone, sort: Date.now(), createdAt: this.iso(),
    };
    await ctx.repo.savePhoto(photo);
    await ctx.repo.saveModeration({
      id: randomId('mod_'), kind: 'photo', refId: photo.id, memberId: ctx.me.id,
      summary: `New ${input.kind} photo, marked ${rating}`, reasons: ['new upload'], status: 'pending', createdAt: this.iso(),
    });
    this.changed();
    return this.myProfile(ctx);
  }

  async updatePhoto(ctx: MemberCtx, id: string, patch: { kind?: PhotoKind; rating?: PhotoRating }) {
    const photos = await ctx.repo.listPhotos(ctx.me.id);
    const p = photos.find((x) => x.id === id);
    if (!p) throw new RuleError('not_found', 'Photo not found.', 404);
    const kind = patch.kind ?? p.kind;
    const rating = patch.rating ?? p.rating;
    if (kind !== p.kind || rating !== p.rating) {
      const others = photos.filter((x) => x.id !== id);
      checkPhotoAllowed(ctx.site, kind, rating, others);
      if (kind === 'main') {
        const oldMain = others.find((x) => x.kind === 'main');
        if (oldMain) await ctx.repo.savePhoto({ ...oldMain, kind: p.kind === 'private' ? 'public' : p.kind });
      }
      await ctx.repo.savePhoto({ ...p, kind, rating });
      this.changed();
    }
    return this.myProfile(ctx);
  }

  async deletePhoto(ctx: MemberCtx, id: string) {
    const p = await ctx.repo.getPhoto(id);
    if (!p || p.memberId !== ctx.me.id) throw new RuleError('not_found', 'Photo not found.', 404);
    await ctx.repo.deletePhoto(id);
    this.changed();
    return this.myProfile(ctx);
  }

  // ---------------- Private photo access ----------------

  async requestAccess(ctx: MemberCtx, ownerId: string) {
    this.requireComplete(ctx);
    await this.other(ctx, ownerId);
    if (!this.perms(ctx).requestPrivatePhotos) throw this.upgradeError(ctx, (p) => p.requestPrivatePhotos, 'request private photos');
    const existing = await ctx.repo.getAccess(ownerId, ctx.me.id);
    if (existing?.status === 'granted') return 'granted' as const;
    if (existing?.status === 'denied' || existing?.status === 'revoked') {
      throw new RuleError('access_closed', 'This member has not shared their private photos with you.');
    }
    await ctx.repo.saveAccess({ ownerId, viewerId: ctx.me.id, status: 'requested', updatedAt: this.iso() });
    this.changed();
    return 'requested' as const;
  }

  async decideAccess(ctx: MemberCtx, viewerId: string, action: 'grant' | 'deny' | 'revoke') {
    const existing = await ctx.repo.getAccess(ctx.me.id, viewerId);
    if (action !== 'grant' && !existing) throw new RuleError('not_found', 'No request from this member.', 404);
    const status: AccessStatus = action === 'grant' ? 'granted' : action === 'deny' ? 'denied' : 'revoked';
    await ctx.repo.saveAccess({ ownerId: ctx.me.id, viewerId, status, updatedAt: this.iso() });
    this.changed();
    return this.accessLists(ctx);
  }

  async accessLists(ctx: MemberCtx): Promise<{ incoming: AccessRow[]; outgoing: AccessRow[] }> {
    const inc = await ctx.repo.listAccessForOwner(ctx.me.id);
    const out = await ctx.repo.listAccessForViewer(ctx.me.id);
    const ids = [...inc.map((a) => a.viewerId), ...out.map((a) => a.ownerId)];
    const members = (await ctx.repo.getMembers(ids)).filter((m) => m.status === 'active');
    const cards = new Map((await this.cards(ctx, members)).map((c) => [c.id, c]));
    const row = (id: string, a: { status: AccessStatus; updatedAt: string }) =>
      cards.get(id) ? { member: cards.get(id)!, status: a.status, updatedAt: a.updatedAt } : null;
    return {
      incoming: inc.map((a) => row(a.viewerId, a)).filter(Boolean).sort(byUpdated) as AccessRow[],
      outgoing: out.map((a) => row(a.ownerId, a)).filter(Boolean).sort(byUpdated) as AccessRow[],
    };
  }

  // ---------------- Browse ----------------

  async search(ctx: MemberCtx, f: SearchFilters): Promise<SearchResult> {
    this.requireComplete(ctx);
    const now = this.now();
    const year = now.getUTCFullYear();
    const ageMin = f.ageMin ?? ctx.me.ageMin;
    const ageMax = f.ageMax ?? ctx.me.ageMax;
    const within = f.withinMiles === undefined ? 50 : f.withinMiles;
    const blocked = await this.blockedIds(ctx);
    let bbox;
    if (within && (ctx.me.lat || ctx.me.lng)) {
      const dLat = within / 69;
      const dLng = within / (69 * Math.max(0.2, Math.cos((ctx.me.lat * Math.PI) / 180)));
      bbox = { minLat: ctx.me.lat - dLat, maxLat: ctx.me.lat + dLat, minLng: ctx.me.lng - dLng, maxLng: ctx.me.lng + dLng };
    }
    let rows = await ctx.repo.queryMembers({
      excludeIds: [ctx.me.id, ...blocked],
      genders: f.seeking ?? ctx.me.seeking,
      birthYearMin: year - ageMax,
      birthYearMax: year - ageMin,
      activeSince: f.onlineNow ? new Date(now.getTime() - ONLINE_WINDOW_MS).toISOString() : undefined,
      bbox,
      onlyComplete: true,
    });
    if (within && bbox) rows = rows.filter((m) => milesBetween(ctx.me, m) <= within);
    if (f.fields) {
      for (const [key, wanted] of Object.entries(f.fields)) {
        if (!wanted?.length) continue;
        const def = ctx.site.fields.find((d) => d.key === key && d.filterable);
        if (!def) continue;
        rows = rows.filter((m) => {
          const v = m.fields[key];
          if (Array.isArray(v)) return v.some((x) => wanted.includes(x));
          return v !== undefined && wanted.includes(String(v));
        });
      }
    }
    let cards = await this.cards(ctx, rows);
    if (f.withPhoto) cards = cards.filter((c) => c.mainPhoto);
    const byId = new Map(rows.map((m) => [m.id, m]));

    const sort = f.sort ?? 'best';
    const vipFrom = new Set((await ctx.repo.listLikesTo(ctx.me.id)).filter((l) => l.vip).map((l) => l.fromId));
    const score = new Map(cards.map((c) => [c.id, this.score(ctx, byId.get(c.id)!, !!c.mainPhoto, vipFrom.has(c.id))]));
    cards.sort((a, b) => {
      if (sort === 'best') return score.get(b.id)! - score.get(a.id)!;
      if (sort === 'closest') return (a.miles ?? 1e9) - (b.miles ?? 1e9);
      const ma = byId.get(a.id)!, mb = byId.get(b.id)!;
      if (sort === 'newest') return mb.createdAt.localeCompare(ma.createdAt);
      return mb.lastActiveAt.localeCompare(ma.lastActiveAt);
    });
    const pageSize = Math.min(48, f.pageSize ?? 12);
    const page = Math.max(1, f.page ?? 1);
    return { total: cards.length, page, pageSize, people: cards.slice((page - 1) * pageSize, page * pageSize) };
  }

  async profile(ctx: MemberCtx, id: string): Promise<MemberProfile> {
    this.requireComplete(ctx);
    const m = await this.other(ctx, id);
    await ctx.repo.recordView({ viewerId: ctx.me.id, viewedId: m.id, at: this.iso() });
    const card = await this.card(ctx, m);
    const photos = (await ctx.repo.listPhotos(m.id)).filter((p) => this.visibleToOthers(ctx.site, p));
    const access = await ctx.repo.getAccess(m.id, ctx.me.id);
    const unlocked = access?.status === 'granted';
    const blocks = await ctx.repo.listBlocksInvolving(ctx.me.id);
    const details: MemberProfile['details'] = [];
    let interests: string[] = [];
    for (const def of [...ctx.site.fields].sort((a, b) => a.order - b.order)) {
      const v = m.fields[def.key];
      if (v === undefined || v === '' || def.showOnProfile === false) continue;
      if (def.section === 'interests' && Array.isArray(v)) { interests = interests.concat(v); continue; }
      details.push({ key: def.key, label: def.label, value: this.fieldText(ctx, def, v) });
    }
    const lock = await this.messageLock(ctx, m.id);
    const privatePhotos = photos.filter((p) => p.kind === 'private');
    const perms = this.perms(ctx);
    const gallery = photos.filter((p) => p.kind === 'public');
    const ms = ctx.site.settings.membership;
    const hintTier = !perms.seePublicPhotos ? tierFor(ms, (p) => p.seePublicPhotos) : !perms.requestPrivatePhotos ? tierFor(ms, (p) => p.requestPrivatePhotos) : null;
    this.changed();
    return {
      ...card,
      about: m.about, gender: m.gender, seeking: m.seeking, ageMin: m.ageMin, ageMax: m.ageMax, lastActiveAt: m.lastActiveAt,
      details, interests,
      publicPhotos: perms.seePublicPhotos ? gallery.map((p) => this.photoView(ctx, p, { owner: false })) : [],
      publicPhotosLocked: perms.seePublicPhotos ? 0 : gallery.length,
      canRequestPrivate: perms.requestPrivatePhotos,
      upgradeHint: hintTier ? `Upgrade to ${ms.tiers[hintTier].label} to see all of ${m.displayName}'s photos and request private ones.` : undefined,
      tier: this.tierOf(m),
      privatePhotos: privatePhotos.map((p) => this.photoView(ctx, p, { owner: false, unlocked })),
      privatePhotoCount: privatePhotos.length,
      privateAccess: access?.status ?? 'none',
      verified: !!m.verifiedAt,
      blockedByMe: blocks.some((b) => b.blockerId === ctx.me.id && b.blockedId === m.id),
      canMessage: !lock,
      messageLockReason: lock,
    };
  }

  // ---------------- Likes, views, blocks, reports ----------------

  async like(ctx: MemberCtx, id: string, on: boolean) {
    this.requireComplete(ctx);
    await this.other(ctx, id);
    // Priority comes from the sender's tier (VIP by default), not from a per-like purchase.
    const vip = on && this.isPriority(ctx);
    if (on) await ctx.repo.addLike({ fromId: ctx.me.id, toId: id, at: this.iso(), vip: vip || undefined });
    else await ctx.repo.removeLike(ctx.me.id, id);
    this.changed();
    const mutual = on && (await ctx.repo.listLikesFrom(id)).some((l) => l.toId === ctx.me.id);
    return { liked: on, mutual, vip };
  }

  async pass(ctx: MemberCtx, id: string) {
    this.requireComplete(ctx);
    await ctx.repo.addPass({ fromId: ctx.me.id, toId: id, at: this.iso() });
    this.changed();
    return { ok: true };
  }

  private tierOf(m: Member): Tier {
    return m.tier ?? ((m as { premium?: boolean }).premium ? 'paid' : 'free');
  }

  private perms(ctx: MemberCtx): TierPerms {
    return effectivePerms(ctx.site.settings.membership, this.tierOf(ctx.me));
  }

  private isPriority(ctx: MemberCtx) {
    return ctx.site.settings.membership.tiers[this.tierOf(ctx.me)].priorityLikes;
  }

  private upgradeError(ctx: MemberCtx, test: (p: TierPerms) => boolean, what: string) {
    const t = tierFor(ctx.site.settings.membership, test);
    return new RuleError('upgrade_required', t ? `Upgrade to ${ctx.site.settings.membership.tiers[t].label} to ${what}.` : `Your membership can't ${what}.`, 402);
  }

  private canRead(ctx: MemberCtx, msg: Message) {
    return msg.fromId === ctx.me.id || this.perms(ctx).readMessagesFrom.includes(msg.senderTier ?? 'free');
  }

  private units(ctx: MemberCtx): Units {
    return ctx.me.units ?? ctx.site.settings.units;
  }

  private fieldText(ctx: MemberCtx, def: ProfileFieldDef, v: Member['fields'][string]): string {
    if (def.type === 'height' && typeof v === 'number') return formatHeight(v, this.units(ctx));
    return Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
  }

  private score(ctx: MemberCtx, m: Member, hasPhoto: boolean, vipLikedMe: boolean) {
    return scoreCandidate({
      viewer: ctx.me, cand: m, hasPhoto, vipLikedViewer: vipLikedMe, now: this.now(),
      newMemberDays: ctx.site.settings.discover.newMemberDays,
    });
  }

  // Quick review stack: photo one plus a short summary, best candidates first.
  async discover(ctx: MemberCtx, limit = 20): Promise<DiscoverCard[]> {
    this.requireComplete(ctx);
    const now = this.now();
    const year = now.getUTCFullYear();
    const since = new Date(now.getTime() - ctx.site.settings.discover.passCooldownDays * 86_400_000).toISOString();
    const skip = new Set<string>([
      ctx.me.id,
      ...(await this.blockedIds(ctx)),
      ...(await ctx.repo.listLikesFrom(ctx.me.id)).map((l) => l.toId),
      ...(await ctx.repo.listPassesFrom(ctx.me.id, since)).map((p) => p.toId),
    ]);
    const within = 100;
    const dLat = within / 69;
    const dLng = within / (69 * Math.max(0.2, Math.cos((ctx.me.lat * Math.PI) / 180)));
    const rows = await ctx.repo.queryMembers({
      excludeIds: [...skip], genders: ctx.me.seeking, birthYearMin: year - ctx.me.ageMax, birthYearMax: year - ctx.me.ageMin,
      bbox: ctx.me.lat || ctx.me.lng ? { minLat: ctx.me.lat - dLat, maxLat: ctx.me.lat + dLat, minLng: ctx.me.lng - dLng, maxLng: ctx.me.lng + dLng } : undefined,
      onlyComplete: true,
    });
    const vipFrom = new Set((await ctx.repo.listLikesTo(ctx.me.id)).filter((l) => l.vip).map((l) => l.fromId));
    const cards = await this.cards(ctx, rows);
    const photos = await ctx.repo.listPhotosFor(rows.map((r) => r.id));
    const byId = new Map(rows.map((m) => [m.id, m]));
    const seeGallery = this.perms(ctx).seePublicPhotos;
    const out: DiscoverCard[] = cards.map((c) => {
      const m = byId.get(c.id)!;
      const facts: string[] = [];
      let interests: string[] = [];
      for (const def of [...ctx.site.fields].sort((a, b) => a.order - b.order)) {
        const v = m.fields[def.key];
        if (v === undefined || v === '' || def.showOnProfile === false) continue;
        if (def.section === 'interests' && Array.isArray(v)) interests = v.slice(0, 4);
        else if (facts.length < 3 && !def.sensitive) facts.push(this.fieldText(ctx, def, v));
      }
      return {
        ...c,
        summary: m.about.length > 180 ? m.about.slice(0, 177) + '…' : m.about,
        facts, interests,
        publicPhotos: !seeGallery ? [] : photos.filter((p) => p.memberId === m.id && p.kind === 'public' && this.visibleToOthers(ctx.site, p)).slice(0, 3)
          .map((p) => this.photoView(ctx, p, { owner: false })),
        vipLikedMe: vipFrom.has(m.id),
        score: this.score(ctx, m, !!c.mainPhoto, vipFrom.has(m.id)),
      };
    });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  async block(ctx: MemberCtx, id: string, on: boolean) {
    if (on) {
      await ctx.repo.addBlock({ blockerId: ctx.me.id, blockedId: id, at: this.iso() });
      await ctx.repo.removeLike(ctx.me.id, id);
      const a = await ctx.repo.getAccess(ctx.me.id, id);
      if (a?.status === 'granted') await ctx.repo.saveAccess({ ...a, status: 'revoked', updatedAt: this.iso() });
    } else await ctx.repo.removeBlock(ctx.me.id, id);
    this.changed();
    return { blocked: on };
  }

  async report(ctx: MemberCtx, id: string, reason: string) {
    const target = await ctx.repo.getMember(id);
    if (!target) throw new RuleError('not_found', 'Member not found.', 404);
    const r = { id: randomId('rp_'), reporterId: ctx.me.id, targetId: id, reason: reason.slice(0, 500), at: this.iso() };
    await ctx.repo.saveReport(r);
    const count = await ctx.repo.countReports(id);
    await ctx.repo.saveModeration({
      id: randomId('mod_'), kind: 'report', refId: r.id, memberId: id,
      summary: reason.slice(0, 280) || 'No reason given',
      reasons: [`reported by ${ctx.me.displayName}`, `${count} report${count === 1 ? '' : 's'} total`],
      status: 'pending', createdAt: this.iso(),
    });
    this.changed();
    return { ok: true };
  }

  async activity(ctx: MemberCtx, kind: 'likes' | 'views' | 'mine'): Promise<ActivityList> {
    this.requireComplete(ctx);
    const blocked = await this.blockedIds(ctx);
    let entries: { id: string; at: string; vip: boolean }[];
    if (kind === 'likes') entries = (await ctx.repo.listLikesTo(ctx.me.id)).map((l) => ({ id: l.fromId, at: l.at, vip: !!l.vip }));
    else if (kind === 'views') entries = (await ctx.repo.listViewsOf(ctx.me.id)).map((v) => ({ id: v.viewerId, at: v.at, vip: false }));
    else entries = (await ctx.repo.listLikesFrom(ctx.me.id)).map((l) => ({ id: l.toId, at: l.at, vip: !!l.vip }));
    const members = (await ctx.repo.getMembers(entries.map((e) => e.id))).filter((m) => m.status === 'active' && !blocked.has(m.id));
    const byId = new Map(members.map((m) => [m.id, m]));
    entries = entries.filter((e) => byId.has(e.id));
    const perms = this.perms(ctx);
    // A priority like counts as coming from a VIP, so the default Free tier still sees it.
    const canSee = (e: { id: string; vip: boolean }) =>
      kind === 'mine' || (kind === 'views' ? perms.seeWhoViewed : perms.seeLikesFrom.includes(e.vip ? 'vip' : this.tierOf(byId.get(e.id)!)));
    const visible = entries.filter(canSee);
    const hidden = entries.length - visible.length;
    const ms = ctx.site.settings.membership;
    const up = tierFor(ms, (p) => (kind === 'views' ? p.seeWhoViewed : p.seeLikesFrom.length === 3));
    const cards = new Map((await this.cards(ctx, visible.map((e) => byId.get(e.id)!))).map((c) => [c.id, c]));
    const myLikes = new Set((await ctx.repo.listLikesFrom(ctx.me.id)).map((l) => l.toId));
    const year = this.now().getUTCFullYear();
    const people: ActivityPerson[] = visible.map((e) => {
      const m = byId.get(e.id)!;
      const c = cards.get(e.id)!;
      const age = year - m.birthYear;
      return {
        ...c, at: e.at, vip: e.vip,
        fitsMe: ctx.me.seeking.includes(m.gender) && age >= ctx.me.ageMin && age <= ctx.me.ageMax && (c.miles === null || c.miles <= 100),
        serious: !!m.verifiedAt && !!c.mainPhoto && m.about.length >= 60,
        likedBack: myLikes.has(e.id),
      };
    });
    // Busy inboxes: VIP first, then people who fit what I asked for, then serious profiles, newest first within each.
    const rank = (p: ActivityPerson) => (p.vip ? 4 : 0) + (p.fitsMe ? 2 : 0) + (p.serious ? 1 : 0);
    people.sort((a, b) => (kind === 'mine' ? 0 : rank(b) - rank(a)) || b.at.localeCompare(a.at));
    return {
      kind, total: entries.length, vipCount: entries.filter((e) => e.vip).length, hidden, locked: hidden > 0, people,
      upgradeLabel: up ? `${ms.tiers[up].label}${ms.tiers[up].priceLabel ? ' · ' + ms.tiers[up].priceLabel : ''}` : '',
    };
  }

  // Stub checkout. The real build hands off to the site's payment provider and sets the tier on its webhook.
  async setTier(ctx: MemberCtx, tier: Tier) {
    if (!['free', 'paid', 'vip'].includes(tier)) throw new RuleError('bad_tier', 'Unknown membership level.');
    ctx.me.tier = tier;
    delete (ctx.me as { premium?: boolean }).premium;
    await ctx.repo.saveMember(ctx.me);
    this.changed();
    return this.myProfile(ctx);
  }

  // ---------------- Messaging ----------------

  private async messageLock(ctx: MemberCtx, otherId: string): Promise<string | undefined> {
    const blocks = await ctx.repo.listBlocksInvolving(ctx.me.id);
    if (blocks.some((b) => (b.blockerId === ctx.me.id && b.blockedId === otherId) || (b.blockerId === otherId && b.blockedId === ctx.me.id))) {
      return 'You cannot message this member.';
    }
    if (!this.perms(ctx).startConversations) {
      // Free members can reply to anyone whose messages they can read (VIPs by default).
      const thread = await ctx.repo.listMessagesBetween(ctx.me.id, otherId);
      const incoming = thread.filter((m) => m.fromId === otherId && !m.held);
      if (!incoming.some((m) => this.canRead(ctx, m))) {
        const t = tierFor(ctx.site.settings.membership, (p) => p.startConversations);
        const label = t ? ctx.site.settings.membership.tiers[t].label : 'a paid membership';
        return incoming.length
          ? `Upgrade to ${label} to read and answer this message.`
          : `Upgrade to ${label} to start conversations. When a VIP member writes to you, you can always reply free.`;
      }
    }
    return undefined;
  }

  async conversations(ctx: MemberCtx): Promise<ConversationSummary[]> {
    this.requireComplete(ctx);
    const msgs = await ctx.repo.listMessagesInvolving(ctx.me.id);
    const blocked = await this.blockedIds(ctx);
    const byOther = new Map<string, typeof msgs>();
    for (const m of msgs) {
      if (m.held && m.fromId !== ctx.me.id) continue;
      const other = m.fromId === ctx.me.id ? m.toId : m.fromId;
      if (blocked.has(other)) continue;
      if (!byOther.has(other)) byOther.set(other, []);
      byOther.get(other)!.push(m);
    }
    const members = (await ctx.repo.getMembers([...byOther.keys()])).filter((m) => m.status === 'active');
    const cards = await this.cards(ctx, members);
    const out: ConversationSummary[] = [];
    for (const c of cards) {
      const list = byOther.get(c.id)!;
      const last = list[list.length - 1];
      const shared = await this.contactShared(ctx, c.id);
      const sealed = !this.canRead(ctx, last);
      out.push({
        other: c,
        last: { body: sealed ? this.sealedText(ctx) : this.renderBody(last.body, shared.me && shared.them), at: last.at, fromMe: last.fromId === ctx.me.id, sealed },
        unread: list.filter((m) => m.toId === ctx.me.id && !m.readAt).length,
        fromVip: this.tierOf(members.find((m) => m.id === c.id)!) === 'vip',
      });
    }
    return out.sort((a, b) => b.last.at.localeCompare(a.last.at));
  }

  async unreadCount(ctx: MemberCtx) {
    if (!ctx.me.profileComplete) return 0;
    return (await this.conversations(ctx)).reduce((n, c) => n + c.unread, 0);
  }

  private sealedText(ctx: MemberCtx) {
    const t = tierFor(ctx.site.settings.membership, (p) => p.readMessagesFrom.length === 3);
    return `New message. Upgrade to ${t ? ctx.site.settings.membership.tiers[t].label : 'read it'} to read it.`;
  }

  private renderBody(body: string, bothShared: boolean) {
    return bothShared ? body : maskContactInfo(body);
  }

  private async contactShared(ctx: MemberCtx, otherId: string) {
    const opts = await ctx.repo.listOptIns(ctx.me.id, otherId);
    return { me: opts.some((o) => o.memberId === ctx.me.id), them: opts.some((o) => o.memberId === otherId) };
  }

  async conversation(ctx: MemberCtx, otherId: string): Promise<ConversationView> {
    this.requireComplete(ctx);
    const other = await this.other(ctx, otherId);
    let msgs = await ctx.repo.listMessagesBetween(ctx.me.id, otherId);
    // Sealed messages stay unread, so the sender never sees a read receipt for a message that wasn't read.
    if (!msgs.some((m) => m.fromId === otherId && !this.canRead(ctx, m))) {
      await ctx.repo.markRead(ctx.me.id, otherId, this.iso());
      msgs = await ctx.repo.listMessagesBetween(ctx.me.id, otherId);
    }
    const shared = await this.contactShared(ctx, otherId);
    const both = shared.me && shared.them;
    const lock = await this.messageLock(ctx, otherId);
    this.changed();
    return {
      other: await this.card(ctx, other),
      messages: msgs
        .filter((m) => !m.held || m.fromId === ctx.me.id)
        .map((m) => {
          const mine = m.fromId === ctx.me.id;
          const sealed = !this.canRead(ctx, m);
          const fromVip = !mine && m.senderTier === 'vip';
          let notice: string | undefined;
          if (m.held) notice = 'Delivery is paused while our safety team takes a look.';
          else if (mine && !both && m.flags.includes('contact_info')) notice = `Contact details are hidden from ${other.displayName} until you both choose to share.`;
          else if (fromVip && !this.perms(ctx).startConversations) notice = `${other.displayName} is a VIP member, so you can read and reply free.`;
          return {
            id: m.id, fromMe: mine, at: m.at, readAt: m.readAt, held: m.held, notice, sealed, fromVip,
            body: mine ? m.body : sealed ? this.sealedText(ctx) : this.renderBody(m.body, both),
          };
        }),
      contactShared: shared,
      canSend: !lock,
      lockReason: lock,
      otherTier: this.tierOf(other),
      sealedCount: msgs.filter((m) => m.fromId === otherId && !m.held && !this.canRead(ctx, m)).length,
    };
  }

  async send(ctx: MemberCtx, otherId: string, rawBody: string): Promise<ConversationView> {
    this.requireComplete(ctx);
    const body = rawBody.trim();
    if (!body) throw new RuleError('empty', 'Write a message first.');
    if (body.length > MESSAGE_MAX) throw new RuleError('too_long', `Messages can be up to ${MESSAGE_MAX} characters.`);
    const other = await this.other(ctx, otherId);
    const lock = await this.messageLock(ctx, otherId);
    if (lock) throw new RuleError('locked', lock, 403);
    const since = new Date(this.now().getTime() - 86_400_000).toISOString();
    const recent = await ctx.repo.listMessagesFromSince(ctx.me.id, since);
    const thread = await ctx.repo.listMessagesBetween(ctx.me.id, otherId);
    const screen = screenMessage({
      body, site: ctx.site, isNewConversation: !thread.length, recentFromSender: recent, now: this.now(),
    });
    if (screen.reject) throw screen.reject;
    const msg = {
      id: randomId('msg_'), fromId: ctx.me.id, toId: other.id, body, flags: screen.flags, held: screen.hold, at: this.iso(),
      senderTier: this.tierOf(ctx.me),
    };
    await ctx.repo.saveMessage(msg);
    if (screen.hold) {
      await ctx.repo.saveModeration({
        id: randomId('mod_'), kind: 'message', refId: msg.id, memberId: ctx.me.id,
        summary: `To ${other.displayName}`, reasons: screen.reasons, status: 'pending', createdAt: this.iso(),
      });
    }
    this.changed();
    return this.conversation(ctx, otherId);
  }

  async shareContact(ctx: MemberCtx, otherId: string) {
    await this.other(ctx, otherId);
    await ctx.repo.addOptIn({ memberId: ctx.me.id, otherId, at: this.iso() });
    this.changed();
    return this.conversation(ctx, otherId);
  }

  // ---------------- Owner Admin ----------------

  async adminStart(email: string) {
    const admin = await this.deps.control.getAdminByEmail(email.trim());
    // same response either way so the form does not reveal which emails are admins
    const id = randomId('ac_');
    const code = randomCode();
    if (admin) this.adminChallenges.set(id, { adminId: admin.id, code, expiresAt: this.now().getTime() + CODE_TTL_MS });
    return { challengeId: id, devCode: this.deps.exposeDevCodes && admin ? code : undefined };
  }

  async adminVerify(challengeId: string, code: string) {
    const c = this.adminChallenges.get(challengeId);
    if (!c || c.expiresAt < this.now().getTime() || c.code !== code.trim()) throw new RuleError('code_wrong', 'That code does not match.');
    this.adminChallenges.delete(challengeId);
    const token = 'adm.' + randomId();
    await this.deps.control.saveAdminSession({ token, adminId: c.adminId, expiresAt: new Date(this.now().getTime() + SESSION_TTL_MS).toISOString() });
    this.changed();
    return { token };
  }

  async adminFromToken(token: string | null | undefined): Promise<AdminUser> {
    if (!token) throw new RuleError('signed_out', 'Please sign in.', 401);
    const s = await this.deps.control.getAdminSession(token);
    if (!s || Date.parse(s.expiresAt) < this.now().getTime()) throw new RuleError('signed_out', 'Please sign in.', 401);
    const a = await this.deps.control.getAdmin(s.adminId);
    if (!a) throw new RuleError('signed_out', 'Please sign in.', 401);
    return a;
  }

  async adminSites(admin: AdminUser) {
    const all = await this.deps.control.listSites();
    const sites = admin.role === 'platform' ? all : all.filter((s) => admin.siteIds.includes(s.id));
    return sites.map((s) => ({ id: s.id, slug: s.slug, name: s.name, mode: s.settings.mode, accent: s.theme.accent, domain: s.domains[0] }));
  }

  async adminSite(admin: AdminUser, siteId: string): Promise<Site> {
    if (admin.role !== 'platform' && !admin.siteIds.includes(siteId)) throw new RuleError('forbidden', 'You do not manage this site.', 403);
    const s = await this.deps.control.getSite(siteId);
    if (!s) throw new RuleError('not_found', 'Site not found.', 404);
    return s;
  }

  async adminStats(admin: AdminUser, siteId: string): Promise<SiteStats> {
    const site = await this.adminSite(admin, siteId);
    const repo = await this.repo(site);
    const base = await repo.stats(this.iso());
    return { ...base, openModeration: (await repo.listModeration('pending')).length };
  }

  async adminModeration(admin: AdminUser, siteId: string, status: 'pending' | 'approved' | 'rejected' | 'all'): Promise<ModerationView[]> {
    const site = await this.adminSite(admin, siteId);
    const repo = await this.repo(site);
    const items = await repo.listModeration(status);
    const members = new Map((await repo.getMembers(items.map((i) => i.memberId))).map((m) => [m.id, m]));
    const out: ModerationView[] = [];
    for (const i of items) {
      const v: ModerationView = { ...i, memberName: members.get(i.memberId)?.displayName || 'New member' };
      if (i.kind === 'photo') {
        const p = await repo.getPhoto(i.refId);
        if (p) v.photo = { id: p.id, kind: p.kind, rating: p.rating, status: p.status, url: p.url, tone: p.tone };
      }
      if (i.kind === 'message') v.messageBody = (await repo.getMessage(i.refId))?.body;
      out.push(v);
    }
    return out;
  }

  async adminDecide(admin: AdminUser, siteId: string, itemId: string, decision: 'approve' | 'reject') {
    const site = await this.adminSite(admin, siteId);
    const repo = await this.repo(site);
    const item = await repo.getModeration(itemId);
    if (!item) throw new RuleError('not_found', 'Item not found.', 404);
    const status = decision === 'approve' ? 'approved' : 'rejected';
    if (item.kind === 'photo') {
      const p = await repo.getPhoto(item.refId);
      if (p) await repo.savePhoto({ ...p, status });
    } else if (item.kind === 'message') {
      const m = await repo.getMessage(item.refId);
      // approve releases the message to the recipient; reject keeps it held forever
      if (m && decision === 'approve') await repo.saveMessage({ ...m, held: false, at: this.iso() });
    } else if (item.kind === 'report' && decision === 'approve') {
      const m = await repo.getMember(item.memberId);
      if (m) await repo.saveMember({ ...m, status: 'suspended' });
    } else if (item.kind === 'profile' && decision === 'reject') {
      const m = await repo.getMember(item.memberId);
      if (m) await repo.saveMember({ ...m, about: '' });
    }
    await repo.saveModeration({ ...item, status, decidedAt: this.iso(), decidedBy: admin.email });
    this.changed();
    return this.adminModeration(admin, siteId, 'pending');
  }

  async adminMembers(admin: AdminUser, siteId: string, opts: { search?: string; page?: number }) {
    const site = await this.adminSite(admin, siteId);
    const repo = await this.repo(site);
    const page = Math.max(1, opts.page ?? 1);
    const { total, rows } = await repo.listAllMembers(25, (page - 1) * 25, opts.search);
    const photos = await repo.listPhotosFor(rows.map((r) => r.id));
    const out: AdminMemberRow[] = [];
    for (const m of rows) {
      out.push({
        id: m.id, displayName: m.displayName || '(unfinished signup)', age: ageFromBirthYear(m.birthYear, this.now()),
        city: m.city, status: m.status, tier: this.tierOf(m), createdAt: m.createdAt, lastActiveAt: m.lastActiveAt,
        photoCount: photos.filter((p) => p.memberId === m.id).length, reports: await repo.countReports(m.id),
      });
    }
    return { total, page, rows: out };
  }

  async adminSetMemberStatus(admin: AdminUser, siteId: string, memberId: string, status: MemberStatus) {
    const site = await this.adminSite(admin, siteId);
    const repo = await this.repo(site);
    const m = await repo.getMember(memberId);
    if (!m) throw new RuleError('not_found', 'Member not found.', 404);
    await repo.saveMember({ ...m, status });
    this.changed();
    return { ok: true };
  }

  // Comp a member onto a tier (support, testing, or a promo).
  async adminSetMemberTier(admin: AdminUser, siteId: string, memberId: string, tier: Tier) {
    const site = await this.adminSite(admin, siteId);
    if (!['free', 'paid', 'vip'].includes(tier)) throw new RuleError('bad_tier', 'Unknown membership level.');
    const repo = await this.repo(site);
    const m = await repo.getMember(memberId);
    if (!m) throw new RuleError('not_found', 'Member not found.', 404);
    const next = { ...m, tier };
    delete (next as { premium?: boolean }).premium;
    await repo.saveMember(next);
    this.changed();
    return { ok: true };
  }

  async adminUpdateSite(
    admin: AdminUser,
    siteId: string,
    patch: { name?: string; tagline?: string; theme?: Partial<SiteTheme>; settings?: Partial<Omit<SiteSettings, 'membership'>> & { membership?: MembershipPatch } },
  ): Promise<Site> {
    const site = await this.adminSite(admin, siteId);
    if (patch.name) site.name = patch.name;
    if (patch.tagline) site.tagline = patch.tagline;
    if (patch.theme) site.theme = { ...site.theme, ...patch.theme };
    if (patch.settings) {
      const { membership, mode, ...rest } = patch.settings;
      if (mode && mode !== site.settings.mode && admin.role !== 'platform') {
        throw new RuleError('forbidden', 'Only WhatBox can change a site mode.', 403);
      }
      site.settings = { ...site.settings, ...rest, ...(mode ? { mode } : {}), membership: mergeMembership(site.settings.membership, membership) };
      if (site.settings.mode === 'sensitive') site.settings.publicTeasers = false;
      if (site.settings.mode !== 'adult' && rest.explicitPhotosAllowed && admin.role !== 'platform') {
        throw new RuleError('forbidden', 'Explicit photos need an adult site, set by WhatBox.', 403);
      }
    }
    await this.deps.control.saveSite(site);
    this.changed();
    return site;
  }

  async adminSaveField(admin: AdminUser, siteId: string, def: ProfileFieldDef): Promise<Site> {
    const site = await this.adminSite(admin, siteId);
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(def.key)) throw new RuleError('bad_key', 'Field keys are lower case letters, digits and underscores.');
    if ((def.type === 'select' || def.type === 'multiselect') && !def.options?.length) {
      throw new RuleError('no_options', 'Choice fields need at least one option.');
    }
    const i = site.fields.findIndex((f) => f.key === def.key);
    if (i >= 0) site.fields[i] = def;
    else site.fields.push({ ...def, order: def.order ?? site.fields.length + 1 });
    await this.deps.control.saveSite(site);
    this.changed();
    return site;
  }

  async adminDeleteField(admin: AdminUser, siteId: string, key: string): Promise<Site> {
    const site = await this.adminSite(admin, siteId);
    site.fields = site.fields.filter((f) => f.key !== key);
    await this.deps.control.saveSite(site);
    this.changed();
    return site;
  }

  async adminPages(admin: AdminUser, siteId: string) {
    const site = await this.adminSite(admin, siteId);
    return (await this.repo(site)).listPages();
  }

  async adminSavePage(admin: AdminUser, siteId: string, page: ContentPage) {
    const site = await this.adminSite(admin, siteId);
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(page.slug)) throw new RuleError('bad_slug', 'Use lower case letters, digits and dashes.');
    const repo = await this.repo(site);
    await repo.savePage({ ...page, updatedAt: this.iso() });
    this.changed();
    return repo.listPages();
  }

  async adminDeletePage(admin: AdminUser, siteId: string, slug: string) {
    const site = await this.adminSite(admin, siteId);
    const repo = await this.repo(site);
    await repo.deletePage(slug);
    this.changed();
    return repo.listPages();
  }
}

export interface MembershipPatch {
  paywallEnabled?: boolean;
  tiers?: Partial<Record<Tier, Partial<TierPerms>>>;
}

function mergeMembership(cur: MembershipSettings, patch?: MembershipPatch): MembershipSettings {
  if (!patch) return cur;
  const tiers = { ...cur.tiers };
  for (const t of ['free', 'paid', 'vip'] as Tier[]) {
    const p = patch.tiers?.[t];
    if (!p) continue;
    const next = { ...tiers[t], ...p };
    for (const k of ['seeLikesFrom', 'readMessagesFrom'] as const) {
      next[k] = next[k].filter((x) => x === 'free' || x === 'paid' || x === 'vip');
    }
    tiers[t] = next;
  }
  return { paywallEnabled: patch.paywallEnabled ?? cur.paywallEnabled, tiers };
}

function byUpdated(a: { updatedAt: string } | null, b: { updatedAt: string } | null) {
  return (b?.updatedAt ?? '').localeCompare(a?.updatedAt ?? '');
}

function validateField(def: ProfileFieldDef, value: unknown) {
  const bad = () => { throw new RuleError('bad_field', `Check the value for ${def.label}.`); };
  switch (def.type) {
    case 'select': if (typeof value !== 'string' || (value && !def.options?.includes(value))) bad(); break;
    case 'multiselect': if (!Array.isArray(value) || value.some((v) => !def.options?.includes(v))) bad(); break;
    case 'number': if (typeof value !== 'number' || !Number.isFinite(value)) bad(); break;
    case 'boolean': if (typeof value !== 'boolean') bad(); break;
    case 'text': if (typeof value !== 'string' || value.length > 200) bad(); break;
    case 'height': if (typeof value !== 'number' || value < 90 || value > 250) bad(); break;
  }
}
