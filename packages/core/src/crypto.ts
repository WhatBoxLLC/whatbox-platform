// Per-site field encryption using WebCrypto, which exists in Node 20+ and every browser.
// Each site has its own key. In Azure the key comes from that site's Key Vault secret;
// in local dev it is derived from DEV_MASTER_KEY + site id so nothing is shared by accident.

export interface KeyProvider {
  // 32 bytes of key material for this site
  siteKey(siteId: string): Promise<Uint8Array>;
}

const te = new TextEncoder();
const td = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = (globalThis as any).crypto;
  if (!c?.subtle) throw new Error('WebCrypto is not available');
  return c.subtle;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  (globalThis as any).crypto.getRandomValues(bytes);
  return prefix + hex(bytes.buffer);
}

export function randomCode(): string {
  const n = new Uint32Array(1);
  (globalThis as any).crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
}

export async function hmacHex(key: Uint8Array, data: string): Promise<string> {
  const k = await subtle().importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await subtle().sign('HMAC', k, te.encode(data)));
}

export class DevKeyProvider implements KeyProvider {
  private cache = new Map<string, Uint8Array>();
  constructor(private master: string) {}
  async siteKey(siteId: string): Promise<Uint8Array> {
    let k = this.cache.get(siteId);
    if (!k) {
      const h = await hmacHex(te.encode(this.master), 'site-key:' + siteId);
      k = new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
      this.cache.set(siteId, k);
    }
    return k;
  }
}

export class SiteCrypto {
  constructor(private keys: KeyProvider, private siteId: string) {}

  async lookupHash(value: string): Promise<string> {
    return hmacHex(await this.keys.siteKey(this.siteId), 'lookup:' + value.trim().toLowerCase());
  }

  async encrypt(plain: string): Promise<string> {
    const raw = await this.keys.siteKey(this.siteId);
    const key = await subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt']);
    const iv = new Uint8Array(12);
    (globalThis as any).crypto.getRandomValues(iv);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, te.encode(plain)));
    return 'v1.' + b64(iv) + '.' + b64(ct);
  }

  async decrypt(token: string): Promise<string> {
    const [v, ivs, cts] = token.split('.');
    if (v !== 'v1') throw new Error('unknown ciphertext version');
    const raw = await this.keys.siteKey(this.siteId);
    const key = await subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, ['decrypt']);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(ivs) as BufferSource }, key, unb64(cts) as BufferSource);
    return td.decode(pt);
  }
}
