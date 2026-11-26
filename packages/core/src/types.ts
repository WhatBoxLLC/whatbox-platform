// Domain types shared by the API, the member app and the public site.
// Control-plane records (sites, admins) live in the shared control database.
// Everything under "Per-site records" lives in that site's own database.

export type SiteMode = 'standard' | 'sensitive' | 'adult';
export type ClientPlatform = 'web' | 'ios' | 'android';

export interface SiteTheme {
  ground: string; // page background
  surface: string; // cards
  ink: string; // body text
  sub: string; // secondary text
  line: string; // borders
  accent: string; // primary brand color
  accentSoft: string; // tinted backgrounds behind accent text
  second: string; // secondary brand color (logo ring, highlights)
  alert: string; // badges, like heart
  headingFont: string;
  bodyFont: string;
  radius: number; // button radius, 999 = pill
  fontsHref?: string; // Google Fonts stylesheet for the web
}

export interface PaywallFlags {
  whoLikedMe: boolean; // non-premium sees a count, not faces
  whoViewedMe: boolean;
  initiateContact: boolean; // non-premium can reply but not start a conversation
}

export interface SiteSettings {
  mode: SiteMode;
  publicTeasers: boolean; // public, crawlable member teasers (never on sensitive sites)
  explicitPhotosAllowed: boolean; // private photos may be marked explicit (web only)
  photoModeration: 'pre' | 'post'; // pre: hidden until approved; post: visible, reviewed after
  paywall: PaywallFlags;
  premiumPriceLabel: string;
  billingDescriptor: string;
  messageLimits: {
    newConversationsPerHour: number;
    messagesPerMinute: number;
    duplicateRecipientThreshold: number; // same text to this many people in 24h is held
  };
  paymentProvider: 'none' | 'paypal' | 'stripe' | 'ccbill';
}

export type FieldType = 'select' | 'multiselect' | 'text' | 'number' | 'boolean';

export interface ProfileFieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  filterable?: boolean; // appears as a browse filter
  showOnProfile?: boolean;
  sensitive?: boolean; // encrypted at rest, never in public teasers
  section?: 'details' | 'interests';
  order: number;
}

export interface Site {
  id: string;
  slug: string;
  name: string;
  domains: string[];
  tagline: string;
  audience: string; // one line about who the site is for
  theme: SiteTheme;
  settings: SiteSettings;
  fields: ProfileFieldDef[];
  ownerIds: string[];
  createdAt: string;
}

export type AdminRole = 'platform' | 'owner';
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  siteIds: string[]; // ignored for platform admins (they see all)
}

// ---------- Per-site records ----------

export type Gender = 'woman' | 'man' | 'nonbinary';
export type MemberStatus = 'active' | 'suspended';

export interface Member {
  id: string;
  displayName: string;
  emailHash?: string; // HMAC with the site's key, for lookup
  emailEnc?: string; // AES-GCM with the site's key
  phoneHash?: string;
  phoneEnc?: string;
  verifiedAt: string;
  profileComplete: boolean;
  birthYear: number;
  gender: Gender;
  seeking: Gender[];
  ageMin: number;
  ageMax: number;
  city: string;
  region: string;
  postal: string;
  lat: number;
  lng: number;
  about: string;
  fields: Record<string, string | string[] | number | boolean>;
  status: MemberStatus;
  premium: boolean;
  hideExplicit: boolean; // member's own filter for explicit content
  createdAt: string;
  lastActiveAt: string;
}

export type PhotoKind = 'main' | 'public' | 'private';
export type PhotoRating = 'safe' | 'suggestive' | 'explicit';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Photo {
  id: string;
  memberId: string;
  kind: PhotoKind;
  rating: PhotoRating;
  status: ReviewStatus;
  url?: string; // real image (blob URL or data URI in the preview)
  tone?: [string, string]; // seeded placeholder silhouette colors
  sort: number;
  createdAt: string;
}

export type AccessStatus = 'requested' | 'granted' | 'denied' | 'revoked';
export interface PrivateAccess {
  ownerId: string;
  viewerId: string;
  status: AccessStatus;
  updatedAt: string;
}

export interface Like { fromId: string; toId: string; at: string }
export interface View { viewerId: string; viewedId: string; at: string }
export interface Block { blockerId: string; blockedId: string; at: string }

export type MessageFlag = 'contact_info' | 'scam_language' | 'duplicate' | 'throttled';
export interface Message {
  id: string;
  fromId: string;
  toId: string;
  body: string; // stored as written
  flags: MessageFlag[];
  held: boolean; // held for moderation, not delivered
  at: string;
  readAt?: string;
}

export interface ContactOptIn { memberId: string; otherId: string; at: string }

export interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  reason: string;
  at: string;
}

export type ModerationKind = 'photo' | 'message' | 'report' | 'profile';
export interface ModerationItem {
  id: string;
  kind: ModerationKind;
  refId: string;
  memberId: string; // member the item is about
  summary: string;
  reasons: string[];
  status: ReviewStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface ContentPage {
  slug: string;
  kind: 'page' | 'article';
  title: string;
  summary: string;
  body: string; // markdown-ish plain text, paragraphs split on blank lines
  category?: string;
  seoTitle?: string;
  seoDescription?: string;
  published: boolean;
  placement: 'footer' | 'guides' | 'none';
  updatedAt: string;
}

export interface VerificationChallenge {
  id: string;
  channel: 'email' | 'phone';
  targetHash: string;
  targetEnc: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumed: boolean;
}

// ---------- Views returned to clients ----------

export interface PhotoView {
  id: string;
  kind: PhotoKind;
  rating: PhotoRating;
  status: ReviewStatus;
  url?: string;
  tone?: [string, string];
  placeholder?: 'locked' | 'app_safe' | 'filtered'; // set when the image is withheld
}

export interface MemberCard {
  id: string;
  displayName: string;
  age: number;
  city: string;
  region: string;
  miles: number | null;
  online: boolean;
  photoCount: number;
  mainPhoto?: PhotoView;
  headline: string;
  likedByMe: boolean;
}

export interface MemberProfile extends MemberCard {
  about: string;
  gender: Gender;
  seeking: Gender[];
  ageMin: number;
  ageMax: number;
  lastActiveAt: string;
  details: { key: string; label: string; value: string }[];
  interests: string[];
  publicPhotos: PhotoView[];
  privatePhotos: PhotoView[];
  privatePhotoCount: number;
  privateAccess: AccessStatus | 'none';
  verified: boolean;
  blockedByMe: boolean;
  canMessage: boolean;
  messageLockReason?: string;
}

export interface MyProfile {
  member: Omit<Member, 'emailHash' | 'emailEnc' | 'phoneHash' | 'phoneEnc'> & { contact: string };
  photos: PhotoView[];
  limits: { main: number; public: number; private: number };
}

export interface ConversationSummary {
  other: MemberCard;
  last: { body: string; at: string; fromMe: boolean };
  unread: number;
}

export interface MessageView {
  id: string;
  fromMe: boolean;
  body: string; // contact info masked unless both opted in
  at: string;
  readAt?: string;
  held: boolean; // only the sender sees held messages, with a note
  notice?: string;
}

export interface ConversationView {
  other: MemberCard;
  messages: MessageView[];
  contactShared: { me: boolean; them: boolean };
  canSend: boolean;
  lockReason?: string;
}

export interface ActivityList {
  kind: 'likes' | 'views' | 'mine';
  total: number;
  locked: boolean;
  people: (MemberCard & { at: string })[]; // empty when locked
  priceLabel: string;
}

export interface PublicSite {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  audience: string;
  theme: SiteTheme;
  mode: SiteMode;
  fields: ProfileFieldDef[];
  paywall: PaywallFlags;
  premiumPriceLabel: string;
  billingDescriptor: string;
  explicitPhotosAllowed: boolean;
  publicTeasers: boolean;
}

export interface SearchFilters {
  seeking?: Gender[];
  ageMin?: number;
  ageMax?: number;
  withinMiles?: number | null;
  withPhoto?: boolean;
  onlineNow?: boolean;
  fields?: Record<string, string[]>; // field key -> any of these values
  sort?: 'recent' | 'newest' | 'closest';
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  people: MemberCard[];
}

export interface SiteStats {
  members: number;
  activeToday: number;
  newThisWeek: number;
  premium: number;
  messagesToday: number;
  openModeration: number;
}

export interface AdminMemberRow {
  id: string;
  displayName: string;
  age: number;
  city: string;
  status: MemberStatus;
  premium: boolean;
  createdAt: string;
  lastActiveAt: string;
  photoCount: number;
  reports: number;
}

export interface ModerationView extends ModerationItem {
  memberName: string;
  photo?: PhotoView;
  messageBody?: string;
}
