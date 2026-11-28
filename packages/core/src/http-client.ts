// HTTP implementation of the client contract, talking to apps/api.
import { ApiError, type AdminApi, type MemberApi } from './api';
import type { ClientPlatform, MemberEvent } from './types';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

function makeRequest(baseUrl: string, headers: () => Record<string, string>) {
  return async function req<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const form = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await fetch(baseUrl.replace(/\/$/, '') + path, {
      method,
      headers: form ? headers() : { 'Content-Type': 'application/json', ...headers() },
      body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(data?.code ?? 'http_' + res.status, data?.message ?? res.statusText, res.status);
    return data as T;
  };
}

// Server-sent events over XMLHttpRequest: works in browsers and React Native alike, and unlike
// EventSource it can send the Authorization header. Reconnects with backoff until unsubscribed.
function streamEvents(url: string, headers: () => Record<string, string>, onEvent: (ev: MemberEvent) => void): () => void {
  let xhr: XMLHttpRequest | null = null;
  let stopped = false;
  let retry = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const connect = () => {
    if (stopped) return;
    let seen = 0;
    let buf = '';
    xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    for (const [k, v] of Object.entries(headers())) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.onprogress = () => {
      const text = xhr!.responseText;
      buf += text.slice(seen);
      seen = text.length;
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
        if (data) { retry = 1000; try { onEvent(JSON.parse(data)); } catch { /* ignore malformed */ } }
      }
      // long-lived streams: start fresh before the buffer grows large
      if (seen > 1_000_000) xhr!.abort();
    };
    const again = () => {
      if (stopped) return;
      if (xhr && xhr.status === 401) { stopped = true; return; }
      timer = setTimeout(connect, retry);
      retry = Math.min(retry * 2, 30_000);
    };
    xhr.onerror = again;
    xhr.onload = again; // server closed the stream
    xhr.onabort = again;
    xhr.send();
  };
  connect();
  return () => { stopped = true; if (timer) clearTimeout(timer); xhr?.abort(); };
}

const qs = (o: Record<string, unknown>) =>
  '?' + new URLSearchParams({ q: JSON.stringify(o) }).toString();

export function createHttpMemberApi(baseUrl: string, siteKey: string, platform: ClientPlatform): MemberApi {
  let token: string | null = null;
  const req = makeRequest(baseUrl, () => ({
    'X-Site': siteKey,
    'X-Client-Platform': platform,
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }));
  return {
    siteKey,
    setToken: (t) => { token = t; },
    site: () => req('GET', '/v1/site'),
    pages: () => req('GET', '/v1/site/pages'),
    page: (slug) => req('GET', '/v1/site/pages/' + encodeURIComponent(slug)),
    startVerification: (channel, target) => req('POST', '/v1/auth/start', { channel, target }),
    verify: (challengeId, code) => req('POST', '/v1/auth/verify', { challengeId, code }),
    signOut: async () => { await req('POST', '/v1/auth/sign-out'); token = null; },
    me: () => req('GET', '/v1/me'),
    updateMe: (patch) => req('PATCH', '/v1/me', patch),
    geoCountries: () => req('GET', '/v1/geo/countries'),
    geoSearch: (country, q) => req('GET', `/v1/geo/search?${new URLSearchParams({ ...(country ? { country } : {}), q })}`),
    geoNear: (lat, lng) => req('GET', `/v1/geo/near?lat=${lat}&lng=${lng}`),
    addPhoto: async (input) => {
      if (!input.url) return req('POST', '/v1/me/photos', input);
      // Real files go up as multipart. The web passes a data: or blob: URI; native passes a file:// URI.
      const fd = new FormData();
      fd.append('kind', input.kind);
      if (input.rating) fd.append('rating', input.rating);
      if (typeof document !== 'undefined') fd.append('file', await (await fetch(input.url)).blob(), 'photo');
      else fd.append('file', { uri: input.url, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
      return req('POST', '/v1/me/photos/upload', fd);
    },
    updatePhoto: (id, patch) => req('PATCH', '/v1/me/photos/' + id, patch),
    deletePhoto: (id) => req('DELETE', '/v1/me/photos/' + id),
    setTier: (tier) => req('POST', '/v1/me/tier', { tier }),
    checkout: (tier, urls) => req('POST', '/v1/me/checkout', { tier, ...urls }),
    cancelSubscription: () => req('POST', '/v1/me/subscription/cancel', {}),
    privateAccess: () => req('GET', '/v1/me/private-access'),
    requestAccess: (ownerId) => req<{ status: 'requested' | 'granted' }>('POST', `/v1/members/${ownerId}/private-access`).then((r) => r.status),
    decideAccess: (viewerId, action) => req('POST', `/v1/me/private-access/${viewerId}`, { action }),
    search: (filters) => req('GET', '/v1/members' + qs(filters as Record<string, unknown>)),
    profile: (id) => req('GET', '/v1/members/' + id),
    previewProfile: () => req('GET', '/v1/me/preview'),
    like: (id, on) => req(on ? 'POST' : 'DELETE', `/v1/members/${id}/like`),
    pass: (id) => req('POST', `/v1/members/${id}/pass`, {}),
    discover: () => req('GET', '/v1/discover'),
    block: (id, on) => req(on ? 'POST' : 'DELETE', `/v1/members/${id}/block`),
    report: (id, reason) => req('POST', `/v1/members/${id}/report`, { reason }),
    activity: (kind) => req('GET', '/v1/activity/' + kind),
    subscribe: (onEvent) => {
      if (typeof XMLHttpRequest === 'undefined' || !token) return () => {};
      return streamEvents(baseUrl.replace(/\/$/, '') + '/v1/events', () => ({
        'X-Site': siteKey, 'X-Client-Platform': platform, ...(token ? { Authorization: 'Bearer ' + token } : {}),
      }), onEvent);
    },
    registerPush: (t, p) => req('POST', '/v1/me/push', { token: t, platform: p }),
    favorite: (id, on) => req(on ? 'POST' : 'DELETE', `/v1/members/${id}/favorite`),
    deleteAccount: async (confirm) => { const r = await req<{ deleted: boolean }>('POST', '/v1/me/delete', { confirm }); token = null; return r; },
    signInWithProvider: (provider, idToken) => req('POST', '/v1/auth/provider', { provider, idToken }),
    conversations: () => req('GET', '/v1/conversations'),
    conversation: (id) => req('GET', '/v1/conversations/' + id),
    send: (id, body) => req('POST', '/v1/conversations/' + id, { body }),
    shareContact: (id) => req('POST', `/v1/conversations/${id}/share-contact`),
    unreadCount: () => req<{ count: number }>('GET', '/v1/conversations/unread').then((r) => r.count),
  };
}

export function createHttpAdminApi(baseUrl: string): AdminApi {
  let token: string | null = null;
  const req = makeRequest(baseUrl, (): Record<string, string> => (token ? { Authorization: 'Bearer ' + token } : {}));
  const s = (id: string) => '/v1/admin/sites/' + id;
  return {
    setToken: (t) => { token = t; },
    start: (email) => req('POST', '/v1/admin/auth/start', { email }),
    verify: (challengeId, code) => req('POST', '/v1/admin/auth/verify', { challengeId, code }),
    me: () => req('GET', '/v1/admin/me'),
    site: (id) => req('GET', s(id)),
    updateSite: (id, patch) => req('PATCH', s(id), patch),
    saveField: (id, def) => req('PUT', s(id) + '/fields/' + def.key, def),
    deleteField: (id, key) => req('DELETE', s(id) + '/fields/' + key),
    stats: (id) => req('GET', s(id) + '/stats'),
    moderation: (id, status) => req('GET', s(id) + '/moderation?status=' + status),
    decide: (id, item, decision) => req('POST', s(id) + '/moderation/' + item, { decision }),
    members: (id, o) => req('GET', s(id) + '/members?search=' + encodeURIComponent(o.search ?? '') + '&page=' + (o.page ?? 1)),
    setMemberStatus: (id, m, status) => req('PATCH', s(id) + '/members/' + m, { status }),
    setMemberTier: (id, m, tier) => req('PATCH', s(id) + '/members/' + m + '/tier', { tier }),
    audit: (siteId) => req('GET', '/v1/admin/audit' + (siteId ? '?site=' + encodeURIComponent(siteId) : '')),
    platform: (month) => req('GET', '/v1/admin/platform' + (month ? '?month=' + encodeURIComponent(month) : '')),
    createSite: (input) => req('POST', '/v1/admin/platform/sites', input),
    platformUpdateSite: (id, patch) => req('PATCH', '/v1/admin/platform/sites/' + encodeURIComponent(id), patch),
    saveOwner: (input) => req('POST', '/v1/admin/platform/owners', input),
    deleteOwner: (id) => req('DELETE', '/v1/admin/platform/owners/' + encodeURIComponent(id)),
    pages: (id) => req('GET', s(id) + '/pages'),
    savePage: (id, page) => req('PUT', s(id) + '/pages/' + page.slug, page),
    deletePage: (id, slug) => req('DELETE', s(id) + '/pages/' + slug),
  };
}
