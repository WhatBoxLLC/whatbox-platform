// Pure business rules. No I/O, so they are easy to test and identical on server and client.
import type { MessageFlag, PhotoKind, PhotoRating, Site } from './types';

export const PHOTO_LIMITS: Record<PhotoKind, number> = { main: 1, public: 6, private: 6 };
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;

export class RuleError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function ageFromBirthYear(birthYear: number, now: Date): number {
  return now.getUTCFullYear() - birthYear;
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function checkPhotoAllowed(
  site: Site,
  kind: PhotoKind,
  rating: PhotoRating,
  existing: { kind: PhotoKind }[],
): void {
  const count = existing.filter((p) => p.kind === kind).length;
  if (kind !== 'main' && count >= PHOTO_LIMITS[kind]) {
    throw new RuleError('photo_limit', `You can have up to ${PHOTO_LIMITS[kind]} ${kind} photos.`);
  }
  if (rating === 'explicit') {
    if (kind !== 'private') throw new RuleError('explicit_not_private', 'Explicit photos can only be private.');
    if (!site.settings.explicitPhotosAllowed) {
      throw new RuleError('explicit_disabled', `${site.name} does not allow explicit photos.`);
    }
  }
}

// ---------- Message screening ----------

const EMAIL_RE = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\sat\s)\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|app|ly)\b(?:\/\S*)?/gi;
// 10+ digits, allowing spaces, dots, dashes, parentheses between them
const PHONE_RE = /(?:\+?\d[\s().-]*){10,}/g;
const HANDLE_RE = /\b(?:whats\s?app|telegram|signal|snap(?:chat)?|insta(?:gram)?|kik|wechat|hangouts|google\s?chat|ig)\b\s*[:@-]?\s*@?[\w.]{0,30}/gi;
const SPELLED_DIGITS_RE = /\b(?:(?:zero|one|two|three|four|five|six|seven|eight|nine)[\s,.-]*){7,}/gi;

export interface ContactMatch { start: number; end: number; kind: 'email' | 'url' | 'phone' | 'handle' }

export function findContactInfo(text: string): ContactMatch[] {
  const out: ContactMatch[] = [];
  const scan = (re: RegExp, kind: ContactMatch['kind']) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const s = m[0].trimEnd();
      if (s.length) out.push({ start: m.index, end: m.index + s.length, kind });
    }
  };
  scan(EMAIL_RE, 'email');
  scan(URL_RE, 'url');
  scan(PHONE_RE, 'phone');
  scan(SPELLED_DIGITS_RE, 'phone');
  scan(HANDLE_RE, 'handle');
  // merge overlaps
  out.sort((a, b) => a.start - b.start);
  const merged: ContactMatch[] = [];
  for (const m of out) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else merged.push({ ...m });
  }
  return merged;
}

export function maskContactInfo(text: string): string {
  const matches = findContactInfo(text);
  if (!matches.length) return text;
  let out = '';
  let pos = 0;
  for (const m of matches) {
    out += text.slice(pos, m.start) + '[hidden until you both share contact info]';
    pos = m.end;
  }
  return out + text.slice(pos);
}

const SCAM_PATTERNS: [RegExp, string][] = [
  [/\b(gift\s?cards?|itunes\s?cards?|steam\s?cards?|google\s?play\s?cards?)\b/i, 'gift cards'],
  [/\b(western\s?union|money\s?gram|wire\s?(me|the)?\s?money|bank\s?transfer)\b/i, 'money transfer'],
  [/\b(bitcoin|crypto|usdt|binance|forex|trading\s?platform|investment\s?opportunity)\b/i, 'crypto or investment'],
  [/\b(send|lend|loan|need)\b.{0,30}\b(money|cash|\$\s?\d+|dollars|funds)\b/i, 'asking for money'],
  [/\b(cash\s?app|venmo|zelle|paypal\s?me)\b/i, 'payment app'],
  [/\b(customs\s?fee|stuck\s?(at|in)\s?the\s?airport|oil\s?rig|deployed\s?overseas|inheritance)\b/i, 'common scam story'],
  [/\b(verify|verification)\b.{0,25}\b(link|code|site)\b/i, 'off-site verification'],
];

export function findScamSignals(text: string): string[] {
  return SCAM_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export function normalizeForDuplicate(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface ScreenInput {
  body: string;
  site: Site;
  isNewConversation: boolean;
  recentFromSender: { toId: string; body: string; at: string }[]; // last 24h
  now: Date;
}

export interface ScreenResult {
  flags: MessageFlag[];
  hold: boolean;
  reasons: string[];
  reject?: RuleError;
}

// Runs for every member, premium or not.
export function screenMessage(input: ScreenInput): ScreenResult {
  const { body, site, now } = input;
  const limits = site.settings.messageLimits;
  const flags: MessageFlag[] = [];
  const reasons: string[] = [];
  let hold = false;

  const minuteAgo = now.getTime() - 60_000;
  const hourAgo = now.getTime() - 3_600_000;
  const lastMinute = input.recentFromSender.filter((m) => Date.parse(m.at) >= minuteAgo);
  if (lastMinute.length >= limits.messagesPerMinute) {
    return {
      flags: ['throttled'],
      hold: false,
      reasons: ['too many messages per minute'],
      reject: new RuleError('throttled', 'You are sending messages too quickly. Please wait a minute.', 429),
    };
  }
  if (input.isNewConversation) {
    const firstsLastHour = new Set<string>();
    const seen = new Set<string>();
    // a recipient counts as "new this hour" if the earliest message to them in the window is within the hour
    const sorted = [...input.recentFromSender].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (const m of sorted) {
      if (seen.has(m.toId)) continue;
      seen.add(m.toId);
      if (Date.parse(m.at) >= hourAgo) firstsLastHour.add(m.toId);
    }
    if (firstsLastHour.size >= limits.newConversationsPerHour) {
      return {
        flags: ['throttled'],
        hold: false,
        reasons: ['too many new conversations per hour'],
        reject: new RuleError(
          'throttled',
          `You can start ${limits.newConversationsPerHour} new conversations per hour. Try again later.`,
          429,
        ),
      };
    }
  }

  if (findContactInfo(body).length) {
    flags.push('contact_info');
  }
  const scam = findScamSignals(body);
  if (scam.length) {
    flags.push('scam_language');
    reasons.push(...scam);
    hold = true;
  }
  const norm = normalizeForDuplicate(body);
  if (norm.length >= 20) {
    const recipients = new Set(
      input.recentFromSender.filter((m) => normalizeForDuplicate(m.body) === norm).map((m) => m.toId),
    );
    if (recipients.size + 1 >= limits.duplicateRecipientThreshold) {
      flags.push('duplicate');
      reasons.push(`same message sent to ${recipients.size + 1} people`);
      hold = true;
    }
  }
  return { flags, hold, reasons };
}

export function photoVisibleTo(
  args: {
    rating: PhotoRating;
    platform: 'web' | 'ios' | 'android';
    viewerHidesExplicit: boolean;
  },
): 'show' | 'app_safe' | 'filtered' {
  if (args.rating !== 'explicit') return 'show';
  if (args.platform !== 'web') return 'app_safe'; // never in the store apps
  if (args.viewerHidesExplicit) return 'filtered';
  return 'show';
}
