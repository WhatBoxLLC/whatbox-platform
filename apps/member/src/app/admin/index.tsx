// Owner Admin: one login, a site switcher, and per-site moderation, members, fields, pages and settings.
// Platform admins (WhatBox) see every site and can change a site's mode; owners see only their sites.
import {
  ApiError, type AdminApi, type AdminMemberRow, type AdminSiteSummary, type ContentPage, type ModerationView,
  type ProfileFieldDef, type Site, type SiteStats, type SiteTheme,
} from '@whatbox/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { adminApi, IS_PREVIEW } from '../../lib/backend';
import { storage } from '../../lib/storage';
import {
  Avatar, Badge, Btn, Card, Check, Chip, ChipPicker, ErrorText, Field, fonts, H, Icon, Loading, Notice, PhotoTile,
  relTime, ThemeOverrideProvider, Toggle, Txt, useTheme, useWide, type IconName,
} from '../../ui/kit';

const ADMIN_THEME: SiteTheme = {
  ground: '#F4F5F3', surface: '#FFFFFF', ink: '#1C2321', sub: '#4F5A57', line: '#E1E4E0', accent: '#1F4B46',
  accentSoft: '#E3ECEA', second: '#D98A5F', alert: '#9A4A2E', headingFont: 'Bricolage Grotesque', bodyFont: 'Figtree', radius: 10,
};
const TOKEN_KEY = 'whatbox.admin.token';
type Tab = 'overview' | 'moderation' | 'members' | 'fields' | 'pages' | 'settings';
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'grid' },
  { key: 'moderation', label: 'Moderation', icon: 'shield' },
  { key: 'members', label: 'Members', icon: 'users' },
  { key: 'fields', label: 'Profile fields', icon: 'sliders' },
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
  return <Dashboard api={api} me={me} onOut={async () => { await storage.set(TOKEN_KEY, null); setMe(null); }} />;
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

function Dashboard({ api, me, onOut }: { api: AdminApi; me: Awaited<ReturnType<AdminApi['me']>>; onOut: () => void }) {
  const t = useTheme();
  const wide = useWide(980);
  const [siteId, setSiteId] = useState(me.sites[0]?.id);
  const [tab, setTab] = useState<Tab>('overview');
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
      <View style={{ gap: 6 }}>
        <Txt sub size={12} bold style={{ letterSpacing: 0.6 }}>SITES</Txt>
        {me.sites.map((s) => <SitePill key={s.id} s={s} on={s.id === siteId} onPress={() => setSiteId(s.id)} />)}
      </View>
      <View style={{ gap: 2 }}>
        {TABS.map((tb) => {
          const on = tb.key === tab;
          return (
            <Pressable key={tb.key} onPress={() => setTab(tb.key)} aria-current={on ? 'page' : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 42, borderRadius: 10, backgroundColor: on ? t.accentSoft : 'transparent' }}>
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
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{me.sites.map((s) => <SitePill key={s.id} s={s} on={s.id === siteId} onPress={() => setSiteId(s.id)} />)}</ScrollView>
          <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>{TABS.map((tb) => <Chip key={tb.key} label={tb.label + (tb.key === 'moderation' && stats?.openModeration ? ` · ${stats.openModeration}` : '')} selected={tb.key === tab} onPress={() => setTab(tb.key)} />)}</ScrollView>
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? 32 : 16, paddingBottom: 64 }}>
        <View style={{ maxWidth: 1040, width: '100%', gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <H size={28}>{TABS.find((x) => x.key === tab)!.label}</H>
            {current ? <Badge label={`${current.name} · ${current.domain}`} /> : null}
            {current?.mode === 'sensitive' ? <Badge label="Sensitive site" tone="dark" /> : null}
          </View>
          {!site || !siteId ? <Loading /> : (
            <>
              {tab === 'overview' ? <Overview stats={stats} site={site} go={setTab} /> : null}
              {tab === 'moderation' ? <Moderation api={api} siteId={siteId} onChange={reloadStats} /> : null}
              {tab === 'members' ? <Members api={api} siteId={siteId} /> : null}
              {tab === 'fields' ? <Fields api={api} site={site} onSite={setSite} /> : null}
              {tab === 'pages' ? <Pages api={api} site={site} /> : null}
              {tab === 'settings' ? <Settings api={api} site={site} onSite={setSite} role={me.admin.role} /> : null}
            </>
          )}
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
  const pw = site.settings.paywall;
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Stat label="Members" value={stats.members} />
        <Stat label="Active today" value={stats.activeToday} />
        <Stat label="New this week" value={stats.newThisWeek} />
        <Stat label="Premium" value={stats.premium} />
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
        <Txt sub size={15}>Paywall: who liked you is {pw.whoLikedMe ? 'locked' : 'free'}, who viewed you is {pw.whoViewedMe ? 'locked' : 'free'}, starting conversations is {pw.initiateContact ? 'Premium only' : 'free'}.</Txt>
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
                  {m.premium ? <Badge label="Premium" /> : null}
                  {m.status === 'suspended' ? <Badge label="Suspended" tone="alert" /> : null}
                  {m.reports ? <Badge label={`${m.reports} report${m.reports > 1 ? 's' : ''}`} tone="alert" /> : null}
                </View>
                <Txt sub size={13}>{m.city || 'No city yet'} · {m.photoCount} photos · joined {relTime(m.createdAt)} · active {relTime(m.lastActiveAt)}</Txt>
              </View>
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
  const [price, setPrice] = useState(site.settings.premiumPriceLabel);
  const [descriptor, setDescriptor] = useState(site.settings.billingDescriptor);
  const lim = site.settings.messageLimits;
  const [limits, setLimits] = useState({ a: String(lim.newConversationsPerHour), b: String(lim.messagesPerMinute), c: String(lim.duplicateRecipientThreshold) });
  const save = async (patch: Parameters<AdminApi['updateSite']>[1]) => {
    setError(null);
    try { onSite(await api.updateSite(site.id, patch)); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); }
  };
  const pw = site.settings.paywall;
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
      {section('Freemium switches', (
        <>
          <Toggle label="Lock “who liked you”" hint="Free members see a count and blurred faces." value={pw.whoLikedMe} onChange={(v) => save({ settings: { paywall: { whoLikedMe: v } } })} />
          <Toggle label="Lock “who viewed you”" value={pw.whoViewedMe} onChange={(v) => save({ settings: { paywall: { whoViewedMe: v } } })} />
          <Toggle label="Premium to start conversations" hint="Free members can always reply." value={pw.initiateContact} onChange={(v) => save({ settings: { paywall: { initiateContact: v } } })} />
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <View style={{ flex: 1, minWidth: 160 }}><Field label="Price label" value={price} onChangeText={setPrice} /></View>
            <View style={{ flex: 1, minWidth: 160 }}><Field label="Billing descriptor" value={descriptor} onChangeText={setDescriptor} /></View>
            <Btn label="Save" size="sm" onPress={() => save({ settings: { premiumPriceLabel: price, billingDescriptor: descriptor } })} />
          </View>
        </>
      ), 'Everything is free at launch. Flip these on when you are ready to charge.')}
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
