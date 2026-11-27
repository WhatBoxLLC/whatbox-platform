// WhatBox Platform Admin: every site with its usage and monthly estimate, owners, adding sites,
// domains, suspend, and licensing. Only platform admins reach this; the API checks again.
import {
  ApiError, type AdminApi, type AdminUser, type PlatformOverview, type PlatformSiteRow, type SiteMode, type UsageKind,
} from '@whatbox/core';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AuditList } from './AuditList';
import { Badge, Btn, Card, Check, ChipPicker, ErrorText, Field, H, Loading, Notice, Toggle, Txt, useTheme } from './kit';

const USAGE: { kind: UsageKind; label: string; unit: string }[] = [
  { kind: 'email', label: 'Emails', unit: 'email' },
  { kind: 'sms', label: 'Texts', unit: 'text' },
  { kind: 'storage_mb', label: 'Photo MB', unit: 'MB' },
  { kind: 'ai_screen', label: 'AI checks', unit: 'check' },
];
const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function shiftMonth(m: string, by: number) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
const monthName = (m: string) => new Date(m + '-15T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function PlatformPanel({ api, onSitesChanged }: { api: AdminApi; onSitesChanged: () => void }) {
  const [month, setMonth] = useState<string | undefined>();
  const [ov, setOv] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setOv(await api.platform(month)); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load.'); } }, [api, month]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<unknown>, sitesChanged = false) => {
    setError(null);
    try { await fn(); await load(); if (sitesChanged) onSitesChanged(); return true; } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.'); return false; }
  };
  if (!ov) return error ? <ErrorText error={error} /> : <Loading />;
  const now = new Date().toISOString().slice(0, 7);
  const licensed = ov.sites.filter((s) => !s.licensing.owned);
  const total = ov.sites.reduce((a, s) => a + s.estimateCents, 0);

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Btn size="sm" kind="secondary" label="‹ Earlier" onPress={() => setMonth(shiftMonth(ov.month, -1))} />
        <Txt bold size={16}>{monthName(ov.month)}</Txt>
        {ov.month < now ? <Btn size="sm" kind="secondary" label="Later ›" onPress={() => setMonth(shiftMonth(ov.month, 1))} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <Tile label="Sites" value={String(ov.sites.length)} />
        <Tile label="Members, all sites" value={ov.sites.reduce((a, s) => a + s.members, 0).toLocaleString()} />
        <Tile label="Licensed sites" value={String(licensed.length)} />
        <Tile label={ov.month === now ? 'Billing so far' : 'Billed'} value={money(total)} />
      </View>
      <ErrorText error={error} />

      <H size={20} level={2}>Sites</H>
      {ov.sites.map((s) => <SiteRow key={s.id} api={api} s={s} owners={ov.owners} run={run} />)}

      <NewSite api={api} ov={ov} run={run} />

      <H size={20} level={2}>Owners</H>
      <Owners api={api} ov={ov} run={run} />

      <AuditList api={api} siteNames={Object.fromEntries(ov.sites.map((s) => [s.id, s.name]))} refreshKey={ov} />
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 160, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: t.radius, padding: 16, gap: 4 }}>
      <Txt sub size={13}>{label}</Txt>
      <Txt bold size={24}>{value}</Txt>
    </View>
  );
}

type Run = (fn: () => Promise<unknown>, sitesChanged?: boolean) => Promise<boolean>;

function SiteRow({ api, s, owners, run }: { api: AdminApi; s: PlatformSiteRow; owners: AdminUser[]; run: Run }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(s.name);
  const [domains, setDomains] = useState(s.domains.join(', '));
  const [owned, setOwned] = useState(s.licensing.owned);
  const [base, setBase] = useState(String(s.licensing.baseMonthlyCents / 100));
  const [rates, setRates] = useState<Record<string, string>>(Object.fromEntries(USAGE.map((u) => [u.kind, String(s.licensing.ratesCents[u.kind] ?? 0)])));
  const ownerNames = s.ownerIds.map((id) => owners.find((o) => o.id === id)?.name ?? id).join(', ');
  const suspended = s.status === 'suspended';
  return (
    <Card style={{ gap: 10, borderColor: suspended ? t.alert : t.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Txt bold size={17}>{s.name}</Txt>
        <Badge label={s.mode} />
        {suspended ? <Badge label="Suspended" tone="alert" /> : null}
        {s.licensing.owned ? <Badge label="WhatBox site" /> : null}
        <View style={{ marginLeft: 'auto' }}><Txt bold>{s.licensing.owned ? 'Free' : money(s.estimateCents)}</Txt></View>
      </View>
      <Txt sub size={14}>{s.domains.join(' · ') || 'No domain yet'} · {s.members.toLocaleString()} members · Owner: {ownerNames || 'none'}</Txt>
      <Txt sub size={13}>{USAGE.map((u) => `${u.label}: ${(s.usage[u.kind] ?? 0).toLocaleString()}`).join(' · ')}</Txt>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn size="sm" kind="secondary" label={open ? 'Close' : 'Edit'} onPress={() => setOpen(!open)} />
        <Btn size="sm" kind={suspended ? 'primary' : 'danger'} label={suspended ? 'Resume site' : 'Suspend site'}
          onPress={() => run(() => api.platformUpdateSite(s.id, { status: suspended ? 'active' : 'suspended' }), true)} accessibilityLabel={`${suspended ? 'Resume' : 'Suspend'} ${s.name}`} />
      </View>
      {open ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderColor: t.line, paddingTop: 12 }}>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Domains" value={domains} onChangeText={setDomains} hint="Comma-separated. Point each domain's DNS at WhatBox first." />
          <Toggle label="WhatBox's own site" hint="Owned sites are never billed." value={owned} onChange={setOwned} />
          {!owned ? (
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <View style={{ width: 150 }}><Field label="Base fee ($/mo)" keyboardType="decimal-pad" value={base} onChangeText={setBase} /></View>
              {USAGE.map((u) => (
                <View key={u.kind} style={{ width: 150 }}>
                  <Field label={`¢ per ${u.unit}`} keyboardType="decimal-pad" value={rates[u.kind]} onChangeText={(v) => setRates({ ...rates, [u.kind]: v })} />
                </View>
              ))}
            </View>
          ) : null}
          <Btn size="sm" label="Save" style={{ alignSelf: 'flex-start' }} onPress={() => run(() => api.platformUpdateSite(s.id, {
            name, domains: domains.split(',').map((d) => d.trim()).filter(Boolean),
            licensing: { owned, baseMonthlyCents: Math.round(Number(base) * 100) || 0, ratesCents: Object.fromEntries(USAGE.map((u) => [u.kind, Number(rates[u.kind]) || 0])) },
          }), true).then((ok) => ok && setOpen(false))} />
        </View>
      ) : null}
    </Card>
  );
}

function NewSite({ api, ov, run }: { api: AdminApi; ov: PlatformOverview; run: Run }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ slug: '', name: '', domains: '', mode: 'standard' as SiteMode, template: ov.sites[0]?.id ?? '', owners: [] as string[] });
  if (!open) return <Btn label="Add a site" icon="plus" kind="secondary" style={{ alignSelf: 'flex-start' }} onPress={() => setOpen(true)} />;
  const ownerList = ov.owners.filter((o) => o.role === 'owner');
  return (
    <Card style={{ gap: 12 }}>
      <H size={18} level={2}>Add a site</H>
      <Txt sub size={14}>The new site gets its own database and encryption key. Its paywall starts off and it takes no payments until the owner picks a processor.</Txt>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200 }}><Field label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="SwingAndScore" /></View>
        <View style={{ flex: 1, minWidth: 200 }}><Field label="Short name" value={f.slug} onChangeText={(v) => setF({ ...f, slug: v.toLowerCase().replace(/[^a-z0-9]/g, '') })} placeholder="swingandscore" hint="Lowercase letters and digits. Can't change later." /></View>
      </View>
      <Field label="Domains" value={f.domains} onChangeText={(v) => setF({ ...f, domains: v })} placeholder="swingandscore.com" hint="Comma-separated" />
      <ChipPicker label="Mode" options={['standard', 'sensitive', 'adult']} value={f.mode} onChange={(v: SiteMode) => setF({ ...f, mode: v })} />
      <ChipPicker label="Copy profile fields and look from" options={ov.sites.map((s) => s.name)} value={ov.sites.find((s) => s.id === f.template)?.name} onChange={(v: string) => setF({ ...f, template: ov.sites.find((s) => s.name === v)?.id ?? '' })} />
      {ownerList.length ? (
        <View style={{ gap: 4 }}>
          <Txt bold size={14}>Owners</Txt>
          {ownerList.map((o) => <Check key={o.id} label={`${o.name} (${o.email})`} value={f.owners.includes(o.id)} onChange={(v) => setF({ ...f, owners: v ? [...f.owners, o.id] : f.owners.filter((x) => x !== o.id) })} />)}
        </View>
      ) : null}
      {f.mode === 'adult' ? <Notice tone="warn">Adult sites need CCBill or another adult-friendly processor. PayPal and Stripe are blocked for them.</Notice> : null}
      <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: t.line, paddingTop: 12 }}>
        <Btn label="Create site" onPress={() => run(() => api.createSite({ slug: f.slug, name: f.name, domains: f.domains.split(',').map((d) => d.trim()).filter(Boolean), mode: f.mode, ownerIds: f.owners, templateSiteId: f.template }), true).then((ok) => ok && setOpen(false))} />
        <Btn label="Cancel" kind="ghost" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}

function Owners({ api, ov, run }: { api: AdminApi; ov: PlatformOverview; run: Run }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const owners = ov.owners.filter((o) => o.role === 'owner');
  const staff = ov.owners.filter((o) => o.role === 'platform');
  return (
    <View style={{ gap: 12 }}>
      {owners.map((o) => editing === o.id ? <OwnerForm key={o.id} api={api} ov={ov} owner={o} run={run} done={() => setEditing(null)} /> : (
        <Card key={o.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Txt bold>{o.name}</Txt><Txt sub size={14}>{o.email}</Txt>
            <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 8 }}>
              <Btn size="sm" kind="secondary" label="Edit" onPress={() => setEditing(o.id)} accessibilityLabel={`Edit ${o.name}`} />
              <Btn size="sm" kind="ghost" label="Remove" onPress={() => run(() => api.deleteOwner(o.id), true)} accessibilityLabel={`Remove ${o.name}`} />
            </View>
          </View>
          <Txt sub size={14}>{o.siteIds.map((id) => ov.sites.find((s) => s.id === id)?.name ?? id).join(', ') || 'No sites yet'}</Txt>
        </Card>
      ))}
      {editing === 'new' ? <OwnerForm api={api} ov={ov} run={run} done={() => setEditing(null)} /> : <Btn label="Add an owner" icon="plus" kind="secondary" style={{ alignSelf: 'flex-start' }} onPress={() => setEditing('new')} />}
      <Txt sub size={13}>{`WhatBox staff with full access: ${staff.map((s) => s.email).join(', ')}. Owners sign in with a code sent to their email.`}</Txt>
    </View>
  );
}

function OwnerForm({ api, ov, owner, run, done }: { api: AdminApi; ov: PlatformOverview; owner?: AdminUser; run: Run; done: () => void }) {
  const [email, setEmail] = useState(owner?.email ?? '');
  const [name, setName] = useState(owner?.name ?? '');
  const [sites, setSites] = useState<string[]>(owner?.siteIds ?? []);
  return (
    <Card style={{ gap: 10 }}>
      <H size={17} level={3}>{owner ? `Edit ${owner.name}` : 'New owner'}</H>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200 }}><Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /></View>
        <View style={{ flex: 1, minWidth: 200 }}><Field label="Name" value={name} onChangeText={setName} /></View>
      </View>
      <Txt bold size={14}>Sites they manage</Txt>
      {ov.sites.map((s) => <Check key={s.id} label={s.name} value={sites.includes(s.id)} onChange={(v) => setSites(v ? [...sites, s.id] : sites.filter((x) => x !== s.id))} />)}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn size="sm" label="Save owner" onPress={() => run(() => api.saveOwner({ id: owner?.id, email, name, siteIds: sites }), true).then((ok) => ok && done())} />
        <Btn size="sm" kind="ghost" label="Cancel" onPress={done} />
      </View>
    </Card>
  );
}
