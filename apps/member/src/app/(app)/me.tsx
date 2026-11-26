import { ApiError, type AccessRow, type Member } from '@whatbox/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSession } from '../../lib/session';
import { FieldsEditor } from '../../ui/FieldsEditor';
import { Avatar, Badge, Btn, Card, ErrorText, Field, H, Notice, relTime, Segmented, Toggle, Txt, useTheme } from '../../ui/kit';
import { TIERS, type TierPerms, type Units } from '@whatbox/core';
import { PhotoManager } from '../../ui/PhotoManager';

type Tab = 'profile' | 'photos' | 'access' | 'settings';

export default function Me() {
  const { me, site } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'settings' ? 'settings' : 'profile');
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
  const [postal, setPostal] = useState(m.postal);
  const [ageMin, setAgeMin] = useState(String(m.ageMin));
  const [ageMax, setAgeMax] = useState(String(m.ageMax));
  const [fields, setFields] = useState<Member['fields']>(m.fields);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card style={{ gap: 20 }}>
      <Field label="Display name" value={name} onChangeText={setName} maxLength={24} />
      <Field label="About me" value={about} onChangeText={setAbout} multiline style={{ minHeight: 120, textAlignVertical: 'top' }} hint="Contact details here are flagged for review." />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="ZIP code" value={postal} onChangeText={setPostal} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Ages from" value={ageMin} onChangeText={setAgeMin} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="to" value={ageMax} onChangeText={setAgeMax} keyboardType="number-pad" /></View>
      </View>
      <H size={18} level={2}>About you on {site.name}</H>
      <FieldsEditor fields={site.fields} value={fields} onChange={setFields} />
      {msg ? <Notice tone="success" icon="check">{msg}</Notice> : null}
      <ErrorText error={error} />
      <Btn label="Save changes" busy={busy} onPress={async () => {
        setBusy(true); setError(null); setMsg(null);
        try {
          setMe(await api.updateMe({ displayName: name, about, postal, ageMin: Number(ageMin), ageMax: Number(ageMax), fields }));
          setMsg('Saved.');
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); } finally { setBusy(false); }
      }} />
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
  const { api, me, setMe, site } = useSession();
  const ms = site.membership;
  const cur = me!.member.tier ?? 'free';
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
                <Txt bold>{tp.label}{tp.priceLabel ? ` · ${tp.priceLabel}` : ' · free'}</Txt>
                {on ? <Badge label="Your plan" /> : <Btn size="sm" kind="secondary" label={`Switch (prototype)`} onPress={async () => setMe(await api.setTier(tid))} />}
              </View>
              <Txt sub size={13}>{lines(tp).join(' · ')}</Txt>
            </View>
          );
        })}
      </View>
      <Txt sub size={12}>{`Same price for every member. Statements show "${site.billingDescriptor}". The prototype takes no payment.`}</Txt>
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
          { value: 'imperial', label: 'Feet and inches' }, { value: 'metric', label: 'Centimeters' },
        ]} />
      </Card>
      <MembershipCard />
      <Card style={{ gap: 10 }}>
        <H size={18} level={2}>Account</H>
        <Txt sub>Signed in with {m.contact || 'a verified contact'}. This is encrypted and never shown to other members.</Txt>
        <Btn size="sm" kind="secondary" icon="logout" label="Sign out" style={{ alignSelf: 'flex-start' }} onPress={async () => { await signOut(); router.replace('/'); }} />
      </Card>
    </View>
  );
}
