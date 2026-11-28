// Owner Admin: one login, a site switcher, and per-site moderation, members, fields, pages and settings.
// Platform admins (WhatBox) see every site and can change a site's mode; owners see only their sites.
import {
  ApiError, type AdminApi, type AdminEventRow, type AdminMemberRow, isoToZoned, zonedToIso, type AdminSiteSummary, type ContentPage, type ModerationView,
  type ProfileFieldDef, type Site, type SiteStats, type SiteTheme, TIERS, type Tier, type TierPerms,
} from '@whatbox/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { adminApi, IS_PREVIEW } from '../../lib/backend';
import { storage } from '../../lib/storage';
import { PlatformPanel } from '../../ui/PlatformPanel';
import { AuditList } from '../../ui/AuditList';
import {
  Avatar, Badge, Btn, Card, Check, Chip, ChipPicker, ErrorText, Field, fonts, H, Icon, Loading, Notice, PhotoTile,
  relTime, Segmented, ThemeOverrideProvider, Toggle, Txt, useTheme, useWide, type IconName,
} from '../../ui/kit';

const ADMIN_THEME: SiteTheme = {
  ground: '#F4F5F3', surface: '#FFFFFF', ink: '#1C2321', sub: '#4F5A57', line: '#E1E4E0', accent: '#1F4B46',
  accentSoft: '#E3ECEA', second: '#D98A5F', alert: '#9A4A2E', headingFont: 'Bricolage Grotesque', bodyFont: 'Figtree', radius: 10,
};
const TOKEN_KEY = 'whatbox.admin.token';
type Tab = 'overview' | 'moderation' | 'members' | 'fields' | 'events' | 'pages' | 'settings';
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'grid' },
  { key: 'moderation', label: 'Moderation', icon: 'shield' },
  { key: 'members', label: 'Members', icon: 'users' },
  { key: 'fields', label: 'Profile fields', icon: 'sliders' },
  { key: 'events', label: 'Events', icon: 'calendar' },
  { key: 'pages', label: 'Public pages', icon: 'file' },
  { key: 'settings', label: 'Site settings', icon: 'settings' },
];

export default function AdminScreen() {
  return (
    <ThemeOverrideProvider value={ADMIN_THEME}>
      <View style={{ flex: 1, backgroundColor: ADMIN_THEME.ground }}>
        <Admin />
      </View>
    </ThemeOverrideProvider>
  );
}

function Admin() {
  const [api, setApi] = useState<AdminApi | null>(null);
  const [me, setMe] = useState<Awaited<ReturnType<AdminApi['me']>> | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const a = await adminApi();
      const token = await storage.get(TOKEN_KEY);
      a.setToken(token);
      if (token) { try { setMe(await a.me()); } catch { await storage.set(TOKEN_KEY, null); } }
      setApi(a); setChecked(true);
    })();
  }, []);

  if (!checked || !api) return <Loading />;
  if (!me) return <AdminLogin api={api} onIn={async (token) => { api.setToken(token); await storage.set(TOKEN_KEY, token); setMe(await api.me()); }} />;
  return <Dashboard api={api} me={me} reload={async () => setMe(await api.me())} onOut={async () => { await storage.set(TOKEN_KEY, null); setMe(null); }} />;
}

function AdminLogin({ api, onIn }: { api: AdminApi; onIn: (token: string) => Promise<void> }) {
  const [email, setEmail] = useState(IS_PREVIEW ? 'owner@whatbox.test' : '');
  const [challenge, setChallenge] = useState<{ challengeId: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ width: '100%', maxWidth: 420, gap: 16 }} pad={28}>
        <WhatBoxMark />
        <H size={26}>Owner Admin</H>
        <Txt sub size={15}>Manage your sites, review flagged content and edit public pages.</Txt>
        {!challenge ? (
          <>
            <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <ErrorText error={error} />
            <Btn label="Send sign-in code" busy={busy} onPress={() => run(async () => setChallenge(await api.start(email)))} />
            {IS_PREVIEW ? <Notice tone="warn" title="Prototype accounts">owner@whatbox.test manages all three demo sites. admin@whatbox.test is the WhatBox platform admin and can also change site modes.</Notice> : null}
          </>
        ) : (
          <>
            {challenge.devCode ? <Notice tone="warn" title="Prototype: nothing was really sent">{`Your code is ${challenge.devCode}.`}</Notice> : <Txt sub>If that email belongs to an admin, a code is on its way.</Txt>}
            <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <ErrorText error={error} />
            <Btn label="Sign in" busy={busy} onPress={() => run(async () => { const r = await api.verify(challenge.challengeId, code); await onIn(r.token); })} />
          </>
        )}
        <Btn label="Back to the member site" kind="ghost" size="sm" onPress={() => router.replace('/')} />
      </Card>
    </ScrollView>
  );
}

function WhatBoxMark() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>W</Text>
      </View>
      <Text style={{ fontFamily: fonts(t).heading, fontWeight: '700', fontSize: 17, color: t.ink }}>WhatBox</Text>
    </View>
  );
}

function Dashboard({ api, me, reload, onOut }: { api: AdminApi; me: Awaited<ReturnType<AdminApi['me']>>; reload: () => void; onOut: () => void }) {
  const t = useTheme();
  const wide = useWide(980);
  const [siteId, setSiteId] = useState(me.sites[0]?.id);
  const [tab, setTab] = useState<Tab>('overview');
  const isPlatform = me.admin.role === 'platform';
  const [platformView, setPlatformView] = useState(isPlatform);
  const pickSite = (id: string) => { setSiteId(id); setPlatformView(false); };
  const pickTab = (k: Tab) => { setTab(k); setPlatformView(false); };
  const [site, setSite] = useState<Site | null>(null);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const reloadStats = useCallback(() => { if (siteId) api.stats(siteId).then(setStats); }, [api, siteId]);
  useEffect(() => {
    if (!siteId) return;
    setSite(null); setStats(null);
    api.site(siteId).then(setSite);
    reloadStats();
  }, [api, siteId, reloadStats]);
  const current = me.sites.find((s) => s.id === siteId);

  const nav = (
    <View style={{ gap: 18 }}>
      <WhatBoxMark />
      {isPlatform ? (
        <Pressable onPress={() => setPlatformView(true)} aria-current={platformView ? 'page' : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 42, borderRadius: 10, backgroundColor: platformView ? t.accentSoft : 'transparent' }}>
          <Icon name="grid" size={18} color={platformView ? t.accent : t.sub} />
          <Txt bold={platformView} size={15} color={platformView ? t.accent : t.ink}>All sites and owners</Txt>
        </Pressable>
      ) : null}
      <View style={{ gap: 6 }}>
        <Txt sub size={12} bold style={{ letterSpacing: 0.6 }}>SITES</Txt>
        {me.sites.map((s) => <SitePill key={s.id} s={s} on={!platformView && s.id === siteId} onPress={() => pickSite(s.id)} />)}
      </View>
      <View style={{ gap: 2 }}>
        {TABS.map((tb) => {
          const on = !platformView && tb.key === tab;
          return (
            <Pressable key={tb.key} onPress={() => pickTab(tb.key)} aria-current={on ? 'page' : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 42, borderRadius: 10, backgroundColor: on ? t.accentSoft : 'transparent' }}>
              <Icon name={tb.icon} size={18} color={on ? t.accent : t.sub} />
              <Txt bold={on} size={15} color={on ? t.accent : t.ink}>{tb.label}</Txt>
              {tb.key === 'moderation' && stats?.openModeration ? <View style={{ marginLeft: 'auto' }}><Badge label={String(stats.openModeration)} tone="alert" /></View> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 4, borderTopWidth: 1, borderColor: t.line, paddingTop: 14 }}>
        <Txt bold size={14}>{me.admin.name}</Txt>
        <Txt sub size={13}>{me.admin.email} · {me.admin.role === 'platform' ? 'Platform admin' : 'Owner'}</Txt>
        <Btn label="Sign out" kind="ghost" size="sm" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={onOut} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
      {wide ? (
        <ScrollView style={{ width: 260, flexGrow: 0, backgroundColor: t.surface, borderRightWidth: 1, borderColor: t.line }} contentContainerStyle={{ padding: 20 }}>{nav}</ScrollView>
      ) : (
        <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.line, padding: 12, gap: 10 }}>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {isPlatform ? <Chip label="All sites" selected={platformView} onPress={() => setPlatformView(true)} /> : null}
            {me.sites.map((s) => <SitePill key={s.id} s={s} on={!platformView && s.id === siteId} onPress={() => pickSite(s.id)} />)}
          </ScrollView>
          {!platformView ? <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>{TABS.map((tb) => <Chip key={tb.key} label={tb.label + (tb.key === 'moderation' && stats?.openModeration ? ` · ${stats.openModeration}` : '')} selected={tb.key === tab} onPress={() => pickTab(tb.key)} />)}</ScrollView> : null}
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? 32 : 16, paddingBottom: 64 }}>
        <View style={{ maxWidth: 1040, width: '100%', gap: 20 }}>
          {platformView ? (
            <>
              <H size={28}>WhatBox platform</H>
              <PlatformPanel api={api} onSitesChanged={reload} />
            </>
          ) : (<>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <H size={28}>{TABS.find((x) => x.key === tab)!.label}</H>
            {current ? <Badge label={`${current.name} · ${current.domain}`} /> : null}
            {current?.mode === 'sensitive' ? <Badge label="Sensitive site" tone="dark" /> : null}
          </View>
          {!site || !siteId ? <Loading /> : (
            <>
              {tab === 'overview' ? <><Overview stats={stats} site={site} go={setTab} /><AuditList api={api} siteId={siteId} refreshKey={site} /></> : null}
              {tab === 'moderation' ? <Moderation api={api} siteId={siteId} onChange={reloadStats} /> : null}
              {tab === 'members' ? <Members api={api} siteId={siteId} /> : null}
              {tab === 'fields' ? <Fields api={api} site={site} onSite={setSite} /> : null}
              {tab === 'events' ? <Events api={api} site={site} /> : null}
              {tab === 'pages' ? <Pages api={api} site={site} /> : null}
              {tab === 'settings' ? <Settings api={api} site={site} onSite={setSite} role={me.admin.role} /> : null}
            </>
          )}
          </>)}
        </View>
      </ScrollView>
    </View>
  );
}

function SitePill({ s, on, onPress }: { s: AdminSiteSummary; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} aria-current={on ? 'true' : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 42, borderRadius: 10, borderWidth: 1.5, borderColor: on ? s.accent : t.line, backgroundColor: on ? '#FFFFFF' : t.ground }}>
      <Svg width={14} height={14} aria-hidden><Circle cx={7} cy={7} r={6} fill={s.accent} /></Svg>
      <Txt bold size={14}>{s.name}</Txt>
      <Txt sub size={12}>{s.mode}</Txt>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 150, gap: 2 }} pad={18}>
      <Txt sub size={13}>{label}</Txt>
      <H size={30} level={3}>{String(value)}</H>
    </Card>
  );
}

function Overview({ stats, site, go }: { stats: SiteStats | null; site: Site; go: (t: Tab) => void }) {
  if (!stats) return <Loading />;
  const ms = site.settings.membership;
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Stat label="Members" value={stats.members} />
        <Stat label="Active today" value={stats.activeToday} />
        <Stat label="New this week" value={stats.newThisWeek} />
        <Stat label="Paid or VIP" value={stats.paid} />
        <Stat label="Messages today" value={stats.messagesToday} />
      </View>
      {stats.openModeration ? (
        <Notice tone="warn" title={`${stats.openModeration} item${stats.openModeration === 1 ? '' : 's'} waiting for review`}>
          <Btn size="sm" label="Open moderation queue" style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={() => go('moderation')} />
        </Notice>
      ) : <Notice tone="success" icon="check">The moderation queue is clear.</Notice>}
      <Card style={{ gap: 10 }}>
        <H size={18} level={2}>How {site.name} is set up</H>
        <Txt sub size={15}>Mode: {site.settings.mode}. Photos are {site.settings.photoModeration === 'pre' ? 'hidden until approved' : 'visible right away and reviewed after'}. Payments: {site.settings.paymentProvider}.</Txt>
        <Txt sub size={15}>Paywall: {ms.paywallEnabled ? `on, with ${TIERS.map((x) => ms.tiers[x].label).join(', ')} levels` : 'off, so every member has full access'}.</Txt>
        <Txt sub size={15}>Public teasers: {site.settings.mode === 'sensitive' ? 'never (sensitive site)' : site.settings.publicTeasers ? 'members can opt in' : 'off'}.</Txt>
      </Card>
    </View>
  );
}

function Moderation({ api, siteId, onChange }: { api: AdminApi; siteId: string; onChange: () => void }) {
  const t = useTheme();
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const [items, setItems] = useState<ModerationView[] | null>(null);
  const load = useCallback(() => { setItems(null); api.moderation(siteId, status).then(setItems); }, [api, siteId, status]);
  useEffect(() => { load(); }, [load]);
  const decide = async (id: string, d: 'approve' | 'reject') => { await api.decide(siteId, id, d); load(); onChange(); };
  const labels: Record<ModerationView['kind'], [string, string, string]> = {
    photo: ['Photo', 'Approve', 'Reject photo'],
    message: ['Held message', 'Release to recipient', 'Keep blocked'],
    report: ['Member report', 'Suspend member', 'Dismiss'],
    profile: ['Profile text', 'Looks fine', 'Clear "About me"'],
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Waiting" selected={status === 'pending'} onPress={() => setStatus('pending')} />
        <Chip label="All" selected={status === 'all'} onPress={() => setStatus('all')} />
      </View>
      {!items ? <Loading /> : items.length === 0 ? <Notice tone="success" icon="check">Nothing waiting. New uploads, held messages and reports land here.</Notice> : items.map((i) => (
        <Card key={i.id} style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
          {i.photo ? <PhotoTile photo={i.photo} style={{ width: 110, height: 110 }} /> : (
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: i.kind === 'message' ? '#FFF4E5' : t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={i.kind === 'message' ? 'chat' : i.kind === 'report' ? 'flag' : 'user'} color={i.kind === 'message' ? '#8A5A12' : t.accent} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 240, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Txt bold>{labels[i.kind][0]}</Txt>
              <Txt sub size={14}>{i.kind === 'report' ? 'about' : 'from'} {i.memberName} · {relTime(i.createdAt)}</Txt>
              {i.status !== 'pending' ? <Badge label={i.status} tone="dark" /> : null}
            </View>
            {i.messageBody ? <View style={{ backgroundColor: t.ground, borderRadius: 10, padding: 12 }}><Txt size={15}>"{i.messageBody}"</Txt></View> : null}
            <Txt size={15}>{i.summary}</Txt>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {i.reasons.map((r) => <Badge key={r} label={r} tone={/money|gift|crypto|scam|transfer|payment/.test(r) ? 'alert' : 'accent'} />)}
            </View>
            {i.status === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <Btn size="sm" label={labels[i.kind][1]} kind={i.kind === 'report' ? 'danger' : 'primary'} onPress={() => decide(i.id, 'approve')} />
                <Btn size="sm" label={labels[i.kind][2]} kind="secondary" onPress={() => decide(i.id, 'reject')} />
              </View>
            ) : <Txt sub size={13}>Decided by {i.decidedBy} {i.decidedAt ? relTime(i.decidedAt) : ''}</Txt>}
          </View>
        </Card>
      ))}
    </View>
  );
}

function Members({ api, siteId }: { api: AdminApi; siteId: string }) {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: AdminMemberRow[] } | null>(null);
  const load = useCallback(() => api.members(siteId, { search, page }).then(setData), [api, siteId, search, page]);
  useEffect(() => { load(); }, [load]);
  return (
    <View style={{ gap: 14 }}>
      <Field label="Search by name or city" value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} />
      {!data ? <Loading /> : (
        <Card pad={0} style={{ overflow: 'hidden' }}>
          {data.rows.map((m, idx) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: idx ? 1 : 0, borderColor: t.line, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Txt bold>{m.displayName}{m.age ? `, ${m.age}` : ''}</Txt>
                  {m.tier !== 'free' ? <Badge label={m.tier === 'vip' ? '★ VIP' : 'Paid'} tone={m.tier === 'vip' ? 'alert' : 'accent'} /> : null}
                  {m.status === 'suspended' ? <Badge label="Suspended" tone="alert" /> : null}
                  {m.reports ? <Badge label={`${m.reports} report${m.reports > 1 ? 's' : ''}`} tone="alert" /> : null}
                </View>
                <Txt sub size={13}>{m.city || 'No city yet'} · {m.photoCount} photos · joined {relTime(m.createdAt)} · active {relTime(m.lastActiveAt)}</Txt>
              </View>
              <Segmented<Tier> value={m.tier} onChange={async (tier) => { await api.setMemberTier(siteId, m.id, tier); load(); }}
                options={TIERS.map((x) => ({ value: x, label: x === 'free' ? 'Free' : x === 'paid' ? 'Paid' : 'VIP' }))} />
              <Btn size="sm" kind={m.status === 'active' ? 'danger' : 'secondary'} label={m.status === 'active' ? 'Suspend' : 'Reinstate'}
                onPress={async () => { await api.setMemberStatus(siteId, m.id, m.status === 'active' ? 'suspended' : 'active'); load(); }} />
            </View>
          ))}
        </Card>
      )}
      {data && data.total > 25 ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Btn size="sm" kind="secondary" label="Previous" disabled={page === 1} onPress={() => setPage(page - 1)} />
          <Txt sub size={14}>Page {page} of {Math.ceil(data.total / 25)}</Txt>
          <Btn size="sm" kind="secondary" label="Next" disabled={page * 25 >= data.total} onPress={() => setPage(page + 1)} />
        </View>
      ) : null}
      <Txt sub size={13}>Contact details are encrypted with this site's own key and are not shown here.</Txt>
    </View>
  );
}

const EMPTY_FIELD: ProfileFieldDef = { key: '', label: '', type: 'select', options: [], filterable: true, showOnProfile: true, section: 'details', order: 99 };

function Fields({ api, site, onSite }: { api: AdminApi; site: Site; onSite: (s: Site) => void }) {
  const t = useTheme();
  const [edit, setEdit] = useState<ProfileFieldDef | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [opts, setOpts] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = (f: ProfileFieldDef, fresh: boolean) => { setEdit({ ...f }); setIsNew(fresh); setOpts((f.options ?? []).join(', ')); setError(null); };
  const fields = [...site.fields].sort((a, b) => a.order - b.order);
  return (
    <View style={{ gap: 14 }}>
      <Txt sub>Each site defines its own profile questions. Members answer them in onboarding, and "filterable" ones become browse filters.</Txt>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {fields.map((f, i) => (
          <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Txt bold>{f.label}</Txt>
                <Badge label={f.type} tone="dark" />
                {f.required ? <Badge label="required" /> : null}
                {f.filterable ? <Badge label="filter" /> : null}
                {f.sensitive ? <Badge label="sensitive" tone="alert" /> : null}
              </View>
              {f.options?.length ? <Txt sub size={13} numberOfLines={1}>{f.options.join(' · ')}</Txt> : null}
            </View>
            <Btn size="sm" kind="secondary" label="Edit" onPress={() => start(f, false)} />
          </View>
        ))}
      </Card>
      {!edit ? <Btn label="Add a field" icon="plus" style={{ alignSelf: 'flex-start' }} onPress={() => start(EMPTY_FIELD, true)} /> : (
        <Card style={{ gap: 14 }}>
          <H size={18} level={2}>{isNew ? 'New field' : `Edit "${edit.label}"`}</H>
          <Field label="Label members see" value={edit.label} onChangeText={(v) => setEdit({ ...edit, label: v, key: isNew ? v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) : edit.key })} />
          {isNew ? <Txt sub size={13}>Key: {edit.key || '…'}</Txt> : null}
          <ChipPicker label="Type" options={['select', 'multiselect', 'text', 'number', 'boolean']} value={edit.type} onChange={(v: any) => setEdit({ ...edit, type: v })} />
          {edit.type === 'select' || edit.type === 'multiselect' ? <Field label="Options, separated by commas" value={opts} onChangeText={setOpts} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <Check label="Required" value={!!edit.required} onChange={(v) => setEdit({ ...edit, required: v })} />
            <Check label="Use as browse filter" value={!!edit.filterable} onChange={(v) => setEdit({ ...edit, filterable: v })} />
            <Check label="Show on profile" value={edit.showOnProfile !== false} onChange={(v) => setEdit({ ...edit, showOnProfile: v })} />
            <Check label="Sensitive (never public)" value={!!edit.sensitive} onChange={(v) => setEdit({ ...edit, sensitive: v })} />
          </View>
          <ErrorText error={error} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn label="Save field" onPress={async () => {
              try {
                const def = { ...edit, options: opts.split(',').map((s) => s.trim()).filter(Boolean), order: isNew ? site.fields.length + 1 : edit.order };
                onSite(await api.saveField(site.id, def)); setEdit(null);
              } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); }
            }} />
            <Btn label="Cancel" kind="secondary" onPress={() => setEdit(null)} />
            {!isNew ? <Btn label="Delete field" kind="danger" onPress={async () => { onSite(await api.deleteField(site.id, edit.key)); setEdit(null); }} /> : null}
          </View>
        </Card>
      )}
    </View>
  );
}

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Berlin', 'Australia/Sydney'];
const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'; } catch { return 'America/Chicago'; } };
type EventForm = { id?: string; title: string; summary: string; details: string; startDate: string; startTime: string; endDate: string; endTime: string; timezone: string;
  online: boolean; venue: string; address: string; city: string; region: string; country: string; link: string; price: string; featured: boolean; status: AdminEventRow['status'] };

function toForm(e?: AdminEventRow): EventForm {
  const tz = e?.timezone || localZone();
  const s = e ? isoToZoned(e.startsAt, tz) : { date: '', time: '19:00' };
  const en = e?.endsAt ? isoToZoned(e.endsAt, tz) : { date: '', time: '' };
  return { id: e?.id, title: e?.title ?? '', summary: e?.summary ?? '', details: e?.details ?? '', startDate: s.date, startTime: s.time, endDate: en.date, endTime: en.time, timezone: tz,
    online: e?.online ?? false, venue: e?.venue ?? '', address: e?.address ?? '', city: e?.city ?? '', region: e?.region ?? '', country: e?.country || 'US', link: e?.link ?? '',
    price: e?.price ?? 'Free', featured: e?.featured ?? false, status: e?.status ?? 'draft' };
}

function Events({ api, site }: { api: AdminApi; site: Site }) {
  const t = useTheme();
  const [rows, setRows] = useState<AdminEventRow[] | null>(null);
  const [f, setF] = useState<EventForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(null); setF(null); api.events(site.id).then(setRows); }, [api, site.id]);
  if (!rows) return <Loading />;
  const now = new Date().toISOString();
  const save = async (status?: AdminEventRow['status']) => {
    if (!f) return;
    setError(null);
    const startsAt = zonedToIso(f.startDate, f.startTime, f.timezone);
    if (!startsAt) { setError('Enter the start date as YYYY-MM-DD and the time as HH:MM.'); return; }
    let endsAt: string | undefined;
    if (f.endDate || f.endTime) {
      endsAt = zonedToIso(f.endDate || f.startDate, f.endTime || '23:59', f.timezone) ?? undefined;
      if (!endsAt) { setError('Enter the end as YYYY-MM-DD and HH:MM, or leave it empty.'); return; }
    }
    setBusy(true);
    try {
      setRows(await api.saveEvent(site.id, {
        id: f.id, title: f.title, summary: f.summary, details: f.details, startsAt, endsAt, timezone: f.timezone, online: f.online,
        venue: f.venue, address: f.address, city: f.city, region: f.region, country: f.country, link: f.link, price: f.price, featured: f.featured, status: status ?? f.status,
      }));
      setF(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const statusBadge = (e: AdminEventRow) => e.status === 'draft' ? <Badge label="Draft" tone="dark" /> : e.status === 'cancelled' ? <Badge label="Cancelled" tone="alert" />
    : (e.endsAt ?? e.startsAt) < now ? <Badge label="Past" tone="dark" /> : <Badge label="Live" tone="online" />;

  if (!f) return (
    <View style={{ gap: 14 }}>
      <Txt sub>Events show only to signed-in members of {site.name}, never on the public site. Members can say they're going, and can choose to show their events on their profile. Listings are free for now; paid and promoted listings can come later.</Txt>
      <Btn label="New event" icon="plus" style={{ alignSelf: 'flex-start' }} onPress={() => { setError(null); setF(toForm()); }} />
      {rows.length ? (
        <Card pad={0} style={{ overflow: 'hidden' }}>
          {rows.map((e, i) => (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Txt bold>{e.title}</Txt>{statusBadge(e)}{e.featured ? <Badge label="Featured" /> : null}
                </View>
                <Txt sub size={13}>
                  {new Date(e.startsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: e.timezone })} · {e.online ? 'Online' : [e.city, e.region].filter(Boolean).join(', ')} · {e.goingCount} going, {e.interestedCount} interested
                </Txt>
              </View>
              <Btn size="sm" kind="secondary" label="Edit" onPress={() => { setError(null); setF(toForm(e)); }} />
            </View>
          ))}
        </Card>
      ) : <Notice tone="info" icon="calendar">No events yet.</Notice>}
    </View>
  );

  const set = (p: Partial<EventForm>) => setF({ ...f, ...p });
  const row = (a: ReactNode, b: ReactNode) => <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 160 }}>{a}</View><View style={{ flex: 1, minWidth: 160 }}>{b}</View></View>;
  return (
    <Card style={{ gap: 14 }}>
      <H size={20} level={2}>{f.id ? 'Edit event' : 'New event'}</H>
      <Field label="Title" value={f.title} onChangeText={(v) => set({ title: v })} maxLength={120} />
      <Field label="One-line summary" value={f.summary} onChangeText={(v) => set({ summary: v })} maxLength={200} />
      {row(<Field label="Starts (date)" value={f.startDate} onChangeText={(v) => set({ startDate: v })} placeholder="2026-12-12" />, <Field label="Start time" value={f.startTime} onChangeText={(v) => set({ startTime: v })} placeholder="18:00" />)}
      {row(<Field label="Ends (date, optional)" value={f.endDate} onChangeText={(v) => set({ endDate: v })} placeholder="Same day if empty" />, <Field label="End time (optional)" value={f.endTime} onChangeText={(v) => set({ endTime: v })} placeholder="22:00" />)}
      <ChipPicker label="Time zone (times are shown to members in this zone)" options={[...new Set([f.timezone, ...ZONES])]} value={f.timezone} onChange={(v: string) => set({ timezone: v })} />
      <Toggle label="Online event" value={f.online} onChange={(v) => set({ online: v })} />
      {!f.online ? (
        <>
          {row(<Field label="Venue" value={f.venue} onChangeText={(v) => set({ venue: v })} placeholder="Hotel or park name" />, <Field label="Street address (shown once a member says they’re going)" value={f.address} onChangeText={(v) => set({ address: v })} />)}
          {row(<Field label="City" value={f.city} onChangeText={(v) => set({ city: v })} />, row(<Field label="State or region" value={f.region} onChangeText={(v) => set({ region: v })} />, <Field label="Country code" value={f.country} onChangeText={(v) => set({ country: v.toUpperCase().slice(0, 2) })} placeholder="US" />))}
        </>
      ) : null}
      {row(<Field label="Price" value={f.price} onChangeText={(v) => set({ price: v })} hint='e.g. "Free" or "$25 at the door"' />, <Field label="Tickets or info link (optional)" value={f.link} onChangeText={(v) => set({ link: v })} placeholder="https://" autoCapitalize="none" />)}
      <Field label="Details" value={f.details} onChangeText={(v) => set({ details: v })} multiline style={{ minHeight: 160, textAlignVertical: 'top' }} hint="Separate paragraphs with a blank line." />
      <Toggle label="Featured" hint="Pinned to the top of the Events page and highlighted." value={f.featured} onChange={(v) => set({ featured: v })} />
      <ErrorText error={error} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {f.status === 'published' ? <Btn label="Save" busy={busy} onPress={() => save()} /> : <Btn label="Publish" busy={busy} onPress={() => save('published')} />}
        {f.status === 'draft' ? <Btn label="Save draft" kind="secondary" busy={busy} onPress={() => save('draft')} /> : null}
        <Btn label="Back" kind="secondary" onPress={() => setF(null)} />
        {f.id && f.status === 'published' ? <Btn label="Cancel event" kind="danger" busy={busy} onPress={() => save('cancelled')} /> : null}
        {f.id && f.status !== 'published' ? <Btn label="Delete" kind="danger" busy={busy} onPress={async () => {
          try { setRows(await api.deleteEvent(site.id, f.id!)); setF(null); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not delete.'); }
        }} /> : null}
      </View>
    </Card>
  );
}

function Pages({ api, site }: { api: AdminApi; site: Site }) {
  const t = useTheme();
  const [pages, setPages] = useState<ContentPage[] | null>(null);
  const [edit, setEdit] = useState<ContentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.pages(site.id).then(setPages); }, [api, site.id]);
  const blank: ContentPage = { slug: '', kind: 'article', title: '', summary: '', body: '', category: 'Guides', published: false, placement: 'guides', updatedAt: '' };
  if (!pages) return <Loading />;
  return (
    <View style={{ gap: 14 }}>
      <Txt sub>These are the public, crawlable pages on {site.domains[0]}: footer pages and guides. Search engines see these and nothing behind sign-in.</Txt>
      {!edit ? (
        <>
          <Card pad={0} style={{ overflow: 'hidden' }}>
            {pages.map((p, i) => (
              <View key={p.slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Txt bold>{p.title}</Txt>
                    <Badge label={p.placement === 'guides' ? 'Guide' : p.placement === 'footer' ? 'Footer' : 'Hidden'} tone="dark" />
                    {!p.published ? <Badge label="Draft" tone="alert" /> : null}
                  </View>
                  <Txt sub size={13}>/{p.slug} · updated {relTime(p.updatedAt)}</Txt>
                </View>
                <Btn size="sm" kind="secondary" label="Edit" onPress={() => { setEdit(p); setError(null); }} />
              </View>
            ))}
          </Card>
          <Btn label="New page" icon="plus" style={{ alignSelf: 'flex-start' }} onPress={() => setEdit(blank)} />
        </>
      ) : (
        <Card style={{ gap: 14 }}>
          <Field label="Title" value={edit.title} onChangeText={(v) => setEdit({ ...edit, title: v, slug: edit.updatedAt ? edit.slug : v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) })} />
          <Field label="Web address" value={edit.slug} onChangeText={(v) => setEdit({ ...edit, slug: v })} hint={`https://${site.domains[0]}/${edit.slug || '…'}`} editable={!edit.updatedAt} />
          <ChipPicker label="Where it appears" options={['guides', 'footer', 'none']} value={edit.placement} onChange={(v: any) => setEdit({ ...edit, placement: v, kind: v === 'guides' ? 'article' : 'page' })} />
          {edit.placement === 'guides' ? <Field label="Category" value={edit.category ?? ''} onChangeText={(v) => setEdit({ ...edit, category: v })} /> : null}
          <Field label="Summary" value={edit.summary} onChangeText={(v) => setEdit({ ...edit, summary: v })} hint="Shown on cards and used as the search-result description if you leave the SEO description empty." />
          <Field label="Body" value={edit.body} onChangeText={(v) => setEdit({ ...edit, body: v })} multiline style={{ minHeight: 220, textAlignVertical: 'top' }} hint="Separate paragraphs with a blank line." />
          <Field label="SEO title (optional)" value={edit.seoTitle ?? ''} onChangeText={(v) => setEdit({ ...edit, seoTitle: v })} />
          <Field label="SEO description (optional)" value={edit.seoDescription ?? ''} onChangeText={(v) => setEdit({ ...edit, seoDescription: v })} />
          <Toggle label="Published" value={edit.published} onChange={(v) => setEdit({ ...edit, published: v })} />
          <ErrorText error={error} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn label="Save page" onPress={async () => { try { setPages(await api.savePage(site.id, edit)); setEdit(null); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); } }} />
            <Btn label="Cancel" kind="secondary" onPress={() => setEdit(null)} />
            {edit.updatedAt ? <Btn label="Delete" kind="danger" onPress={async () => { setPages(await api.deletePage(site.id, edit.slug)); setEdit(null); }} /> : null}
          </View>
        </Card>
      )}
    </View>
  );
}

function Settings({ api, site, onSite, role }: { api: AdminApi; site: Site; onSite: (s: Site) => void; role: 'platform' | 'owner' }) {
  const [error, setError] = useState<string | null>(null);
  const [accent, setAccent] = useState(site.theme.accent);
  const [descriptor, setDescriptor] = useState(site.settings.billingDescriptor);
  const [plans, setPlans] = useState({ paid: site.settings.paymentPlans?.paid ?? '', vip: site.settings.paymentPlans?.vip ?? '' });
  const lim = site.settings.messageLimits;
  const [limits, setLimits] = useState({ a: String(lim.newConversationsPerHour), b: String(lim.messagesPerMinute), c: String(lim.duplicateRecipientThreshold) });
  const save = async (patch: Parameters<AdminApi['updateSite']>[1]) => {
    setError(null);
    try { onSite(await api.updateSite(site.id, patch)); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); }
  };
  const section = (title: string, children: ReactNode, hint?: string) => (
    <Card style={{ gap: 10 }}>
      <H size={18} level={2}>{title}</H>
      {hint ? <Txt sub size={14}>{hint}</Txt> : null}
      {children}
    </Card>
  );
  return (
    <View style={{ gap: 16 }}>
      <ErrorText error={error} />
      {section('Membership levels', (
        <>
          <Toggle label="Paywall on" hint={site.settings.membership.paywallEnabled ? 'Levels below are live. Free members are limited as shown.' : 'Off: every member gets full access. Set up the levels now and switch on when you are ready.'}
            value={site.settings.membership.paywallEnabled} onChange={(v) => save({ settings: { membership: { paywallEnabled: v } } })} />
          <TierMatrix site={site} save={save} />
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <View style={{ flex: 1, minWidth: 160 }}><Field label="Billing descriptor" value={descriptor} onChangeText={setDescriptor} hint="What members see on their statement" /></View>
            <Btn label="Save" size="sm" onPress={() => save({ settings: { billingDescriptor: descriptor } })} />
          </View>
        </>
      ), 'Pricing is by level, the same for every member. Defaults follow the WhatBox plan: Free can browse and reply to VIPs, Paid sees everything, VIP likes go first and anyone can answer VIP messages.')}
      {section('Payments', (
        <>
          <ChipPicker label="Processor" options={['none', 'paypal', 'stripe', 'ccbill']} value={site.settings.paymentProvider} onChange={(v: any) => save({ settings: { paymentProvider: v } })} />
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <View style={{ flex: 1, minWidth: 160 }}><Field label={`${site.settings.membership.tiers.paid.label} plan ID`} value={plans.paid} onChangeText={(v) => setPlans({ ...plans, paid: v })} placeholder="P-..." /></View>
            <View style={{ flex: 1, minWidth: 160 }}><Field label={`${site.settings.membership.tiers.vip.label} plan ID`} value={plans.vip} onChangeText={(v) => setPlans({ ...plans, vip: v })} placeholder="P-..." /></View>
            <Btn label="Save plans" size="sm" onPress={() => save({ settings: { paymentPlans: { paid: plans.paid.trim() || undefined, vip: plans.vip.trim() || undefined } } })} />
          </View>
        </>
      ), 'Create one monthly plan per level in your processor account and paste its ID here. Members pay on the processor\'s page; WhatBox never sees card numbers. Merchant credentials are set by WhatBox, not stored here.')}
      {section('Units', (
        <Segmented<'imperial' | 'metric'> value={site.settings.units} onChange={(u) => save({ settings: { units: u } })} options={[
          { value: 'imperial', label: 'Feet and inches' }, { value: 'metric', label: 'Centimeters' },
        ]} />
      ), 'Default for new members. Each member can change it, and heights always show both.')}
      {section('Message safety', (
        <>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <View style={{ flex: 1, minWidth: 140 }}><Field label="New conversations per hour" keyboardType="number-pad" value={limits.a} onChangeText={(v) => setLimits({ ...limits, a: v })} /></View>
            <View style={{ flex: 1, minWidth: 140 }}><Field label="Messages per minute" keyboardType="number-pad" value={limits.b} onChangeText={(v) => setLimits({ ...limits, b: v })} /></View>
            <View style={{ flex: 1, minWidth: 140 }}><Field label="Hold copy-paste sent to" keyboardType="number-pad" value={limits.c} onChangeText={(v) => setLimits({ ...limits, c: v })} hint="people in 24 hours" /></View>
          </View>
          <Btn label="Save limits" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => save({ settings: { messageLimits: { newConversationsPerHour: Number(limits.a) || 1, messagesPerMinute: Number(limits.b) || 1, duplicateRecipientThreshold: Number(limits.c) || 2 } } })} />
        </>
      ), 'These apply to every member, Premium included. Messages asking for money, gift cards or crypto are always held for review.')}
      {section('Photos', (
        <>
          <ChipPicker label="New photos" options={['Visible now, reviewed after', 'Hidden until approved']} value={site.settings.photoModeration === 'pre' ? 'Hidden until approved' : 'Visible now, reviewed after'} onChange={(v: string) => save({ settings: { photoModeration: v.startsWith('Hidden') ? 'pre' : 'post' } })} />
          <Toggle label="Allow explicit private photos" hint={site.settings.mode === 'adult' ? 'Web only. The apps always show a placeholder.' : 'Only adult sites can allow explicit photos.'} value={site.settings.explicitPhotosAllowed} onChange={(v) => save({ settings: { explicitPhotosAllowed: v } })} />
        </>
      ))}
      {section('Look and discovery', (
        <>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <View style={{ width: 180 }}><Field label="Accent color" value={accent} onChangeText={setAccent} /></View>
            <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#CCCCCC' }} />
            <Btn label="Save color" size="sm" onPress={() => /^#[0-9a-f]{6}$/i.test(accent) ? save({ theme: { accent } }) : setError('Use a hex color like #22655F.')} />
          </View>
          <Toggle label="Members can opt in to a public teaser" hint={site.settings.mode === 'sensitive' ? 'Always off on sensitive sites. Nothing about members is ever public.' : 'A first name, age, city and main photo on a crawlable page.'} value={site.settings.publicTeasers} onChange={(v) => site.settings.mode === 'sensitive' ? setError('Sensitive sites never show public teasers.') : save({ settings: { publicTeasers: v } })} />
        </>
      ))}
      {section('Site mode', (
        <ChipPicker options={['standard', 'sensitive', 'adult']} value={site.settings.mode} onChange={(v: any) => save({ settings: { mode: v } })} />
      ), role === 'platform' ? 'Only WhatBox can change this. Adult sites need an adult-friendly processor such as CCBill.' : 'Set by WhatBox. Ask your WhatBox contact to change it.')}
    </View>
  );
}

const PERMS: { key: keyof TierPerms; label: string; kind: 'bool' | 'tiers' }[] = [
  { key: 'seePublicPhotos', label: 'See public photos (beyond photo one)', kind: 'bool' },
  { key: 'requestPrivatePhotos', label: 'Request private photos', kind: 'bool' },
  { key: 'seeWhoViewed', label: 'See who viewed them', kind: 'bool' },
  { key: 'startConversations', label: 'Start conversations', kind: 'bool' },
  { key: 'priorityLikes', label: 'Their likes go to the top', kind: 'bool' },
  { key: 'seeLikesFrom', label: 'See likes from', kind: 'tiers' },
  { key: 'readMessagesFrom', label: 'Read and answer messages from', kind: 'tiers' },
];

function TierMatrix({ site, save }: { site: Site; save: (p: Parameters<AdminApi['updateSite']>[1]) => Promise<void> }) {
  const t = useTheme();
  const ms = site.settings.membership;
  const [labels, setLabels] = useState(() => Object.fromEntries(TIERS.map((x) => [x, { label: ms.tiers[x].label, price: ms.tiers[x].priceLabel }])) as Record<Tier, { label: string; price: string }>);
  const setPerm = (tier: Tier, patch: Partial<TierPerms>) => save({ settings: { membership: { tiers: { [tier]: patch } } } });
  const short = (x: Tier) => ms.tiers[x].label;
  return (
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
      <View style={{ minWidth: 640, flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 14, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: t.accentSoft }}>
          <View style={{ flex: 1.6, padding: 10 }}><Txt bold size={14}>Permission</Txt></View>
          {TIERS.map((x) => (
            <View key={x} style={{ flex: 1, padding: 8, gap: 6 }}>
              <Field label="Name" value={labels[x].label} onChangeText={(v) => setLabels({ ...labels, [x]: { ...labels[x], label: v } })}
                onBlur={() => labels[x].label.trim() && setPerm(x, { label: labels[x].label.trim() })} />
              {x !== 'free' ? (
                <Field label="Price" value={labels[x].price} onChangeText={(v) => setLabels({ ...labels, [x]: { ...labels[x], price: v } })}
                  onBlur={() => setPerm(x, { priceLabel: labels[x].price.trim() })} />
              ) : <Txt sub size={12}>No charge</Txt>}
            </View>
          ))}
        </View>
        {PERMS.map((p, i) => (
          <View key={p.key} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: t.line, backgroundColor: i % 2 ? t.ground : t.surface, alignItems: 'center' }}>
            <View style={{ flex: 1.6, padding: 10 }}><Txt size={14}>{p.label}</Txt></View>
            {TIERS.map((x) => {
              const v = ms.tiers[x][p.key];
              return (
                <View key={x} style={{ flex: 1, padding: 8 }}>
                  {p.kind === 'bool' ? (
                    <Check label={v ? 'Yes' : 'No'} value={!!v} onChange={(nv) => setPerm(x, { [p.key]: nv } as Partial<TierPerms>)} />
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {TIERS.map((from) => {
                        const list = v as Tier[];
                        const on = list.includes(from);
                        return <Chip key={from} label={short(from)} selected={on} onPress={() => setPerm(x, { [p.key]: on ? list.filter((y) => y !== from) : [...list, from] } as Partial<TierPerms>)} />;
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
