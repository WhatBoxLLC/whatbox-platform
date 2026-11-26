import { ApiError, type MemberProfile, type PhotoView } from '@whatbox/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSession } from '../../../lib/session';
import { Badge, Btn, Card, Chip, ErrorText, Field, H, Icon, Loading, Notice, PhotoTile, relTime, Txt, useTheme, useWide } from '../../../ui/kit';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const t = useTheme();
  const wide = useWide(900);
  const [p, setP] = useState<MemberProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [big, setBig] = useState<PhotoView | undefined>();
  const [safety, setSafety] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.profile(id); setP(r); setBig(r.mainPhoto); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load.'); }
  }, [api, id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <View style={{ padding: 24 }}><Notice tone="error">{error}</Notice></View>;
  if (!p) return <Loading />;

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setError(null);
    try { await fn(); if (msg) setNote(msg); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.'); }
  };
  const privNote = {
    none: `${p.displayName} approves who can see these, and can revoke access.`,
    requested: `Request sent. ${p.displayName} decides who can see these.`,
    granted: `${p.displayName} shared these with you.`,
    denied: `${p.displayName} keeps these private.`,
    revoked: `${p.displayName} keeps these private.`,
  }[p.privateAccess];
  const all = [p.mainPhoto, ...p.publicPhotos].filter(Boolean) as PhotoView[];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 56 }}>
      <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/browse'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}>
          <Icon name="back" size={18} color={t.accent} stroke={2.2} />
          <Txt bold size={15} color={t.accent}>Back to results</Txt>
        </Pressable>

        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 32, marginTop: 8, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, width: '100%', gap: 14 }}>
            <PhotoTile photo={big} radius={22} style={{ height: wide ? 520 : 400 }} silhouette="80%">
              {big?.id === p.mainPhoto?.id ? <View style={{ position: 'absolute', left: 16, top: 16 }}><Badge label="Main photo" tone="online" /></View> : null}
            </PhotoTile>
            {all.length > 1 ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <H size={16} level={2}>Public photos</H>
                  <Txt sub size={14}>{p.publicPhotos.length} of 6</Txt>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {all.map((ph, i) => (
                    <Pressable key={ph.id} accessibilityLabel={`Photo ${i + 1}`} onPress={() => setBig(ph)} style={{ flex: 1, aspectRatio: 1, maxWidth: 90 }}>
                      <PhotoTile photo={ph} style={{ flex: 1, borderWidth: big?.id === ph.id ? 3 : 0, borderColor: t.accent }} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {p.publicPhotosLocked > 0 ? (
              <Notice tone="info" icon="lock" title={`${p.publicPhotosLocked} more photo${p.publicPhotosLocked === 1 ? '' : 's'}`}>{p.upgradeHint ?? 'Upgrade to see all photos.'}</Notice>
            ) : null}

            {p.privatePhotoCount > 0 ? (
              <Card pad={18} style={{ gap: 14, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 200 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Icon name="lock" size={18} color={t.ink} />
                      <H size={16} level={2}>Private photos · {p.privatePhotoCount}</H>
                    </View>
                    <Txt sub size={14}>{privNote}</Txt>
                  </View>
                  {p.privateAccess === 'none' && p.canRequestPrivate ? <Btn label="Request access" size="sm" onPress={() => act(() => api.requestAccess(p.id))} /> : null}
                  {p.privateAccess === 'none' && !p.canRequestPrivate ? <Btn label="Upgrade to request" kind="secondary" size="sm" icon="lock" onPress={() => router.push('/me?tab=settings')} /> : null}
                  {p.privateAccess === 'requested' ? <Btn label="Requested" kind="soft" size="sm" disabled /> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {p.privatePhotos.map((ph) => (
                    <Pressable key={ph.id} disabled={!!ph.placeholder} onPress={() => setBig(ph)} style={{ flex: 1, aspectRatio: 1, maxWidth: 90 }}>
                      <PhotoTile photo={ph} style={{ flex: 1 }} />
                    </Pressable>
                  ))}
                </View>
              </Card>
            ) : null}
          </View>

          <View style={{ flex: 1, width: '100%', gap: 18 }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <H size={40}>{p.displayName}, {p.age}</H>
                {p.tier === 'vip' ? <Badge label="★ VIP" tone="alert" /> : null}
                {p.verified ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Icon name="check" size={14} color={t.accent} stroke={2.6} />
                    <Txt bold size={13} color={t.accent}>Verified</Txt>
                  </View>
                ) : null}
              </View>
              <Txt sub style={{ marginTop: 6 }}>{p.city}, {p.region}{p.miles !== null ? ` · ${p.miles} miles away` : ''} · {p.online ? 'Online now' : `Active ${relTime(p.lastActiveAt)}`}</Txt>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Btn flex label="Message" icon="chat" disabled={!p.canMessage} onPress={() => router.push(`/messages/${p.id}`)} style={{ minWidth: 150 }} />
              <Btn flex label={p.likedByMe ? 'Liked' : 'Like'} icon="heart" kind={p.likedByMe ? 'soft' : 'danger'} onPress={() => act(async () => {
                const r = await api.like(p.id, !p.likedByMe);
                setNote(r.mutual ? `You and ${p.displayName} like each other.` : null);
              })} style={{ minWidth: 120 }} />
              <Pressable accessibilityLabel="Block or report" onPress={() => setSafety(!safety)} style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="flag" size={20} color={t.sub} />
              </Pressable>
            </View>
            {p.messageLockReason ? <Notice tone="warn" icon="lock">{p.messageLockReason}</Notice> : null}
            {note ? <Notice tone="success" icon="heart">{note}</Notice> : null}
            <ErrorText error={error} />

            {safety ? (
              <Card style={{ gap: 12 }}>
                <H size={18} level={2}>Safety</H>
                <Txt sub size={14}>Reports are private. {p.displayName} won't know who reported them.</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['Asked for money', 'Pushing to another app', 'Fake profile', 'Rude or abusive', 'Underage'].map((r) => (
                    <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
                  ))}
                </View>
                <Field label="Anything else? (optional)" value={reason} onChangeText={setReason} />
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <Btn label="Send report" kind="danger" size="sm" onPress={() => act(() => api.report(p.id, reason), 'Thanks. The safety team will review this.').then(() => setSafety(false))} />
                  <Btn label={p.blockedByMe ? 'Unblock' : `Block ${p.displayName}`} kind="secondary" size="sm" onPress={() => act(() => api.block(p.id, !p.blockedByMe), p.blockedByMe ? 'Unblocked.' : `${p.displayName} can no longer see you or message you.`)} />
                </View>
              </Card>
            ) : null}

            <Card>
              <H size={18} level={2} style={{ marginBottom: 8 }}>About me</H>
              <Txt>{p.about || `${p.displayName} hasn't written anything yet.`}</Txt>
            </Card>

            {p.details.length ? (
              <Card>
                <H size={18} level={2} style={{ marginBottom: 14 }}>Details</H>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
                  <Detail label="Looking for" value={`${p.seeking.map((s) => ({ woman: 'Women', man: 'Men', nonbinary: 'Nonbinary people' })[s]).join(', ')}, ${p.ageMin} to ${p.ageMax}`} />
                  {p.details.map((d) => <Detail key={d.key} label={d.label} value={d.value} />)}
                </View>
              </Card>
            ) : null}

            {p.interests.length ? (
              <Card>
                <H size={18} level={2} style={{ marginBottom: 12 }}>Interests</H>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {p.interests.map((i) => <Chip key={i} label={i} />)}
                </View>
              </Card>
            ) : null}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingRight: 12 }}>
      <Txt sub size={13}>{label}</Txt>
      <Txt bold>{value}</Txt>
    </View>
  );
}
