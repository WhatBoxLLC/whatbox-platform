// Storage interfaces. The API implements these on PostgreSQL (one database per site plus
// a control database); the clickable preview implements them in memory.
import type {
  AdminUser, Block, Pass, ContactOptIn, ContentPage, Gender, Like, Member, Message, ModerationItem,
  Photo, PrivateAccess, Report, ReviewStatus, Site, VerificationChallenge, View,
} from './types';

export interface AdminSession { token: string; adminId: string; expiresAt: string }
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
  findMemberByHash(kind: 'email' | 'phone', hash: string): Promise<Member | null>;
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
}

export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
