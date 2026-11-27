// Storage interfaces. The API implements these on PostgreSQL (one database per site plus
// a control database); the clickable preview implements them in memory.
import type {
  AdminUser, Block, Favorite, Pass, ContactOptIn, ContentPage, Gender, Like, Member, Message, ModerationItem,
  Photo, PrivateAccess, Report, ReviewStatus, Site, VerificationChallenge, View,
} from './types';

export interface AdminSession { token: string; adminId: string; expiresAt: string }
export interface AdminChallenge { id: string; adminId: string; codeHash: string; expiresAt: string; attempts: number }
export interface MemberSession { token: string; memberId: string; expiresAt: string }

export interface ControlRepo {
  listSites(): Promise<Site[]>;
  getSite(id: string): Promise<Site | null>;
  findSite(hostOrSlug: string): Promise<Site | null>;
  saveSite(site: Site): Promise<void>;
  getAdmin(id: string): Promise<AdminUser | null>;
  getAdminByEmail(email: string): Promise<AdminUser | null>;
  saveAdminSession(s: AdminSession): Promise<void>;
  getAdminSession(token: string): Promise<AdminSession | null>;
  deleteAdminSession(token: string): Promise<void>;
  saveAdminChallenge(c: AdminChallenge): Promise<void>;
  getAdminChallenge(id: string): Promise<AdminChallenge | null>;
  deleteAdminChallenge(id: string): Promise<void>;
  // Fixed-window counter shared by every API instance: returns the count including this hit.
  hit(key: string, windowSeconds: number, nowIso: string): Promise<number>;
}

// Coarse prefilter. Distance, custom fields, sorting and paging happen in the service.
export interface MemberQuery {
  excludeIds: string[];
  genders?: Gender[];
  birthYearMin?: number;
  birthYearMax?: number;
  activeSince?: string;
  bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  onlyComplete: boolean;
}

export interface SiteRepo {
  // members
  getMember(id: string): Promise<Member | null>;
  getMembers(ids: string[]): Promise<Member[]>;
  findMemberByHash(kind: 'email' | 'phone' | 'identity', hash: string): Promise<Member | null>;
  deleteMember(id: string): Promise<void>; // the member and everything that references them
  saveMember(m: Member): Promise<void>;
  queryMembers(q: MemberQuery): Promise<Member[]>;
  listAllMembers(limit: number, offset: number, search?: string): Promise<{ total: number; rows: Member[] }>;

  // photos
  listPhotos(memberId: string): Promise<Photo[]>;
  listPhotosFor(memberIds: string[]): Promise<Photo[]>;
  getPhoto(id: string): Promise<Photo | null>;
  savePhoto(p: Photo): Promise<void>;
  deletePhoto(id: string): Promise<void>;

  // private photo access
  getAccess(ownerId: string, viewerId: string): Promise<PrivateAccess | null>;
  saveAccess(a: PrivateAccess): Promise<void>;
  listAccessForOwner(ownerId: string): Promise<PrivateAccess[]>;
  listAccessForViewer(viewerId: string): Promise<PrivateAccess[]>;

  // likes, views, blocks
  addLike(l: Like): Promise<void>; // upsert: a later priority like upgrades a plain one
  removeLike(fromId: string, toId: string): Promise<void>;
  listLikesTo(memberId: string): Promise<Like[]>;
  listLikesFrom(memberId: string): Promise<Like[]>;
  addPass(p: Pass): Promise<void>;
  setFavorite(f: Favorite, on: boolean): Promise<void>;
  listFavoritesFrom(memberId: string): Promise<Favorite[]>;
  listPassesFrom(memberId: string, sinceIso: string): Promise<Pass[]>;
  recordView(v: View): Promise<void>; // keeps the latest view per pair
  listViewsOf(memberId: string): Promise<View[]>;
  addBlock(b: Block): Promise<void>;
  removeBlock(blockerId: string, blockedId: string): Promise<void>;
  listBlocksInvolving(memberId: string): Promise<Block[]>;

  // messaging
  saveMessage(m: Message): Promise<void>;
  getMessage(id: string): Promise<Message | null>;
  listMessagesInvolving(memberId: string): Promise<Message[]>;
  listMessagesBetween(a: string, b: string): Promise<Message[]>;
  listMessagesFromSince(fromId: string, sinceIso: string): Promise<Message[]>;
  markRead(toId: string, fromId: string, at: string): Promise<void>;
  addOptIn(o: ContactOptIn): Promise<void>;
  listOptIns(a: string, b: string): Promise<ContactOptIn[]>;

  // safety
  saveReport(r: Report): Promise<void>;
  countReports(targetId: string): Promise<number>;
  saveModeration(item: ModerationItem): Promise<void>;
  getModeration(id: string): Promise<ModerationItem | null>;
  listModeration(status: ReviewStatus | 'all'): Promise<ModerationItem[]>;

  // public content
  listPages(): Promise<ContentPage[]>;
  getPage(slug: string): Promise<ContentPage | null>;
  savePage(p: ContentPage): Promise<void>;
  deletePage(slug: string): Promise<void>;

  // auth
  saveChallenge(c: VerificationChallenge): Promise<void>;
  getChallenge(id: string): Promise<VerificationChallenge | null>;
  saveSession(s: MemberSession): Promise<void>;
  getSession(token: string): Promise<MemberSession | null>;
  deleteSession(token: string): Promise<void>;

  // admin stats
  stats(nowIso: string): Promise<{
    members: number; activeToday: number; newThisWeek: number; paid: number; messagesToday: number;
  }>;
}

export interface Notifier {
  // Sends a verification code. Dev/preview implementations just record it.
  sendCode(args: { site: Site; channel: 'email' | 'phone'; target: string; code: string }): Promise<void>;
  sendAdminCode?(args: { email: string; code: string }): Promise<void>;
}

// Photo files. Each site has its own container, so a key from one site can never be read on another.
export interface PhotoStore {
  put(site: Site, key: string, data: Uint8Array, contentType: string): Promise<void>;
  delete(site: Site, key: string): Promise<void>;
  readUrl(site: Site, key: string): string; // short-lived signed URL
}

// Verifies an Apple or Google ID token for one site (its own client IDs) and returns the stable user id.
export interface IdTokenVerifier {
  verify(site: Site, provider: 'apple' | 'google', idToken: string): Promise<{ sub: string; email?: string; emailVerified: boolean }>;
}

export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
