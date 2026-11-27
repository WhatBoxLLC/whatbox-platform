// Placeholder seed data. No real member data is used anywhere in the prototype.
import { lookupPostal } from './geo';
import { DEFAULT_MEMBERSHIP } from './rules';
import { DEFAULT_LICENSING } from './types';
import type {
  AdminUser, ContentPage, Gender, Member, Message, ModerationItem, Photo, PrivateAccess, ProfileFieldDef, Site,
  SiteSettings, Tier, View, Like,
} from './types';

export const DEMO_MEMBER_EMAIL = 'alex@example.com';
export const DEMO_OWNER_EMAIL = 'owner@whatbox.test';
export const DEMO_PLATFORM_EMAIL = 'admin@whatbox.test';

export const TONES: [string, string][] = [
  ['#E8D3C4', '#B98C70'], ['#CFE0DC', '#7FA39B'], ['#DDD6E8', '#9B8DB5'],
  ['#E9DEC5', '#B8A27A'], ['#D3DFEA', '#8CA3BA'], ['#E6D0D0', '#B48A8A'],
];

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&display=swap';

function settings(over: Partial<SiteSettings>): SiteSettings {
  return {
    mode: 'standard', publicTeasers: false, explicitPhotosAllowed: false, photoModeration: 'post',
    membership: JSON.parse(JSON.stringify(DEFAULT_MEMBERSHIP)),
    billingDescriptor: 'WBX MEMBERSHIP',
    messageLimits: { newConversationsPerHour: 10, messagesPerMinute: 8, duplicateRecipientThreshold: 3 },
    paymentProvider: 'paypal',
    units: 'imperial',
    discover: { newMemberDays: 14, passCooldownDays: 30 },
    ...over,
  };
}

const tierRoll = (x: number): Tier => (x < 0.1 ? 'vip' : x < 0.25 ? 'paid' : 'free');

// AfterH status: people often have more than one, so it's multi-select. "Other" warns viewers.
export const STATUS_FIELD: ProfileFieldDef = {
  key: 'hsv_status', label: 'Status', type: 'multiselect',
  options: ['HSV-1', 'HSV-2', 'Herpes (type unsure)', 'HPV', 'Other', 'None', 'Prefer not to say'],
  exclusive: ['None', 'Prefer not to say'],
  caution: { option: 'Other', message: 'This member also marked OTHER as their STD type. We suggest asking them for more details.' },
  required: true, filterable: true, showOnProfile: true, sensitive: true, section: 'details', order: 1,
};

/** Brings older site field definitions up to date. Returns true if anything changed. */
export function upgradeSiteFields(site: Site): boolean {
  const i = site.fields.findIndex((f) => f.key === 'hsv_status' && f.type === 'select');
  if (i < 0) return false;
  site.fields[i] = { ...STATUS_FIELD, label: site.fields[i].label, order: site.fields[i].order };
  return true;
}

/** Reads a stored field value in the shape its definition now expects (older single answers become a list). */
export function normalizeFieldValue(def: ProfileFieldDef, v: unknown): unknown {
  if (def.type !== 'multiselect' || typeof v !== 'string' || !v) return v;
  if (def.key === 'hsv_status' && v === 'Both') return ['HSV-1', 'HSV-2'];
  return [v];
}

const commonFields = (start: number): ProfileFieldDef[] => [
  { key: 'relationship_goal', label: 'Relationship goal', type: 'select', options: ['Long-term', 'Dating', 'Friendship', 'Not sure yet'], filterable: true, showOnProfile: true, section: 'details', order: start },
  { key: 'height', label: 'Height', type: 'height', showOnProfile: true, section: 'details', order: start + 1 },
  { key: 'kids', label: 'Kids', type: 'select', options: ['None', 'None, open to it', 'Have kids', 'Have kids, want more', 'Prefer not to say'], filterable: true, showOnProfile: true, section: 'details', order: start + 2 },
  { key: 'smoking', label: 'Smoking', type: 'select', options: ['Never', 'Sometimes', 'Regularly'], filterable: true, showOnProfile: true, section: 'details', order: start + 3 },
  { key: 'drinking', label: 'Drinking', type: 'select', options: ['Never', 'Socially', 'Regularly'], showOnProfile: true, section: 'details', order: start + 4 },
  { key: 'interests', label: 'Interests', type: 'multiselect', options: ['Hiking', 'Baking', 'Dogs', 'Cats', 'Podcasts', 'Camping', 'Live music', 'Board games', 'Cooking', 'Travel', 'Reading', 'Gardening', 'Fitness', 'Movies', 'Art', 'Faith', 'Volunteering', 'Gaming'], filterable: true, showOnProfile: true, section: 'interests', order: start + 5 },
];

export function seedSites(now: Date): Site[] {
  const created = new Date(now.getTime() - 400 * 86_400_000).toISOString();
  return [
    {
      id: 'site_afterh', slug: 'afterh', name: 'AfterH', domains: ['afterh.com', 'afterh.localhost'],
      tagline: 'The awkward conversation is already over.',
      audience: 'Dating for people living with HSV-1 or HSV-2',
      theme: {
        ground: '#F6F3EE', surface: '#FFFFFF', ink: '#1E2629', sub: '#46524F', line: '#E4DED5', accent: '#22655F',
        accentSoft: '#E3EFEC', second: '#D98A5F', alert: '#9A4A2E', headingFont: 'Bricolage Grotesque', bodyFont: 'Figtree',
        radius: 999, fontsHref: FONTS,
      },
      settings: settings({
        mode: 'sensitive', publicTeasers: false,
        billingDescriptor: 'WBX MEMBERSHIP',
      }),
      fields: [
        STATUS_FIELD,
        ...commonFields(2),
      ],
      ownerIds: ['adm_owner'], createdAt: created, status: 'active', licensing: { ...DEFAULT_LICENSING, owned: true },
    },
    {
      id: 'site_hfriends', slug: 'hfriends', name: 'HFriends', domains: ['hfriends.com', 'hfriends.localhost'],
      tagline: 'Meet people who see you first.',
      audience: 'Dating and friendship for people with disabilities',
      theme: {
        ground: '#F2F6FA', surface: '#FFFFFF', ink: '#16263A', sub: '#43556B', line: '#DCE4EE', accent: '#2F5D8A',
        accentSoft: '#E1EBF5', second: '#E0B23C', alert: '#9A4A2E', headingFont: 'Libre Franklin', bodyFont: 'Figtree', radius: 10,
        fontsHref: 'https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700&family=Figtree:wght@400;500;600;700&display=swap',
      },
      settings: settings({ mode: 'standard', publicTeasers: true }),
      fields: [
        { key: 'accessibility', label: 'About my disability', type: 'multiselect', options: ['Wheelchair user', 'Uses a mobility aid', 'Deaf or hard of hearing', 'Blind or low vision', 'Chronic illness', 'Neurodivergent', 'Prefer not to say'], filterable: true, showOnProfile: true, sensitive: true, section: 'details', order: 1 },
        ...commonFields(2),
      ],
      ownerIds: ['adm_owner'], createdAt: created, status: 'active', licensing: { ...DEFAULT_LICENSING, owned: true },
    },
    {
      id: 'site_datealittle', slug: 'datealittle', name: 'DateALittle', domains: ['datealittle.com', 'datealittle.localhost'],
      tagline: 'Big hearts welcome here.',
      audience: 'Dating for little people and the people who love them',
      theme: {
        ground: '#FBF5F8', surface: '#FFFFFF', ink: '#2B1E2E', sub: '#5C4A5F', line: '#EBDDE5', accent: '#7A4E8C',
        accentSoft: '#F0E6F4', second: '#3E9C8C', alert: '#9A4A2E', headingFont: 'Nunito', bodyFont: 'Figtree', radius: 16,
        fontsHref: 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Figtree:wght@400;500;600;700&display=swap',
      },
      settings: settings({ mode: 'standard', publicTeasers: true }),
      fields: [
        { key: 'stature', label: 'Stature', type: 'select', options: ['Little person', 'Average height', 'Prefer not to say'], required: true, filterable: true, showOnProfile: true, section: 'details', order: 1 },
        ...commonFields(2),
      ],
      ownerIds: ['adm_owner'], createdAt: created, status: 'active', licensing: { ...DEFAULT_LICENSING, owned: true },
    },
  ];
}

export function seedAdmins(): AdminUser[] {
  return [
    { id: 'adm_platform', email: DEMO_PLATFORM_EMAIL, name: 'WhatBox Platform Admin', role: 'platform', siteIds: [] },
    { id: 'adm_owner', email: DEMO_OWNER_EMAIL, name: 'Site Owner', role: 'owner', siteIds: ['site_afterh', 'site_hfriends', 'site_datealittle'] },
  ];
}

// Deterministic PRNG so every seed run produces the same people.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WOMEN = ['Rosa', 'Jen', 'Priya', 'Carla', 'Tess', 'Mei', 'Dana', 'Lena', 'Sam', 'Nora', 'Kayla', 'Imani', 'Beth', 'Lucia', 'Hana', 'Grace', 'Maya', 'Erin', 'Sofia', 'Tara', 'Joy', 'Ruth', 'Ana', 'Wren', 'Kim', 'Lia', 'Paige', 'Dee'];
const MEN = ['Marcus', 'Ben', 'Diego', 'Owen', 'Ravi', 'Tom', 'Eli', 'Chris', 'Jamal', 'Luke', 'Nate', 'Sean', 'Hugo', 'Kenji', 'Will', 'Andre', 'Pete', 'Gabe', 'Theo', 'Ray'];
const NB = ['River', 'Quinn', 'Rowan', 'Sky'];
const LINES = [
  'Weekend hiker, weekday baker.', 'Looking for my favorite person.', 'Live music and long breakfasts.',
  'Two kids, one dog, zero drama.', 'Ask me about my garden.', 'New here. Be kind!', 'Board games and bad puns.',
  'Teacher by day, salsa by night.', 'Road trips with good playlists.', 'Coffee first, adventures second.',
  'Happiest near a lake.', 'I make a mean green chile.', 'Bookstore wanderer.', 'Trying every taco truck in town.',
  'Ready for something real.', 'Sunday farmers market regular.', 'Learning guitar, slowly.', 'Dog park philosopher.',
];
const MORE = [
  'I was diagnosed a few years ago and it took a while to feel like myself again.',
  'Honest conversation matters more to me than a perfect first message.',
  'I like quiet mornings, loud concerts and people who laugh easily.',
  'Looking for someone kind, curious and up for a sunrise trail now and then.',
  'Family is big for me, and so is having my own space.',
];
const POSTALS = ['80202', '80203', '80205', '80210', '80226', '80012', '80301', '80401', '80110', '80002', '80120', '80031', '80134', '80501'];

function pick<T>(r: () => number, list: T[]): T { return list[Math.floor(r() * list.length)]; }
function some<T>(r: () => number, list: T[], n: number): T[] {
  const c = [...list]; const out: T[] = [];
  while (out.length < n && c.length) out.push(c.splice(Math.floor(r() * c.length), 1)[0]);
  return out;
}

export interface SiteSeed {
  members: Member[]; photos: Photo[]; likes: Like[]; views: View[]; messages: Message[];
  access: PrivateAccess[]; moderation: ModerationItem[]; pages: ContentPage[];
}

export function seedSite(site: Site, now: Date, opts: { demoMemberHash?: { emailHash: string; emailEnc: string } } = {}): SiteSeed {
  const r = rng(site.id.length * 7919 + site.slug.charCodeAt(0));
  const year = now.getUTCFullYear();
  const t = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const members: Member[] = [];
  const photos: Photo[] = [];
  const fieldDefs = site.fields;
  const big = site.slug === 'afterh';
  const roster: [string, Gender][] = [
    ...WOMEN.slice(0, big ? 28 : 12).map((n) => [n, 'woman'] as [string, Gender]),
    ...MEN.slice(0, big ? 20 : 8).map((n) => [n, 'man'] as [string, Gender]),
    ...NB.slice(0, big ? 4 : 2).map((n) => [n, 'nonbinary'] as [string, Gender]),
  ];

  const mockAges: Record<string, number> = { Rosa: 36, Jen: 41, Priya: 33, Carla: 44, Tess: 38, Mei: 35, Dana: 42, Lena: 31, Sam: 39 };
  const mockPlaces: Record<string, string> = { Rosa: '80226', Jen: '80012', Priya: '80202', Carla: '80301', Tess: '80401', Mei: '80110', Dana: '80002', Lena: '80203', Sam: '80120' };

  roster.forEach(([name, gender], i) => {
    const postal = (big && mockPlaces[name]) || pick(r, POSTALS);
    const loc = lookupPostal(postal)!;
    const age = (big && mockAges[name]) || 26 + Math.floor(r() * 30);
    const seeking: Gender[] = gender === 'woman' ? ['man'] : gender === 'man' ? ['woman'] : ['woman', 'man', 'nonbinary'];
    const lineIdx = big && i < 9 ? i : Math.floor(r() * LINES.length);
    const fields: Member['fields'] = {};
    for (const f of fieldDefs) {
      if (f.key === 'hsv_status') fields[f.key] = pick(r, [['HSV-1'], ['HSV-2'], ['HSV-2'], ['HSV-1', 'HSV-2'], ['HSV-2', 'HPV'], ['HSV-2', 'Other'], ['Herpes (type unsure)'], ['Prefer not to say']]);
      else if (f.type === 'select' && f.options) fields[f.key] = pick(r, f.options);
      else if (f.type === 'height') fields[f.key] = (gender === 'man' ? 170 : 155) + ((i * 37) % 23);
      else if (f.type === 'multiselect' && f.options) fields[f.key] = some(r, f.options.filter((o) => o !== 'Prefer not to say'), f.key === 'interests' ? 3 + Math.floor(r() * 3) : 1);
    }
    const online = r() < 0.3;
    const m: Member = {
      id: `m_${site.slug}_${i + 1}`, displayName: name, verifiedAt: t(60 * 24 * (20 + i)), profileComplete: true,
      birthYear: year - age, gender, seeking, ageMin: Math.max(18, age - 8), ageMax: age + 8,
      city: loc.city, region: loc.region, country: 'US', postal, lat: loc.lat + (r() - 0.5) * 0.02, lng: loc.lng + (r() - 0.5) * 0.02,
      about: `${LINES[lineIdx]} ${pick(r, MORE)} ${pick(r, MORE)}`,
      fields, status: 'active', tier: tierRoll(r()), hideExplicit: true,
      createdAt: t(60 * 24 * (3 + Math.floor(r() * 300))),
      lastActiveAt: online ? t(Math.floor(r() * 10)) : t(30 + Math.floor(r() * 60 * 24 * 6)),
    };
    if (i % 7 === 5) { m.createdAt = t(60 * 24 * (1 + (i % 9))); m.verifiedAt = m.createdAt; } // a few new members
    if (name === 'Rosa' && big) {
      m.about = "Weekend hiker, weekday baker. I was diagnosed a few years ago and it took a while to feel like myself again. Now I'm ready to meet someone kind, curious and up for a sunrise trail now and then.";
      m.fields = { ...m.fields, hsv_status: ['HSV-2'], relationship_goal: 'Long-term', height: 168, kids: 'None, open to it', smoking: 'Never', drinking: 'Socially', interests: ['Hiking', 'Baking', 'Dogs', 'Podcasts', 'Camping'] };
      m.ageMin = 34; m.ageMax = 45; m.lastActiveAt = t(3); m.tier = 'paid';
    }
    members.push(m);
    const tone = TONES[i % TONES.length];
    const hasMain = r() > 0.12 || (big && i < 9);
    if (hasMain) photos.push({ id: `ph_${m.id}_main`, memberId: m.id, kind: 'main', rating: 'safe', status: 'approved', tone, sort: 0, createdAt: m.createdAt });
    const pubCount = name === 'Rosa' ? 5 : Math.floor(r() * 6);
    for (let k = 0; k < pubCount; k++) {
      photos.push({ id: `ph_${m.id}_pub${k}`, memberId: m.id, kind: 'public', rating: 'safe', status: 'approved', tone: TONES[(i + k + 1) % TONES.length], sort: k + 1, createdAt: m.createdAt });
    }
    const privCount = name === 'Rosa' ? 6 : r() < 0.4 ? 1 + Math.floor(r() * 5) : 0;
    for (let k = 0; k < privCount; k++) {
      photos.push({ id: `ph_${m.id}_priv${k}`, memberId: m.id, kind: 'private', rating: r() < 0.3 ? 'suggestive' : 'safe', status: 'approved', tone: TONES[(i + k + 3) % TONES.length], sort: 10 + k, createdAt: m.createdAt });
    }
  });

  // The demo member you sign in as.
  const demoLoc = lookupPostal('80202')!;
  const demo: Member = {
    id: `m_${site.slug}_demo`, displayName: 'Alex', verifiedAt: t(60 * 24 * 10), profileComplete: true,
    birthYear: year - 38, gender: 'man', seeking: ['woman'], ageMin: 30, ageMax: 45,
    city: demoLoc.city, region: demoLoc.region, country: 'US', postal: '80202', lat: demoLoc.lat, lng: demoLoc.lng,
    about: 'Denver transplant, weekend cyclist, and the friend who always brings snacks. Looking for something steady and fun.',
    fields: {}, status: 'active', tier: 'free', hideExplicit: true,
    createdAt: t(60 * 24 * 10), lastActiveAt: t(1),
    ...(opts.demoMemberHash ?? {}),
  };
  for (const f of fieldDefs) {
    if (f.key === 'hsv_status') demo.fields[f.key] = ['HSV-1'];
    else if (f.key === 'interests') demo.fields[f.key] = ['Hiking', 'Cooking', 'Live music', 'Dogs'];
    else if (f.key === 'relationship_goal') demo.fields[f.key] = 'Long-term';
    else if (f.type === 'height') demo.fields[f.key] = 180;
    else if (f.type === 'select' && f.options) demo.fields[f.key] = f.options[0];
    else if (f.type === 'multiselect' && f.options) demo.fields[f.key] = [f.options[0]];
  }
  members.push(demo);
  photos.push({ id: `ph_${demo.id}_main`, memberId: demo.id, kind: 'main', rating: 'safe', status: 'approved', tone: ['#CFE0DC', '#7FA39B'], sort: 0, createdAt: demo.createdAt });
  photos.push({ id: `ph_${demo.id}_pub0`, memberId: demo.id, kind: 'public', rating: 'safe', status: 'approved', tone: ['#E9DEC5', '#B8A27A'], sort: 1, createdAt: demo.createdAt });
  photos.push({ id: `ph_${demo.id}_priv0`, memberId: demo.id, kind: 'private', rating: 'safe', status: 'approved', tone: ['#D3DFEA', '#8CA3BA'], sort: 10, createdAt: demo.createdAt });

  const women = members.filter((m) => m.gender === 'woman');
  const byName = (n: string) => members.find((m) => m.displayName === n)!;

  // 12 likes and 31 views of Alex on AfterH, matching the mockup
  const likes: Like[] = some(r, women, Math.min(big ? 12 : 5, women.length)).map((m, i) => {
    if (i % 5 === 2) m.tier = 'vip';
    return { fromId: m.id, toId: demo.id, at: t(40 + i * 170), vip: m.tier === 'vip' || undefined };
  });
  const viewers = some(r, members.filter((m) => m.id !== demo.id), Math.min(big ? 31 : 9, members.length - 1));
  const views: View[] = viewers.map((m, i) => ({ viewerId: m.id, viewedId: demo.id, at: t(15 + i * 95) }));
  likes.push({ fromId: demo.id, toId: women[2].id, at: t(600) });

  const messages: Message[] = [];
  const access: PrivateAccess[] = [];
  const moderation: ModerationItem[] = [];
  if (big) {
    const rosa = byName('Rosa');
    const convo: [boolean, string, number][] = [
      [false, 'Hi! Your profile made me laugh. Is that really your dog in the kayak?', 52],
      [true, "Ha, yes. That's Biscuit. She tips us over about once a summer.", 47],
      [false, "Brave dog. I'm more of a dry-land hiker. Any favorite trails nearby?", 40],
      [true, 'A few! Want to compare notes over coffee this weekend?', 33],
    ];
    convo.forEach(([fromDemo, body, ago], i) => messages.push({
      id: `msg_seed_rosa_${i}`, fromId: fromDemo ? demo.id : rosa.id, toId: fromDemo ? rosa.id : demo.id,
      body, flags: [], held: false, at: t(ago), readAt: t(ago - 1),
    }));
    const priya = byName('Priya');
    messages.push({ id: 'msg_seed_priya_0', fromId: priya.id, toId: demo.id, body: 'Hey Alex, fellow live music fan here. Who was the last band you saw?', flags: [], held: false, at: t(95) });
    messages.push({ id: 'msg_seed_priya_1', fromId: priya.id, toId: demo.id, body: 'Also, I shared my private photos with you. No pressure!', flags: [], held: false, at: t(90) });
    access.push({ ownerId: priya.id, viewerId: demo.id, status: 'granted', updatedAt: t(90) });
    access.push({ ownerId: demo.id, viewerId: byName('Mei').id, status: 'requested', updatedAt: t(200) });

    // A held scam message and a report, so the moderation queue has work in it
    const marcus = byName('Marcus');
    marcus.about = 'Engineer on an oil rig, deployed overseas for a few more months. Honest and loyal.';
    messages.push({
      id: 'msg_seed_scam', fromId: marcus.id, toId: byName('Jen').id,
      body: "Hello dear, I'm stuck overseas and my bank card is blocked. Could you send a $200 Google Play gift card? I will pay you back when I land.",
      flags: ['scam_language'], held: true, at: t(25),
    });
    moderation.push({ id: 'mod_seed_scam', kind: 'message', refId: 'msg_seed_scam', memberId: marcus.id, summary: 'To Jen', reasons: ['gift cards', 'asking for money', 'common scam story'], status: 'pending', createdAt: t(25) });
    moderation.push({ id: 'mod_seed_report', kind: 'report', refId: 'rp_seed_1', memberId: marcus.id, summary: 'Asked me to move to WhatsApp right away and then asked about my bank.', reasons: ['reported by Carla', '1 report total'], status: 'pending', createdAt: t(70) });
    const tess = byName('Tess');
    photos.push({ id: 'ph_seed_pending', memberId: tess.id, kind: 'public', rating: 'safe', status: 'pending', tone: ['#E9DEC5', '#B8A27A'], sort: 9, createdAt: t(12) });
    moderation.push({ id: 'mod_seed_photo', kind: 'photo', refId: 'ph_seed_pending', memberId: tess.id, summary: 'New public photo, marked safe', reasons: ['new upload'], status: 'pending', createdAt: t(12) });
  }

  // Priya is VIP in the demo: with the paywall on, her messages stay readable for free members.
  if (big) byName('Priya').tier = 'vip';
  for (const msg of messages) msg.senderTier = members.find((m) => m.id === msg.fromId)?.tier ?? 'free';
  return { members, photos, likes, views, messages, access, moderation, pages: seedPages(site, now) };
}

function seedPages(site: Site, now: Date): ContentPage[] {
  const at = now.toISOString();
  const n = site.name;
  const pages: ContentPage[] = [
    { slug: 'about', kind: 'page', title: `About ${n}`, placement: 'footer', published: true, updatedAt: at,
      summary: `${n} is ${site.audience.toLowerCase()}.`,
      body: `${n} is ${site.audience.toLowerCase()}. It is part of the WhatBox network of niche dating communities.\n\nEvery member verifies an email address or phone number before they can browse, and our safety team reviews flagged messages and photos.\n\n[Site admin: tell your story here.]`,
      seoTitle: `About ${n}`, seoDescription: `${site.audience}. Verified members, private photos you control.` },
    { slug: 'privacy', kind: 'page', title: 'Privacy policy', placement: 'footer', published: true, updatedAt: at,
      summary: 'How we handle your information.', body: '[Privacy policy text goes here. Have counsel review before launch.]' },
    { slug: 'terms', kind: 'page', title: 'Terms of service', placement: 'footer', published: true, updatedAt: at,
      summary: 'The rules for using the site.', body: '[Terms of service text goes here. Have counsel review before launch.]' },
    { slug: 'safety-tips', kind: 'page', title: 'Safety tips', placement: 'footer', published: true, updatedAt: at,
      summary: 'Simple habits that keep online dating safe.',
      body: 'Meet somewhere public for the first few dates, and tell a friend where you will be.\n\nNever send money, gift cards or crypto to someone you met online, whatever the story.\n\nKeep the conversation on the site until you trust the person. Our screening cannot protect you on other apps.\n\nIf something feels off, report the member. Reports are private.' },
    { slug: 'faq', kind: 'page', title: 'Common questions', placement: 'footer', published: true, updatedAt: at,
      summary: 'Answers to what people ask most.',
      body: `Is ${n} free?\nYes. Joining, browsing and messaging are free. [Describe any optional upgrade here.]\n\nCan anyone see my profile without an account?\n${site.settings.mode === 'sensitive' ? 'No. Profiles are only visible to verified, signed-in members.' : 'Only if you turn on a public teaser in your settings. It is off by default.'}\n\nWhy do you need my email or phone?\nTo send a one-time code that proves you are a real person. It is never shown to other members.` },
  ];
  if (site.slug === 'afterh') {
    pages.push(
      { slug: 'dating-after-diagnosis', kind: 'article', category: 'Getting started', title: 'Dating after an HSV diagnosis', placement: 'guides', published: true, updatedAt: at,
        summary: 'A diagnosis changes less than it feels like on day one. Here is how members got back out there.',
        body: '[Sample article. The site admin writes and edits this page in Owner Admin.]\n\nA diagnosis can feel like a door closing. Many members say the hardest part was the first conversation, which is exactly the part this community takes off the table.' },
      { slug: 'talking-with-a-new-partner', kind: 'article', category: 'Relationships', title: 'Talking about HSV with a new partner', placement: 'guides', published: true, updatedAt: at,
        summary: 'When and how to bring it up, for the times you date outside the community.',
        body: '[Sample article. The site admin writes and edits this page in Owner Admin.]' },
      { slug: 'spotting-romance-scams', kind: 'article', category: 'Safety', title: 'Spotting romance scams', placement: 'guides', published: true, updatedAt: at,
        summary: 'Gift cards, overseas emergencies and "let\'s move to WhatsApp": the patterns to watch for.',
        body: 'Scammers follow scripts. The most common: they work overseas (an oil rig, the military, a contract job), they fall for you fast, and then an emergency comes up that only money can fix.\n\nOn this site, messages that ask for money, gift cards or crypto are paused for review before they reach anyone.' },
    );
  }
  return pages;
}
