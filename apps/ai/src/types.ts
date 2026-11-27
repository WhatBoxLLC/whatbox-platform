export type Rating = 'safe' | 'suggestive' | 'explicit';
export type ContactKind = 'email' | 'url' | 'phone' | 'handle' | 'qr';

// What a caller gets back for one photo. Nothing in it is stored by WhatBox AI.
export interface CheckResult {
  id: string; // for support only; not linked to any stored photo
  rating: Rating; // 'safe' when the adult check was not asked for
  adult: { checked: boolean; severity: number }; // Azure AI Content Safety "Sexual" severity, 0 to 7
  contact: {
    checked: boolean;
    found: boolean;
    kinds: ContactKind[];
    matches: { kind: ContactKind; text: string }[]; // what was found, so a moderator can see why
  };
  ms: number;
}

export interface Caller {
  id: string;
  name: string;
  keyHint: string;
  billable: boolean;
  rateCents: number; // per photo checked, only when billable
  perMinute: number;
  enabled: boolean;
  createdAt: string;
}

export interface UsageCounts { checks: number; flaggedAdult: number; flaggedContact: number }
export interface UsageRow extends UsageCounts { callerId: string; account: string }

export interface Store {
  callerByKeyHash(hash: string): Promise<Caller | null>;
  getCaller(id: string): Promise<Caller | null>;
  listCallers(): Promise<Caller[]>;
  // Inserts or updates. keyHash is only passed when the key is created or replaced.
  saveCaller(c: Caller, keyHash?: string): Promise<void>;
  addUsage(callerId: string, account: string, day: string, n: UsageCounts): Promise<void>;
  // Totals per caller and account for days in [sinceDay, untilDay).
  usage(sinceDay: string, untilDay: string): Promise<UsageRow[]>;
}

// The detection back end. Azure in the cloud; a stub for local dev and tests.
export interface Engines {
  name: string;
  adultSeverity(jpeg: Buffer): Promise<number>;
  readText(jpeg: Buffer): Promise<string>;
}
