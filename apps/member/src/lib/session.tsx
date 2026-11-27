import type { MemberApi, MemberEvent, MyProfile, PublicSite } from '@whatbox/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { registerForPush } from './push';
import { Platform } from 'react-native';
import { DEFAULT_SITE, memberApi } from './backend';
import { storage } from './storage';

interface SessionState {
  api: MemberApi;
  site: PublicSite;
  siteKey: string;
  me: MyProfile | null;
  ready: boolean;
  signedIn: boolean;
  signIn(token: string): Promise<MyProfile | null>;
  signOut(): Promise<void>;
  refreshMe(): Promise<MyProfile | null>;
  setMe(me: MyProfile): void;
  switchSite(key: string): Promise<void>;
  unread: number;
  refreshUnread(): void;
  onEvent(fn: (ev: MemberEvent) => void): () => void; // live updates for screens
}

const Ctx = createContext<SessionState | null>(null);
const tokenKey = (site: string) => `whatbox.token.${site}`;
const SITE_KEY = 'whatbox.preview.site';

function initialSite(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('site');
    if (q) return q;
  }
  return DEFAULT_SITE;
}

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [api, setApi] = useState<MemberApi | null>(null);
  const [site, setSite] = useState<PublicSite | null>(null);
  const [me, setMe] = useState<MyProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listeners = useRef(new Set<(ev: MemberEvent) => void>());

  // One live stream per signed-in session; screens listen through onEvent.
  const live = signedIn && !!me?.member.profileComplete;
  useEffect(() => {
    if (!api || !live) return;
    const off = api.subscribe((ev) => {
      if (ev.type === 'message') api.unreadCount().then(setUnread).catch(() => {});
      for (const fn of listeners.current) fn(ev);
    });
    registerForPush(api).catch(() => {});
    return off;
  }, [api, live]);

  const load = useCallback(async (key: string) => {
    try {
      const a = await memberApi(key);
      const s = await a.site();
      const token = await storage.get(tokenKey(key));
      a.setToken(token);
      let profile: MyProfile | null = null;
      if (token) {
        try { profile = await a.me(); } catch { a.setToken(null); await storage.set(tokenKey(key), null); }
      }
      setApi(a); setSite(s); setMe(profile); setSignedIn(!!profile); setSiteKey(key);
      if (profile?.member.profileComplete) a.unreadCount().then(setUnread).catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the site.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const saved = Platform.OS === 'web' ? null : await storage.get(SITE_KEY);
      load(saved || initialSite());
    })();
  }, [load]);

  const value = useMemo<SessionState | null>(() => {
    if (!api || !site || !siteKey) return null;
    return {
      api, site, siteKey, me, ready: true, signedIn, unread,
      async signIn(token) {
        api.setToken(token);
        await storage.set(tokenKey(siteKey), token);
        const p = await api.me();
        setMe(p); setSignedIn(true);
        return p;
      },
      async signOut() {
        try { await api.signOut(); } catch {}
        await storage.set(tokenKey(siteKey), null);
        setMe(null); setSignedIn(false); setUnread(0);
      },
      async refreshMe() {
        try { const p = await api.me(); setMe(p); return p; } catch { return null; }
      },
      setMe,
      async switchSite(key) {
        await storage.set(SITE_KEY, key);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const u = new URL(window.location.href);
          u.searchParams.set('site', key);
          window.history.replaceState(null, '', u.toString());
        }
        setApi(null);
        await load(key);
      },
      refreshUnread() { api.unreadCount().then(setUnread).catch(() => {}); },
      onEvent(fn) { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; },
    };
  }, [api, site, siteKey, me, signedIn, unread, load]);

  if (error) return <>{fallback}</>;
  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
