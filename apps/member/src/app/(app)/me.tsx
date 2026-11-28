import { ApiError, DEFAULT_NOTIFY, DEFAULT_STRICT, GENDERS, type NotifyPrefs, type AccessRow, type Gender, type Member, type HiddenPrefs, type StrictPrefs } from '@whatbox/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useBilling } from '../../lib/billing';
import { useSession } from '../../lib/session';
import { FieldsEditor } from '../../ui/FieldsEditor';
import { Avatar, Badge, Btn, Card, ChipPicker, ErrorText, Field, H, Notice, relTime, Segmented, Toggle, Txt, useTheme } from '../../ui/kit';
import { LocationPicker, type PickedLocation } from '../../ui/LocationPicker';
import { DISTANCE_STEPS, distanceLabel } from '../../lib/distance';
import { TIERS, type Tier, type TierPerms, type Units } from '@whatbox/core';
import { PhotoManager } from '../../ui/PhotoManager';

type Tab = 'profile' | 'photos' | 'access' | 'settings';
const NOTIFY_ROWS: [keyof NotifyPrefs, string][] = [
  ['messages', 'New messages'], ['matches', 'Mutual likes'], ['likes', 'Someone likes you'], ['photos', 'Photo approved or not approved'], ['access', 'Private photo requests and shares'],
];

export default function Me() {
  const { me, site } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((['profile', 'photos', 'access', 'settings'] as Tab[]).includes(params.tab as Tab) ? (params.tab as Tab) : 'profile');
  if (!me) return null;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar photo={me.photos.find((p) => p.kind === 'main')} size={64} />
          <View style={{ flex: 1 }}>
            <H size={28}>{me.member.displayName}</H>
            <Txt sub size={14}>{me.member.city}, {me.member.region} · {site.membership.tiers[me.member.tier ?? 'free'].label} member</Txt>
          </View>
        </View>
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: 'profile', label: 'Profile' }, { value: 'photos', label: 'Photos' }, { value: 'access', label: 'Requests' }, { value: 'settings', label: 'Settings' },
        ]} />
        {tab === 'profile' ? <ProfileTab /> : null}
        {tab === 'photos' ? <Card><PhotoManager /></Card> : null}
        {tab === 'access' ? <AccessTab /> : null}
        {tab === 'settings' ? <SettingsTab /> : null}
      </View>
    </ScrollView>
  );
}

function ProfileTab() {
  const { api, me, setMe, site } = useSession();
  const m = me!.member;
  const [name, setName] = useState(m.displayName);
  const [about, setAbout] = useState(m.about);
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [seeking, setSeeking] = useState<Gender[]>(m.seeking);
  const [ageMin, setAgeMin] = useState(String(m.ageMin));
  const [ageMax, setAgeMax] = useState(String(m.ageMax));
  const [miles, setMiles] = useState<number | null>(m.maxMiles === undefined ? 50 : m.maxMiles);
  const [strict, setStrict] = useState<StrictPrefs>({ ...DEFAULT_STRICT, ...m.strict });
  const [hidden, setHidden] = useState<HiddenPrefs>({ ...m.hiddenPrefs });
  const [showEvents, setShowEvents] = useState(!!m.showEvents);
  const units = m.unitsResolved;
  const plural = (v: Gender) => GENDERS.find((g) => g.value === v)!.plural;
  const [fields, setFields] = useState<Member['fields']>(m.fields);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card style={{ gap: 20 }}>
      <Field label="Display name" value={name} onChangeText={setName} maxLength={24} />
      <Field label="About me" value={about} onChangeText={setAbout} multiline style={{ minHeight: 120, textAlignVertical: 'top' }} hint="Contact details here are flagged for review." />
      <LocationPicker current={{ city: m.city, region: m.region, country: m.country, postal: m.postal }} onChange={setLoc} />
      <H size={18} level={2}>Who you want to meet</H>
      <Txt sub size={14} style={{ marginTop: -12 }}>Discover and Browse start from these. A hard limit is never crossed. A preferred one widens when you run out of people, and those people are labelled.</Txt>
      <ChipPicker label="Looking for" multi options={GENDERS.map((g) => g.plural)} value={seeking.map(plural)}
        onChange={(ls: string[]) => ls.length && setSeeking(ls.map((l) => GENDERS.find((g) => g.plural === l)!.value))} />
      <Toggle label="Hard limit" value={strict.seeking} onChange={(v) => setStrict({ ...strict, seeking: v })} />
      <Toggle label="Keep private" hint="Hide who you're looking for on your profile. It still decides who we suggest." value={!!hidden.seeking} onChange={(v) => setHidden({ ...hidden, seeking: v })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="Ages from" value={ageMin} onChangeText={(v) => setAgeMin(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="to" value={ageMax} onChangeText={(v) => setAgeMax(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" /></View>
      </View>
      <Toggle label="Hard limit" value={strict.age} onChange={(v) => setStrict({ ...strict, age: v })} />
      <Toggle label="Keep private" hint="Hide your age range on your profile. It still decides who we suggest." value={!!hidden.ages} onChange={(v) => setHidden({ ...hidden, ages: v })} />
      <ChipPicker label="Distance" options={DISTANCE_STEPS.map((d) => distanceLabel(d, units))} value={distanceLabel(miles, units)}
        onChange={(l: string) => setMiles(DISTANCE_STEPS.find((d) => distanceLabel(d, units) === l)!)} />
      <Toggle label="Hard limit" value={strict.distance} onChange={(v) => setStrict({ ...strict, distance: v })} />
      <Toggle label="Show events I'm going to on my profile" hint="Off by default. When on, other members see the site events you're going to or went to, and you're listed on those events." value={showEvents} onChange={setShowEvents} />
      <H size={18} level={2}>About you on {site.name}</H>
      <FieldsEditor fields={site.fields} value={fields} onChange={setFields} />
      {msg ? <Notice tone="success" icon="check">{msg}</Notice> : null}
      <ErrorText error={error} />
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
      <Btn label="Save changes" busy={busy} onPress={async () => {
        setBusy(true); setError(null); setMsg(null);
        try {
          setMe(await api.updateMe({ displayName: name, about, ...(loc ? { location: loc.input } : {}), seeking, ageMin: Number(ageMin) || m.ageMin, ageMax: Number(ageMax) || m.ageMax, maxMiles: miles, strict, hiddenPrefs: hidden, showEvents, fields }));
          setMsg('Saved.');
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); } finally { setBusy(false); }
      }} />
      <Btn label="View as others see me" icon="eye" kind="secondary" disabled={!m.profileComplete} onPress={() => router.push('/member/me')} />
      </View>
      <Txt sub size={13}>Save first: the preview shows your saved profile.</Txt>
    </Card>
  );
}

function AccessTab() {
  const { api } = useSession();
  const t = useTheme();
  const [lists, setLists] = useState<{ incoming: AccessRow[]; outgoing: AccessRow[] } | null>(null);
  const load = useCallback(() => api.privateAccess().then(setLists), [api]);
  useEffect(() => { load(); }, [load]);
  if (!lists) return null;
  const label = { requested: 'Waiting', granted: 'Can see your private photos', denied: 'Declined', revoked: 'Access revoked' } as const;
  const outLabel = { requested: 'Request sent', granted: 'Shared with you', denied: 'Not shared', revoked: 'No longer shared' } as const;
  const row = (r: AccessRow, actions: React.ReactNode, status: string) => (
    <View key={r.member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: t.line, flexWrap: 'wrap' }}>
      <Pressable onPress={() => router.push(`/member/${r.member.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 180 }}>
        <Avatar photo={r.member.mainPhoto} size={48} />
        <View>
          <Txt bold>{r.member.displayName}, {r.member.age}</Txt>
          <Txt sub size={13}>{status} · {relTime(r.updatedAt)}</Txt>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}>{actions}</View>
    </View>
  );
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 4 }}>
        <H size={18} level={2}>Requests to see your private photos</H>
        <Txt sub size={14} style={{ marginBottom: 8 }}>You decide who sees them, and you can revoke access any time.</Txt>
        {lists.incoming.length === 0 ? <Txt sub>No requests yet.</Txt> : lists.incoming.map((r) => row(r, (
          <>
            {r.status !== 'granted' ? <Btn size="sm" label="Approve" onPress={async () => setLists(await api.decideAccess(r.member.id, 'grant'))} /> : null}
            {r.status === 'requested' ? <Btn size="sm" kind="secondary" label="Decline" onPress={async () => setLists(await api.decideAccess(r.member.id, 'deny'))} /> : null}
            {r.status === 'granted' ? <Btn size="sm" kind="danger" label="Revoke" onPress={async () => setLists(await api.decideAccess(r.member.id, 'revoke'))} /> : null}
          </>
        ), label[r.status]))}
      </Card>
      <Card style={{ gap: 4 }}>
        <H size={18} level={2}>Your requests</H>
        {lists.outgoing.length === 0 ? <Txt sub>You haven't asked anyone yet.</Txt> : lists.outgoing.map((r) => row(r, r.status === 'granted' ? <Badge label="Unlocked" /> : null, outLabel[r.status]))}
      </Card>
    </View>
  );
}

function MembershipCard() {
  const { me, site } = useSession();
  const billing = useBilling();
  const params = useLocalSearchParams<{ checkout?: string }>();
  const [note, setNote] = useState<{ tone: 'success' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ms = site.membership;
  const cur = me!.member.tier ?? 'free';
  const sub = me!.subscription;
  useEffect(() => {
    if (params.checkout === 'cancelled') setNote({ tone: 'warn', text: 'Checkout was cancelled. Nothing was charged.' });
    if (params.checkout === 'done') {
      setNote({ tone: 'success', text: 'Thanks! Confirming your payment…' });
      billing.waitForTier().then((ok) => setNote(ok ? { tone: 'success', text: 'Your membership is active.' } : { tone: 'success', text: 'Payment received. Your plan will switch shortly.' }));
    }
  }, [params.checkout]); // eslint-disable-line react-hooks/exhaustive-deps
  async function choose(tid: Tier) {
    setBusy(tid); setNote(null);
    try {
      const r = await billing.upgrade(tid);
      if (r === 'cancelled') setNote({ tone: 'warn', text: 'Checkout was cancelled. Nothing was charged.' });
      if (r === 'pending') setNote({ tone: 'success', text: 'Payment received. Your plan will switch in a moment.' });
    } catch (e) {
      setNote({ tone: 'warn', text: e instanceof ApiError ? e.message : 'Checkout did not start. Try again.' });
    } finally { setBusy(null); }
  }
  const canBuy = (tid: Tier) => billing.selfServe || (ms.paywallEnabled && tid !== 'free' && !(sub && (sub.status === 'active' || sub.status === 'past_due')));
  const lines = (tp: TierPerms) => [
    tp.seePublicPhotos ? 'All public photos' : 'Main photo only',
    tp.requestPrivatePhotos ? 'Request private photos' : null,
    tp.seeLikesFrom.length === 3 ? 'See everyone who likes you' : `See likes from ${tp.seeLikesFrom.map((x) => ms.tiers[x].label).join(', ')}`,
    tp.startConversations ? 'Start conversations' : 'Reply to VIP messages',
    tp.priorityLikes ? 'Your likes go to the top' : null,
  ].filter(Boolean) as string[];
  return (
    <Card style={{ gap: 12 }}>
      <H size={18} level={2}>Membership</H>
      {!ms.paywallEnabled ? <Notice tone="success" icon="star">{`${site.name} is free for everyone right now, with full access. Levels below show what changes when the site turns on paid plans.`}</Notice> : null}
      <View style={{ gap: 10 }}>
        {TIERS.map((tid) => {
          const tp = ms.tiers[tid];
          const on = cur === tid;
          return (
            <View key={tid} style={{ borderWidth: on ? 2 : 1, borderColor: on ? '#22655F' : '#E4DED5', borderRadius: 14, padding: 12, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Txt bold>{tp.label}{tp.priceLabel ? ` · ${tp.priceLabel}` : tp.label.toLowerCase() === 'free' ? '' : ' · free'}</Txt>
                {on ? <Badge label="Your plan" /> : canBuy(tid) ? (
                  <Btn size="sm" kind="secondary" busy={busy === tid} label={billing.selfServe ? 'Switch (prototype)' : `Choose ${tp.label}`} onPress={() => choose(tid)} />
                ) : null}
              </View>
              <Txt sub size={13}>{lines(tp).join(' · ')}</Txt>
            </View>
          );
        })}
      </View>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {sub && !billing.selfServe ? (
        <View style={{ gap: 6 }}>
          <Txt sub size={13}>{sub.status === 'cancelled'
            ? `Cancelled. ${ms.tiers[sub.tier].label} stays on${sub.currentPeriodEnd ? ' until ' + new Date(sub.currentPeriodEnd).toLocaleDateString() : ' to the end of the period'}.`
            : sub.status === 'past_due' ? 'Your last payment did not go through. Update it with your payment provider.'
            : `${ms.tiers[sub.tier].label} renews${sub.currentPeriodEnd ? ' on ' + new Date(sub.currentPeriodEnd).toLocaleDateString() : ' monthly'}.`}</Txt>
          {sub.status === 'active' || sub.status === 'past_due' ? <Btn size="sm" kind="secondary" label="Cancel membership" style={{ alignSelf: 'flex-start' }} busy={busy === 'cancel'} onPress={async () => { setBusy('cancel'); try { await billing.cancel(); } finally { setBusy(null); } }} /> : null}
        </View>
      ) : null}
      <Txt sub size={12}>{`Same price for every member. Statements show "${site.billingDescriptor}".${billing.selfServe ? ' The prototype takes no payment.' : ''}`}</Txt>
    </Card>
  );
}

function DeleteAccount() {
  const { api, site, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Card style={{ gap: 10 }}>
      <H size={18} level={2}>Delete account</H>
      <Txt sub size={14}>{`Permanently removes your profile, photos, likes and messages from ${site.name}. This can't be undone.`}</Txt>
      {!open ? <Btn size="sm" kind="danger" label="Delete my account" style={{ alignSelf: 'flex-start' }} onPress={() => setOpen(true)} /> : (
        <View style={{ gap: 8 }}>
          <Field label="Type DELETE to confirm" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
          <ErrorText error={error} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn size="sm" kind="danger" label="Delete forever" disabled={confirm.trim().toUpperCase() !== 'DELETE'} onPress={async () => {
              setError(null);
              try { await api.deleteAccount(confirm); await signOut().catch(() => {}); router.replace('/'); }
              catch (e) { setError(e instanceof ApiError ? e.message : 'Could not delete. Try again.'); }
            }} />
            <Btn size="sm" kind="secondary" label="Cancel" onPress={() => { setOpen(false); setConfirm(''); }} />
          </View>
        </View>
      )}
    </Card>
  );
}

function SettingsTab() {
  const { api, me, setMe, signOut, site } = useSession();
  const m = me!.member;
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 8 }}>
        <H size={18} level={2}>Content</H>
        <Toggle label="Hide explicit photos" hint={site.explicitPhotosAllowed ? 'When on, explicit private photos show as a placeholder.' : `${site.name} does not allow explicit photos, so this has no effect here.`} value={m.hideExplicit} onChange={async (v) => setMe(await api.updateMe({ hideExplicit: v }))} />
      </Card>
      <Card style={{ gap: 8 }}>
        <H size={18} level={2}>Units</H>
        <Txt sub size={14}>Heights always show both. This picks which comes first.</Txt>
        <Segmented<Units> value={m.unitsResolved} onChange={async (u) => setMe(await api.updateMe({ units: u }))} options={[
          { value: 'imperial', label: 'Miles, feet and inches' }, { value: 'metric', label: 'Kilometers and cm' },
        ]} />
      </Card>
      <Card style={{ gap: 8 }}>
        <H size={18} level={2}>Phone notifications</H>
        <Txt sub size={14}>For the {site.name} app on iPhone and Android. Notifications never say what the site is about or who it's from.</Txt>
        {NOTIFY_ROWS.map(([k, label]) => (
          <Toggle key={k} label={label} value={{ ...DEFAULT_NOTIFY, ...m.notify }[k]} onChange={async (v) => setMe(await api.updateMe({ notify: { [k]: v } }))} />
        ))}
      </Card>
      <MembershipCard />
      <Card style={{ gap: 10 }}>
        <H size={18} level={2}>Account</H>
        <Txt sub>Signed in with {m.contact || 'a verified contact'}. This is encrypted and never shown to other members.</Txt>
        <Btn size="sm" kind="secondary" icon="logout" label="Sign out" style={{ alignSelf: 'flex-start' }} onPress={async () => { await signOut(); router.replace('/'); }} />
      </Card>
      <DeleteAccount />
    </View>
  );
}
