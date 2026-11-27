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

// Membership tiers. Each site owner edits what each tier can do. Pricing is by tier, never by gender.
export type Tier = 'free' | 'paid' | 'vip';
export const TIERS: Tier[] = ['free', 'paid', 'vip'];

export interface TierPerms {
  label: string;
  priceLabel: string; // '' for free
  seePublicPhotos: boolean; // the gallery beyond photo one
  requestPrivatePhotos: boolean;
  seeLikesFrom: Tier[]; // whose likes show up in "Liked you" (others are a count)
  seeWhoViewed: boolean;
  startConversations: boolean;
  readMessagesFrom: Tier[]; // a message from a sender outside this list stays sealed until upgrade
  priorityLikes: boolean; // likes go to the top of the recipient's list
}

export interface MembershipSettings {
  paywallEnabled: boolean; // off: everyone gets full access, as at launch
  tiers: Record<Tier, TierPerms>;
}

export interface SiteSettings {
  mode: SiteMode;
  publicTeasers: boolean; // public, crawlable member teasers (never on sensitive sites)
  explicitPhotosAllowed: boolean; // private photos may be marked explicit (web only)
  photoModeration: 'pre' | 'post'; // pre: hidden until approved; post: visible, reviewed after
  // Check each new photo with WhatBox AI (adult content, contact info, QR codes). Set by WhatBox in
  // Platform Admin. Unset means on for WhatBox's own sites and off for licensed sites, which pay per photo.
  aiPhotoCheck?: boolean;
  membership: MembershipSettings;
  billingDescriptor: string;
  messageLimits: {
    newConversationsPerHour: number;
    messagesPerMinute: number;
    duplicateRecipientThreshold: number; // same text to this many people in 24h is held
  };
  paymentProvider: PaymentProvider;
  paymentPlans?: Partial<Record<'paid' | 'vip', string>>; // the provider's plan id for each paid tier
  units: Units; // default for members; each member can override
  discover: {
    newMemberDays: number; // how long a new member gets a visibility boost
    passCooldownDays: number; // a passed profile can reappear after this
  };
}

export type Units = 'imperial' | 'metric';
export type PaymentProvider = 'none' | 'paypal' | 'stripe' | 'ccbill';

export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired';
export interface Subscription {
  id: string; // ours
  memberId: string;
  provider: PaymentProvider | 'stub';
  providerRef: string; // the provider's subscription id
  tier: 'paid' | 'vip';
  status: SubscriptionStatus;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export type FieldType = 'select' | 'multiselect' | 'text' | 'number' | 'boolean' | 'height'; // height is stored in cm

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
  /** multiselect only: options that can't be combined with any other, e.g. "None", "Prefer not to say" */
  exclusive?: string[];
  /** When a member picks this option, everyone viewing their profile sees this message in red. */
  caution?: { option: string; message: string };
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
  status?: SiteStatus; // missing means active
  licensing?: SiteLicensing;
}

export type SiteStatus = 'active' | 'suspended';
export type UsageKind = 'email' | 'sms' | 'storage_mb' | 'push' | 'ai_screen' | 'ai_photo';
// WhatBox's own sites are free. Third-party sites pay a base fee plus metered usage.
export interface SiteLicensing {
  owned: boolean;
  baseMonthlyCents: number;
  ratesCents: Partial<Record<UsageKind, number>>; // per unit, may be fractional (e.g. 0.2 per email)
}
export const DEFAULT_LICENSING: SiteLicensing = { owned: false, baseMonthlyCents: 9900, ratesCents: { email: 0.2, sms: 2, storage_mb: 0.05, ai_screen: 0.5, ai_photo: 0.5 } };

export interface PlatformSiteRow {
  id: string; slug: string; name: string; mode: SiteMode; status: SiteStatus; domains: string[]; ownerIds: string[];
  members: number; usage: Partial<Record<UsageKind, number>>; licensing: SiteLicensing; estimateCents: number;
  aiPhotoCheck: boolean; // WhatBox AI checks this site's new photos
}
// Who changed what in the admin tools. Ids only: no member names, contact details or message text.
export interface AuditEntry { id: string; at: string; actorId: string; actorEmail: string; siteId?: string; action: string; target?: string; detail?: string }

// WhatBox AI (shared photo checks). Read from the WhatBox AI service by Platform Admin.
export interface AiAccountUsage { account: string; checks: number; flaggedAdult: number; flaggedContact: number }
export interface AiCallerRow {
  id: string; name: string; keyHint: string; billable: boolean; rateCents: number; perMinute: number; enabled: boolean; createdAt: string;
  checks: number; flaggedAdult: number; flaggedContact: number; estimateCents: number; accounts: AiAccountUsage[];
}
export interface AiOverview { available: boolean; message?: string; url?: string; month: string; callers: AiCallerRow[]; totalChecks: number; totalCents: number }
export interface AiCallerPatch { name?: string; enabled?: boolean; billable?: boolean; rateCents?: number; perMinute?: number }

export interface PlatformOverview { month: string; sites: PlatformSiteRow[]; owners: AdminUser[] }
export interface NewSiteInput { slug: string; name: string; domains: string[]; mode: SiteMode; ownerIds: string[]; templateSiteId?: string; tagline?: string; audience?: string }

export type AdminRole = 'platform' | 'owner';
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  siteIds: string[]; // ignored for platform admins (they see all)
}

// ---------- Per-site records ----------

export type Gender = 'woman' | 'man' | 'nonbinary' | 'trans_mtf' | 'trans_ftm';
/** Every gender, in the order the sign-up form shows them. */
export const GENDERS: { value: Gender; label: string; plural: string }[] = [
  { value: 'woman', label: 'Woman', plural: 'Women' },
  { value: 'man', label: 'Man', plural: 'Men' },
  { value: 'nonbinary', label: 'Non-Binary', plural: 'Non-Binary people' },
  { value: 'trans_mtf', label: 'Trans M2F', plural: 'Trans M2F' },
  { value: 'trans_ftm', label: 'Trans F2M', plural: 'Trans F2M' },
];
export const isGender = (v: unknown): v is Gender => GENDERS.some((g) => g.value === v);
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
  tier: Tier;
  hideExplicit: boolean; // member's own filter for explicit content
  units?: Units; // overrides the site default
  compTier?: Tier; // granted by an admin; billing never drops a member below it
  identityHashes?: string[]; // HMACs of "apple:<sub>" / "google:<sub>" for social sign-in
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
  url?: string; // data URI in the preview only
  blobKey?: string; // object key in the site's photo store (production)
  aiRating?: PhotoRating; // what WhatBox AI found; the member can't mark the photo as less explicit
  aiFlags?: string[]; // e.g. "phone number in photo"; the photo stays hidden until a moderator approves it
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

export interface Like { fromId: string; toId: string; at: string; vip?: boolean } // vip: sent with priority
export interface Pass { fromId: string; toId: string; at: string }
export interface Favorite { fromId: string; toId: string; at: string } // private bookmark, never shown to them
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
  senderTier?: Tier; // the sender's tier when sent; decides who can read it
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
  isNew: boolean; // joined recently
}

export interface DiscoverCard extends MemberCard {
  summary: string; // first lines of "about me"
  facts: string[]; // e.g. "5′ 6″ (168 cm)", "Long-term"
  interests: string[];
  publicPhotos: PhotoView[]; // up to 3 more photos to tap through
  vipLikedMe: boolean; // priority likes are visible on every tier
  score: number;
}

export interface MemberProfile extends MemberCard {
  about: string;
  gender: Gender;
  seeking: Gender[];
  ageMin: number;
  ageMax: number;
  lastActiveAt: string;
  details: { key: string; label: string; value: string }[];
  /** Red notices for viewers, e.g. a member who marked "Other" as their status. */
  cautions: string[];
  interests: string[];
  publicPhotos: PhotoView[];
  privatePhotos: PhotoView[];
  privatePhotoCount: number;
  privateAccess: AccessStatus | 'none';
  publicPhotosLocked: number; // gallery photos hidden by my tier
  canRequestPrivate: boolean;
  upgradeHint?: string;
  tier: Tier; // their tier, shown as a VIP badge
  verified: boolean;
  blockedByMe: boolean;
  favoritedByMe: boolean;
  canMessage: boolean;
  messageLockReason?: string;
}

export interface CheckoutStart { checkoutUrl: string; subscriptionId: string }

export interface MyProfile {
  member: Omit<Member, 'emailHash' | 'emailEnc' | 'phoneHash' | 'phoneEnc'> & { contact: string; unitsResolved: Units };
  perms: TierPerms; // what I can do right now (full access while the paywall is off)
  paywallEnabled: boolean;
  subscription?: { tier: 'paid' | 'vip'; status: SubscriptionStatus; currentPeriodEnd?: string; provider: string };
  photos: PhotoView[];
  limits: { main: number; public: number; private: number };
}

export interface ConversationSummary {
  other: MemberCard;
  last: { body: string; at: string; fromMe: boolean; sealed: boolean };
  unread: number;
  fromVip: boolean; // they're VIP, so I can always read and reply
}

export interface MessageView {
  id: string;
  fromMe: boolean;
  body: string; // contact info masked unless both opted in
  at: string;
  readAt?: string;
  held: boolean; // only the sender sees held messages, with a note
  sealed: boolean; // my tier can't read it yet
  fromVip: boolean;
  notice?: string;
}

export interface ConversationView {
  other: MemberCard;
  messages: MessageView[];
  contactShared: { me: boolean; them: boolean };
  canSend: boolean;
  lockReason?: string;
  otherTier: Tier;
  sealedCount: number;
}

export interface ActivityPerson extends MemberCard {
  at: string;
  vip: boolean; // sent a priority (VIP) like
  fitsMe: boolean; // matches my age range, who I'm looking for and distance
  serious: boolean; // verified, has a main photo, wrote a real "about me"
  likedBack: boolean;
}

export type ActivityKind = 'likes' | 'views' | 'mine' | 'favorites';
export interface ActivityList {
  kind: ActivityKind;
  total: number;
  vipCount: number;
  hidden: number; // people my tier can't see yet (shown as a count)
  locked: boolean; // hidden > 0
  people: ActivityPerson[];
  upgradeLabel: string;
}

// Real-time events. Content-free on purpose: they say something happened, never what.
export type MemberEvent =
  | { type: 'message'; fromId: string }
  | { type: 'like'; fromId: string; vip: boolean }
  | { type: 'match'; otherId: string }
  | { type: 'access'; otherId: string; status: 'requested' | 'granted' };

export interface PushToken { memberId: string; token: string; platform: 'ios' | 'android' | 'web'; at: string }

export interface PublicSite {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  audience: string;
  theme: SiteTheme;
  mode: SiteMode;
  fields: ProfileFieldDef[];
  membership: MembershipSettings;
  billingDescriptor: string;
  explicitPhotosAllowed: boolean;
  publicTeasers: boolean;
  units: Units;
}

export interface SearchFilters {
  seeking?: Gender[];
  ageMin?: number;
  ageMax?: number;
  withinMiles?: number | null;
  withPhoto?: boolean;
  onlineNow?: boolean;
  fields?: Record<string, string[]>; // field key -> any of these values
  sort?: 'best' | 'recent' | 'newest' | 'closest';
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
  paid: number; // members on Paid or VIP
  messagesToday: number;
  openModeration: number;
}

export interface AdminMemberRow {
  id: string;
  displayName: string;
  age: number;
  city: string;
  status: MemberStatus;
  tier: Tier;
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
