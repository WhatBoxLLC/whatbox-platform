// HTTP implementation of the client contract, talking to apps/api.
import { ApiError, type AdminApi, type MemberApi } from './api';
import type { ClientPlatform } from './types';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

function makeRequest(baseUrl: string, headers: () => Record<string, string>) {
  return async function req<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const res = await fetch(baseUrl.replace(/\/$/, '') + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(data?.code ?? 'http_' + res.status, data?.message ?? res.statusText, res.status);
    return data as T;
  };
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
    addPhoto: (input) => req('POST', '/v1/me/photos', input),
    updatePhoto: (id, patch) => req('PATCH', '/v1/me/photos/' + id, patch),
    deletePhoto: (id) => req('DELETE', '/v1/me/photos/' + id),
    setTier: (tier) => req('POST', '/v1/me/tier', { tier }),
    privateAccess: () => req('GET', '/v1/me/private-access'),
    requestAccess: (ownerId) => req<{ status: 'requested' | 'granted' }>('POST', `/v1/members/${ownerId}/private-access`).then((r) => r.status),
    decideAccess: (viewerId, action) => req('POST', `/v1/me/private-access/${viewerId}`, { action }),
    search: (filters) => req('GET', '/v1/members' + qs(filters as Record<string, unknown>)),
    profile: (id) => req('GET', '/v1/members/' + id),
    like: (id, on) => req(on ? 'POST' : 'DELETE', `/v1/members/${id}/like`),
    pass: (id) => req('POST', `/v1/members/${id}/pass`, {}),
    discover: () => req('GET', '/v1/discover'),
    block: (id, on) => req(on ? 'POST' : 'DELETE', `/v1/members/${id}/block`),
    report: (id, reason) => req('POST', `/v1/members/${id}/report`, { reason }),
    activity: (kind) => req('GET', '/v1/activity/' + kind),
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
    pages: (id) => req('GET', s(id) + '/pages'),
    savePage: (id, page) => req('PUT', s(id) + '/pages/' + page.slug, page),
    deletePage: (id, slug) => req('DELETE', s(id) + '/pages/' + slug),
  };
}
