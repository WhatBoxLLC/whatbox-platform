// The client-facing contract. The Expo app talks to `MemberApi` / `AdminApi` and never
// knows whether it is backed by HTTP (packages/core/src/http-client.ts -> apps/api)
// or by the in-browser Platform (createLocalApis, used for the clickable preview).
import { RuleError } from './rules';
import type { AccessRow, Platform, ProfilePatch } from './services';
import type {
  ActivityList, AdminMemberRow, ClientPlatform, DiscoverCard, ContentPage, ConversationSummary, ConversationView, MemberProfile,
  MemberStatus, ModerationView, MyProfile, PhotoKind, PhotoRating, ProfileFieldDef, PublicSite, SearchFilters,
  SearchResult, Site, SiteMode, SiteStats, Tier,
} from './types';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export interface AdminSiteSummary { id: string; slug: string; name: string; mode: SiteMode; accent: string; domain: string }
export type SitePatch = Parameters<Platform['adminUpdateSite']>[2];

export interface MemberApi {
  readonly siteKey: string;
  setToken(token: string | null): void;
  site(): Promise<PublicSite>;
  pages(): Promise<ContentPage[]>;
  page(slug: string): Promise<ContentPage | null>;

  startVerification(channel: 'email' | 'phone', target: string): Promise<{ challengeId: string; sentTo: string; devCode?: string }>;
  verify(challengeId: string, code: string): Promise<{ token: string; isNew: boolean }>;
  signOut(): Promise<void>;

  me(): Promise<MyProfile>;
  updateMe(patch: ProfilePatch): Promise<MyProfile>;
  addPhoto(input: { kind: PhotoKind; rating?: PhotoRating; url?: string; tone?: [string, string] }): Promise<MyProfile>;
  updatePhoto(id: string, patch: { kind?: PhotoKind; rating?: PhotoRating }): Promise<MyProfile>;
  deletePhoto(id: string): Promise<MyProfile>;
  setTier(tier: Tier): Promise<MyProfile>; // prototype checkout

  privateAccess(): Promise<{ incoming: AccessRow[]; outgoing: AccessRow[] }>;
  requestAccess(ownerId: string): Promise<'requested' | 'granted'>;
  decideAccess(viewerId: string, action: 'grant' | 'deny' | 'revoke'): Promise<{ incoming: AccessRow[]; outgoing: AccessRow[] }>;

  search(filters: SearchFilters): Promise<SearchResult>;
  profile(id: string): Promise<MemberProfile>;
  like(id: string, on: boolean): Promise<{ liked: boolean; mutual: boolean; vip: boolean }>;
  pass(id: string): Promise<{ ok: boolean }>;
  discover(): Promise<DiscoverCard[]>;
  block(id: string, on: boolean): Promise<{ blocked: boolean }>;
  report(id: string, reason: string): Promise<{ ok: boolean }>;
  activity(kind: 'likes' | 'views' | 'mine'): Promise<ActivityList>;

  conversations(): Promise<ConversationSummary[]>;
  conversation(otherId: string): Promise<ConversationView>;
  send(otherId: string, body: string): Promise<ConversationView>;
  shareContact(otherId: string): Promise<ConversationView>;
  unreadCount(): Promise<number>;
}

export interface AdminApi {
  setToken(token: string | null): void;
  start(email: string): Promise<{ challengeId: string; devCode?: string }>;
  verify(challengeId: string, code: string): Promise<{ token: string }>;
  me(): Promise<{ admin: { id: string; email: string; name: string; role: 'platform' | 'owner' }; sites: AdminSiteSummary[] }>;
  site(siteId: string): Promise<Site>;
  updateSite(siteId: string, patch: SitePatch): Promise<Site>;
  saveField(siteId: string, def: ProfileFieldDef): Promise<Site>;
  deleteField(siteId: string, key: string): Promise<Site>;
  stats(siteId: string): Promise<SiteStats>;
  moderation(siteId: string, status: 'pending' | 'approved' | 'rejected' | 'all'): Promise<ModerationView[]>;
  decide(siteId: string, itemId: string, decision: 'approve' | 'reject'): Promise<ModerationView[]>;
  members(siteId: string, opts: { search?: string; page?: number }): Promise<{ total: number; page: number; rows: AdminMemberRow[] }>;
  setMemberStatus(siteId: string, memberId: string, status: MemberStatus): Promise<{ ok: boolean }>;
  setMemberTier(siteId: string, memberId: string, tier: Tier): Promise<{ ok: boolean }>;
  pages(siteId: string): Promise<ContentPage[]>;
  savePage(siteId: string, page: ContentPage): Promise<ContentPage[]>;
  deletePage(siteId: string, slug: string): Promise<ContentPage[]>;
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RuleError) throw new ApiError(e.code, e.message, e.status);
    throw e;
  }
}

export function createLocalMemberApi(platform: Platform, siteKey: string, clientPlatform: ClientPlatform): MemberApi {
  let token: string | null = null;
  const site = () => platform.resolveSite(siteKey);
  const ctx = async () => platform.memberCtx(await site(), token, clientPlatform);
  return {
    siteKey,
    setToken: (t) => { token = t; },
    site: () => wrap(async () => platform.publicSite(await site())),
    pages: () => wrap(async () => platform.publicPages(await site())),
    page: (slug) => wrap(async () => platform.publicPage(await site(), slug)),
    startVerification: (ch, t) => wrap(async () => platform.startVerification(await site(), ch, t)),
    verify: (id, code) => wrap(async () => platform.verifyCode(await site(), id, code)),
    signOut: () => wrap(async () => { if (token) await platform.signOut(await site(), token); token = null; }),
    me: () => wrap(async () => platform.myProfile(await ctx())),
    updateMe: (p) => wrap(async () => platform.updateProfile(await ctx(), p)),
    addPhoto: (i) => wrap(async () => platform.addPhoto(await ctx(), i)),
    updatePhoto: (id, p) => wrap(async () => platform.updatePhoto(await ctx(), id, p)),
    deletePhoto: (id) => wrap(async () => platform.deletePhoto(await ctx(), id)),
    setTier: (tier) => wrap(async () => platform.setTier(await ctx(), tier)),
    privateAccess: () => wrap(async () => platform.accessLists(await ctx())),
    requestAccess: (id) => wrap(async () => platform.requestAccess(await ctx(), id)),
    decideAccess: (id, a) => wrap(async () => platform.decideAccess(await ctx(), id, a)),
    search: (f) => wrap(async () => platform.search(await ctx(), f)),
    profile: (id) => wrap(async () => platform.profile(await ctx(), id)),
    like: (id, on) => wrap(async () => platform.like(await ctx(), id, on)),
    pass: (id) => wrap(async () => platform.pass(await ctx(), id)),
    discover: () => wrap(async () => platform.discover(await ctx())),
    block: (id, on) => wrap(async () => platform.block(await ctx(), id, on)),
    report: (id, r) => wrap(async () => platform.report(await ctx(), id, r)),
    activity: (k) => wrap(async () => platform.activity(await ctx(), k)),
    conversations: () => wrap(async () => platform.conversations(await ctx())),
    conversation: (id) => wrap(async () => platform.conversation(await ctx(), id)),
    send: (id, b) => wrap(async () => platform.send(await ctx(), id, b)),
    shareContact: (id) => wrap(async () => platform.shareContact(await ctx(), id)),
    unreadCount: () => wrap(async () => platform.unreadCount(await ctx())),
  };
}

export function createLocalAdminApi(platform: Platform): AdminApi {
  let token: string | null = null;
  const admin = () => platform.adminFromToken(token);
  return {
    setToken: (t) => { token = t; },
    start: (email) => wrap(() => platform.adminStart(email)),
    verify: (id, code) => wrap(() => platform.adminVerify(id, code)),
    me: () => wrap(async () => {
      const a = await admin();
      return { admin: { id: a.id, email: a.email, name: a.name, role: a.role }, sites: await platform.adminSites(a) };
    }),
    site: (s) => wrap(async () => platform.adminSite(await admin(), s)),
    updateSite: (s, p) => wrap(async () => platform.adminUpdateSite(await admin(), s, p)),
    saveField: (s, d) => wrap(async () => platform.adminSaveField(await admin(), s, d)),
    deleteField: (s, k) => wrap(async () => platform.adminDeleteField(await admin(), s, k)),
    stats: (s) => wrap(async () => platform.adminStats(await admin(), s)),
    moderation: (s, st) => wrap(async () => platform.adminModeration(await admin(), s, st)),
    decide: (s, i, d) => wrap(async () => platform.adminDecide(await admin(), s, i, d)),
    members: (s, o) => wrap(async () => platform.adminMembers(await admin(), s, o)),
    setMemberStatus: (s, m, st) => wrap(async () => platform.adminSetMemberStatus(await admin(), s, m, st)),
    setMemberTier: (s, m, t) => wrap(async () => platform.adminSetMemberTier(await admin(), s, m, t)),
    pages: (s) => wrap(async () => platform.adminPages(await admin(), s)),
    savePage: (s, p) => wrap(async () => platform.adminSavePage(await admin(), s, p)),
    deletePage: (s, slug) => wrap(async () => platform.adminDeletePage(await admin(), s, slug)),
  };
}
