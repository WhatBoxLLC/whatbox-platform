// Picks the backend. With EXPO_PUBLIC_API_URL set, the app talks to apps/api over HTTP.
// Without it (the clickable preview), the same core services run in the browser on seeded
// demo data, saved to this browser's storage.
import {
  createHttpAdminApi, createHttpMemberApi, createLocalAdminApi, createLocalMemberApi, createMemoryPlatform,
  type AdminApi, type MemberApi, type MemoryPlatform, type MemoryPlatformSnapshot,
} from '@whatbox/core';
import { Platform } from 'react-native';
import { storage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
export const DEFAULT_SITE = process.env.EXPO_PUBLIC_SITE || 'afterh';
export const IS_PREVIEW = !API_URL;
const SNAP_KEY = 'whatbox.preview.v3';
const clientPlatform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

let memory: Promise<MemoryPlatform> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function local(): Promise<MemoryPlatform> {
  if (!memory) {
    memory = (async () => {
      const raw = await storage.get(SNAP_KEY);
      let snapshot: MemoryPlatformSnapshot | null = null;
      try { snapshot = raw ? JSON.parse(raw) : null; } catch { snapshot = null; }
      const mp: MemoryPlatform = await createMemoryPlatform({
        rateLimitScale: 100, // the demo signs in as the same people over and over
        snapshot,
        exposeDevCodes: true,
        onChange: () => {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(() => { storage.set(SNAP_KEY, JSON.stringify(mp.snapshot())); }, 250);
        },
      });
      return mp;
    })();
  }
  return memory;
}

export async function resetPreviewData() {
  await storage.set(SNAP_KEY, null);
  memory = null;
}

export async function memberApi(siteKey: string): Promise<MemberApi> {
  if (API_URL) return createHttpMemberApi(API_URL, siteKey, clientPlatform);
  return createLocalMemberApi((await local()).platform, siteKey, clientPlatform);
}

export async function adminApi(): Promise<AdminApi> {
  if (API_URL) return createHttpAdminApi(API_URL);
  return createLocalAdminApi((await local()).platform);
}
