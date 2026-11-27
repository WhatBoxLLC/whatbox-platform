// In-process event hub: used directly by the preview, and by each API instance to reach its
// own open streams (the API relays between instances through Postgres NOTIFY).
import type { EventSink } from './repo';
import type { MemberEvent, Site } from './types';

type Listener = (ev: MemberEvent) => void;

export class LocalEventHub implements EventSink {
  private listeners = new Map<string, Set<Listener>>();
  private key(siteId: string, memberId: string) { return siteId + '|' + memberId; }
  emit(site: Site, memberId: string, ev: MemberEvent) { this.deliver(site.id, memberId, ev); }
  deliver(siteId: string, memberId: string, ev: MemberEvent) {
    for (const fn of this.listeners.get(this.key(siteId, memberId)) ?? []) {
      try { fn(ev); } catch { /* a broken listener must not stop the others */ }
    }
  }
  subscribe(siteId: string, memberId: string, fn: Listener): () => void {
    const k = this.key(siteId, memberId);
    if (!this.listeners.has(k)) this.listeners.set(k, new Set());
    this.listeners.get(k)!.add(fn);
    return () => {
      const set = this.listeners.get(k);
      set?.delete(fn);
      if (set && !set.size) this.listeners.delete(k);
    };
  }
  get size() { let n = 0; for (const s of this.listeners.values()) n += s.size; return n; }
}
