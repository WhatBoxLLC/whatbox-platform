// Checks one photo. The image lives only in memory for the length of the request.
import { findContactInfo } from '@whatbox/core';
import { randomBytes } from 'node:crypto';
import jsQR from 'jsqr';
import sharp from 'sharp';
import type { CheckResult, ContactKind, Engines, Rating } from './types';

export const MAX_BYTES = 10 * 1024 * 1024;
const ENGINE_EDGE = 2048; // Content Safety takes up to 4 MB; a 2048px JPEG stays well under
const QR_EDGE = 1200;

export class CheckError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

// Content Safety returns 0, 2, 4 or 6. 2 is "low" (revealing clothing, suggestive poses); 4 and up
// is nudity or sexual activity.
export function ratingFor(severity: number): Rating {
  if (severity >= 4) return 'explicit';
  if (severity >= 2) return 'suggestive';
  return 'safe';
}

export function contactIn(text: string): { kind: ContactKind; text: string }[] {
  if (!text.trim()) return [];
  // OCR splits text into lines; a phone number can wrap, so check the joined text too.
  const seen = new Set<string>();
  const out: { kind: ContactKind; text: string }[] = [];
  for (const t of [text, text.replace(/\s*\n\s*/g, ' ')]) {
    for (const m of findContactInfo(t)) {
      const s = t.slice(m.start, m.end).trim();
      const k = m.kind + ':' + s.replace(/\s+/g, '').toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push({ kind: m.kind, text: s }); }
    }
  }
  return out;
}

async function decodeQr(img: sharp.Sharp): Promise<string[]> {
  const { data, info } = await img.clone()
    .resize({ width: QR_EDGE, height: QR_EDGE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hit = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, { inversionAttempts: 'attemptBoth' });
  return hit?.data ? [hit.data] : [];
}

export async function checkPhoto(input: Buffer, engines: Engines, want: { adult: boolean; contact: boolean }): Promise<CheckResult> {
  const started = Date.now();
  if (!input.byteLength) throw new CheckError('no_image', 'Send the photo as the request body.');
  if (input.byteLength > MAX_BYTES) throw new CheckError('too_big', 'Photos can be up to 10 MB.', 413);
  let base: sharp.Sharp;
  try {
    base = sharp(input, { limitInputPixels: 50_000_000 }).rotate();
    const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
    if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif', 'gif', 'tiff'].includes(meta.format)) throw new Error('format');
  } catch {
    throw new CheckError('not_an_image', 'That file is not a photo we can read. Send a JPEG, PNG, WebP or HEIC.', 415);
  }
  const jpeg = await base.clone()
    .resize({ width: ENGINE_EDGE, height: ENGINE_EDGE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();

  const [severity, text, qr] = await Promise.all([
    want.adult ? engines.adultSeverity(jpeg) : Promise.resolve(0),
    want.contact ? engines.readText(jpeg) : Promise.resolve(''),
    want.contact ? decodeQr(base) : Promise.resolve([] as string[]),
  ]);

  const matches = want.contact ? [...contactIn(text), ...qr.map((q) => ({ kind: 'qr' as const, text: q.slice(0, 200) }))] : [];
  const kinds = [...new Set(matches.map((m) => m.kind))];
  return {
    id: 'chk_' + randomBytes(8).toString('hex'),
    rating: want.adult ? ratingFor(severity) : 'safe',
    adult: { checked: want.adult, severity },
    contact: { checked: want.contact, found: matches.length > 0, kinds, matches },
    ms: Date.now() - started,
  };
}
