// Server-side helpers: which site is this request for, and fetch its public data from the API.
import type { ContentPage, PublicSite } from '@whatbox/core';
import { headers } from 'next/headers';
import { cache } from 'react';

const API = process.env.API_URL ?? 'http://localhost:4000';
// Where "Join" and "Sign in" go. In Azure: APP_URL=https://app.{host}, so afterh.com links to app.afterh.com.
export async function appUrl(): Promise<string> {
  const tpl = process.env.APP_URL ?? 'http://localhost:8081';
  if (!tpl.includes('{host}')) return tpl;
  const host = await siteKey();
  // Not on a real site domain (local dev, the default Azure address): use the member app's own address.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return process.env.APP_URL_DEFAULT ?? 'http://localhost:8081';
  return tpl.replace('{host}', host);
}

export async function siteKey(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0].replace(/^www\./, '');
  // Local dev and the default Azure address aren't site domains: use the configured default site.
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.azurecontainerapps.io')) return process.env.DEFAULT_SITE ?? 'afterh';
  return host;
}

async function get<T>(key: string, path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { 'X-Site': key }, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API ${path} ${res.status}`);
  return res.json();
}

export const getSite = cache(async () => get<PublicSite>(await siteKey(), '/v1/site'));
export const getPages = cache(async () => get<ContentPage[]>(await siteKey(), '/v1/site/pages'));
export async function getPage(slug: string) {
  const res = await fetch(API + '/v1/site/pages/' + encodeURIComponent(slug), { headers: { 'X-Site': await siteKey() }, next: { revalidate: 60 } });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as ContentPage | null) : null;
}

export async function baseUrl() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
