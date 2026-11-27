// Activity: "Liked you" is built for busy inboxes. Priority likes come first, then people who fit
// what you asked for, then serious profiles. Quick filters and one-tap like back or pass.
import type { ActivityList, ActivityPerson, Tier } from '@whatbox/core';
import { TONES } from '@whatbox/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSession } from '../../lib/session';
import { Badge, Btn, Card, Chip, Grid, H, Icon, Loading, Notice, PhotoTile, relTime, Segmented, Silhouette, Txt, useTheme } from '../../ui/kit';

type Kind = 'likes' | 'views' | 'mine' | 'favorites';
type Quick = 'all' | 'vip' | 'fits' | 'serious' | 'new';
const QUICK: { value: Quick; label: string; test: (p: ActivityPerson) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'vip', label: '★ VIP', test: (p) => p.vip },
  { value: 'fits', label: 'Fits my preferences', test: (p) => p.fitsMe },
  { value: 'serious', label: 'Verified with photo', test: (p) => p.serious },
  { value: 'new', label: 'New here', test: (p) => p.isNew },
];

export default function Activity() {
  const { api, me, setMe, site } = useSession();
  const t = useTheme();
  const [kind, setKind] = useState<Kind>('likes');
  const [quick, setQuick] = useState<Quick>('all');
  const [lists, setLists] = useState<Partial<Record<Kind, ActivityList>>>({});
  const [done, setDone] = useState<Record<string, 'liked' | 'passed'>>({});
  const [checkout, setCheckout] = useState<Tier | null>(null);
  const ms = site.membership;
  const tier = me?.member.tier ?? 'free';

  const load = useCallback(async () => {
    const [likes, views, mine, favorites] = await Promise.all([api.activity('likes'), api.activity('views'), api.activity('mine'), api.activity('favorites')]);
    setLists({ likes, views, mine, favorites });
  }, [api]);
  useEffect(() => { load(); }, [load, tier, me?.paywallEnabled]);

  const list = lists[kind];
  const shown = useMemo(() => {
    if (!list) return [];
    const q = QUICK.find((x) => x.value === quick)!;
    return list.people.filter((p) => kind !== 'likes' || q.test(p));
  }, [list, quick, kind]);

  async function likeBack(p: ActivityPerson) {
    const r = await api.like(p.id, true);
    setDone((d) => ({ ...d, [p.id]: 'liked' }));
    if (r.mutual) router.push(`/messages/${p.id}`);
  }
  async function pass(p: ActivityPerson) {
    await api.pass(p.id);
    setDone((d) => ({ ...d, [p.id]: 'passed' }));
  }

  const upTier: Tier = ms.tiers.paid.seeLikesFrom.length === 3 ? 'paid' : 'vip';
  const counts = list && kind === 'likes' ? Object.fromEntries(QUICK.map((q) => [q.value, list.people.filter(q.test).length])) : {};

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={{ maxWidth: 900, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 16 }}>
        <H size={30}>Activity</H>
        <Segmented<Kind> value={kind} onChange={(k) => { setKind(k); setQuick('all'); }} options={[
          { value: 'likes', label: `Liked you${lists.likes ? ' · ' + lists.likes.total : ''}` },
          { value: 'views', label: `Viewed${lists.views ? ' · ' + lists.views.total : ''}` },
          { value: 'mine', label: 'Your likes' },
          { value: 'favorites', label: 'Favorites' },
        ]} />

        {kind === 'likes' && list && list.people.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} role="toolbar" aria-label="Quick filters">
            {QUICK.map((q) => <Chip key={q.value} label={`${q.label} ${counts[q.value] ?? 0}`} selected={quick === q.value} onPress={() => setQuick(q.value)} />)}
          </View>
        ) : null}

        {!list ? <Loading /> : (
          <>
            {list.hidden > 0 ? (
              <Card style={{ gap: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', gap: -16 } as any} aria-hidden>
                  {Array.from({ length: Math.min(4, list.hidden) }).map((_, i) => (
                    <View key={i} style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: t.surface, marginLeft: i ? -14 : 0 }}>
                      <View style={[{ position: 'absolute', inset: 0 } as any, Platform.OS === 'web' ? ({ filter: 'blur(5px)' } as any) : { opacity: 0.5 }]}>
                        <Silhouette bg={TONES[i % 6][0]} fg={TONES[i % 6][1]} size="90%" />
                      </View>
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                  <Txt bold>{list.hidden} more {list.hidden === 1 ? 'person' : 'people'} {kind === 'likes' ? 'liked' : 'viewed'} you</Txt>
                  <Txt sub size={14}>{kind === 'likes' ? `You can always see likes from ${ms.tiers.vip.label} members. ` : ''}Upgrade to see everyone.</Txt>
                </View>
                {checkout ? (
                  <View style={{ width: '100%', gap: 10 }}>
                    <Notice tone="warn" title="Prototype checkout">{`No payment is taken. The real build hands off to the site's processor and your statement shows "${site.billingDescriptor}".`}</Notice>
                    <Btn label={`Confirm ${ms.tiers[checkout].label}`} onPress={async () => { setMe(await api.setTier(checkout)); setCheckout(null); }} />
                  </View>
                ) : (
                  <Btn size="sm" label={list.upgradeLabel || `Upgrade to ${ms.tiers[upTier].label}`} onPress={() => setCheckout(upTier)} />
                )}
              </Card>
            ) : null}

            {shown.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: 6 }}>
                <Icon name="heart" size={28} color={t.sub} />
                <Txt bold>{list.people.length && quick !== 'all' ? 'No one in this filter' : 'Nothing here yet'}</Txt>
                <Txt sub center>{kind === 'favorites' ? 'Tap the star on a profile to save it here. They are not told.' : kind === 'mine' ? 'Like someone from Discover and they will show up here.' : 'When people find you, they will show up here.'}</Txt>
              </Card>
            ) : (
              <Grid min={190} gap={14}>
                {shown.map((p) => (
                  <View key={p.id} style={{ backgroundColor: t.surface, borderWidth: p.vip ? 2 : 1, borderColor: p.vip ? '#D9A43A' : t.line, borderRadius: 16, overflow: 'hidden', opacity: done[p.id] === 'passed' ? 0.45 : 1 }}>
                    <Pressable onPress={() => router.push(`/member/${p.id}`)} accessibilityLabel={`${p.displayName}, ${p.age}. Open profile`}>
                      <PhotoTile photo={p.mainPhoto} radius={0} style={{ height: 180 }}>
                        <View style={{ position: 'absolute', top: 8, left: 8, gap: 4, alignItems: 'flex-start' }}>
                          {p.vip ? <Badge label="★ VIP" tone="alert" /> : null}
                          {p.online ? <Badge label="Online" tone="online" /> : null}
                          {p.isNew ? <Badge label="New" /> : null}
                        </View>
                      </PhotoTile>
                    </Pressable>
                    <View style={{ padding: 10, gap: 2 }}>
                      <Txt bold>{p.displayName}, {p.age}</Txt>
                      <Txt sub size={13}>{p.city} · {relTime(p.at)}</Txt>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        {p.fitsMe ? <Txt size={12} color={t.accent} bold>Fits you</Txt> : null}
                        {p.serious ? <Txt size={12} color={t.accent} bold>Verified</Txt> : null}
                      </View>
                      {kind === 'likes' ? (
                        p.likedBack || done[p.id] === 'liked' ? (
                          <Btn size="sm" kind="soft" icon="chat" label="Say hello" style={{ marginTop: 8 }} onPress={() => router.push(`/messages/${p.id}`)} />
                        ) : done[p.id] === 'passed' ? (
                          <Txt sub size={13} style={{ marginTop: 8 }}>Passed</Txt>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <Btn size="sm" kind="secondary" icon="x" label="Pass" flex onPress={() => pass(p)} accessibilityLabel={`Pass on ${p.displayName}`} />
                            <Btn size="sm" icon="heart" label="Like" flex onPress={() => likeBack(p)} accessibilityLabel={`Like ${p.displayName} back`} />
                          </View>
                        )
                      ) : null}
                    </View>
                  </View>
                ))}
              </Grid>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
