// Builds a fully seeded, in-memory platform. Used by tests and the browser preview.
import { DevKeyProvider, SiteCrypto } from './crypto';
import { MemoryControlRepo, MemorySiteRepo, type ControlSnapshot, type SiteSnapshot } from './memory-repo';
import type { Clock, IdTokenVerifier, Notifier } from './repo';
import { DEMO_MEMBER_EMAIL, seedAdmins, seedSite, seedSites } from './seed';
import { Platform } from './services';

export interface MemoryPlatformSnapshot { v: 1; control: ControlSnapshot; sites: Record<string, SiteSnapshot> }

export interface MemoryPlatform {
  platform: Platform;
  control: MemoryControlRepo;
  sites: Map<string, MemorySiteRepo>;
  snapshot(): MemoryPlatformSnapshot;
  sentCodes: { site: string; channel: string; target: string; code: string }[];
}

export async function createMemoryPlatform(opts: {
  snapshot?: MemoryPlatformSnapshot | null;
  onChange?: () => void;
  clock?: Clock;
  exposeDevCodes?: boolean;
  masterKey?: string;
  rateLimitScale?: number;
  idTokens?: IdTokenVerifier;
} = {}): Promise<MemoryPlatform> {
  const keys = new DevKeyProvider(opts.masterKey ?? 'preview-master-key');
  const now = opts.clock?.now() ?? new Date();
  const sentCodes: MemoryPlatform['sentCodes'] = [];
  let control: MemoryControlRepo;
  const sites = new Map<string, MemorySiteRepo>();

  if (opts.snapshot?.v === 1) {
    control = new MemoryControlRepo(opts.snapshot.control);
    for (const [id, snap] of Object.entries(opts.snapshot.sites)) sites.set(id, new MemorySiteRepo(snap));
  } else {
    control = new MemoryControlRepo({ sites: seedSites(now), admins: seedAdmins(), sessions: [] });
    for (const site of control.sites) {
      const crypto = new SiteCrypto(keys, site.id);
      const seed = seedSite(site, now, {
        demoMemberHash: { emailHash: await crypto.lookupHash(DEMO_MEMBER_EMAIL), emailEnc: await crypto.encrypt(DEMO_MEMBER_EMAIL) },
      });
      sites.set(site.id, new MemorySiteRepo(seed));
    }
  }

  const notifier: Notifier = {
    async sendCode({ site, channel, target, code }) { sentCodes.push({ site: site.slug, channel, target, code }); },
  };

  const platform = new Platform({
    control,
    siteRepo: (id) => {
      let r = sites.get(id);
      if (!r) { r = new MemorySiteRepo(); sites.set(id, r); }
      return r;
    },
    keys, notifier, clock: opts.clock, exposeDevCodes: opts.exposeDevCodes ?? true, onChange: opts.onChange, rateLimitScale: opts.rateLimitScale, idTokens: opts.idTokens,
  });

  return {
    platform, control, sites, sentCodes,
    snapshot: () => ({
      v: 1, control: control.snapshot(),
      sites: Object.fromEntries([...sites.entries()].map(([k, v]) => [k, v.snapshot()])),
    }),
  };
}
