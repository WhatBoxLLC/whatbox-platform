// Talks to WhatBox AI (apps/ai), the shared photo check service. Each photo is sent once, in the
// request body, with this site's id as the "account" so usage is counted per site. Nothing is stored there.
import { type AiAdmin, type AiCallerPatch, type PhotoChecker, type PhotoRating, RuleError, type Site } from '@whatbox/core';
import { config } from './config';

const TIMEOUT_MS = 20_000;

async function call<T>(path: string, key: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(config.aiUrl + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + key, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!res.ok) {
    // Pass the service's own plain-English refusals through (bad name, not found, too big).
    if (res.status < 500 && body.message) throw new RuleError(body.code ?? 'ai_error', body.message, res.status === 401 ? 502 : res.status);
    throw new Error(`WhatBox AI answered ${res.status}`);
  }
  return body as T;
}

export class HttpPhotoChecker implements PhotoChecker {
  async check(site: Site, data: Uint8Array) {
    const r = await call<{ rating: PhotoRating; contact: { kinds: string[] } }>(`/v1/photos/check?account=${encodeURIComponent(site.id)}`, config.aiApiKey, {
      method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: data as BodyInit,
    });
    return { rating: r.rating, contactKinds: r.contact?.kinds ?? [] };
  }
}

export class HttpAiAdmin implements AiAdmin {
  url = config.aiUrl;
  private json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  overview(month: string) { return call<Awaited<ReturnType<AiAdmin['overview']>>>(`/v1/admin/callers?month=${encodeURIComponent(month)}`, config.aiAdminKey); }
  addCaller(input: { name: string; billable: boolean; rateCents?: number }) { return call<Awaited<ReturnType<AiAdmin['addCaller']>>>('/v1/admin/callers', config.aiAdminKey, this.json('POST', input)); }
  updateCaller(id: string, patch: AiCallerPatch) { return call<Awaited<ReturnType<AiAdmin['updateCaller']>>>(`/v1/admin/callers/${encodeURIComponent(id)}`, config.aiAdminKey, this.json('PATCH', patch)); }
  replaceKey(id: string) { return call<Awaited<ReturnType<AiAdmin['replaceKey']>>>(`/v1/admin/callers/${encodeURIComponent(id)}/key`, config.aiAdminKey, this.json('POST')); }
}

export function createAiClients(): { photoChecker?: PhotoChecker; aiAdmin?: AiAdmin } {
  if (!config.aiUrl) return {};
  return {
    photoChecker: config.aiApiKey ? new HttpPhotoChecker() : undefined,
    aiAdmin: config.aiAdminKey ? new HttpAiAdmin() : undefined,
  };
}
