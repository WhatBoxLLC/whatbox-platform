import type { ActivityList } from '@whatbox/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSession } from '../../lib/session';
import { TONES } from '@whatbox/core';
import { Badge, Btn, Card, Grid, H, Icon, Loading, Notice, PhotoTile, relTime, Segmented, Silhouette, Txt, useTheme } from '../../ui/kit';

type Kind = 'likes' | 'views' | 'mine';

export default function Activity() {
  const { api, me, setMe, site } = useSession();
  const t = useTheme();
  const [kind, setKind] = useState<Kind>('likes');
  const [lists, setLists] = useState<Partial<Record<Kind, ActivityList>>>({});
  const [checkout, setCheckout] = useState(false);

  const load = useCallback(async () => {
    const [likes, views, mine] = await Promise.all([api.activity('likes'), api.activity('views'), api.activity('mine')]);
    setLists({ likes, views, mine });
  }, [api]);
  useEffect(() => { load(); }, [load, me?.member.premium]);

  const list = lists[kind];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={{ maxWidth: 900, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 18 }}>
        <H size={30}>Activity</H>
        <Segmented<Kind> value={kind} onChange={setKind} options={[
          { value: 'likes', label: `Liked you${lists.likes ? ' · ' + lists.likes.total : ''}` },
          { value: 'views', label: `Viewed${lists.views ? ' · ' + lists.views.total : ''}` },
          { value: 'mine', label: 'Your likes' },
        ]} />
        {!list ? <Loading /> : list.locked ? (
          <View style={{ position: 'relative', minHeight: 560 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} aria-hidden>
              {Array.from({ length: Math.min(8, Math.max(4, list.total)) }).map((_, i) => (
                <View key={i} style={{ width: '48%', maxWidth: 210, height: 180, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
                  <View style={[{ position: 'absolute', inset: 0 } as any, Platform.OS === 'web' ? ({ filter: 'blur(9px)' } as any) : { opacity: 0.5 }]}>
                    <Silhouette bg={TONES[i % 6][0]} fg={TONES[i % 6][1]} size="80%" />
                  </View>
                  <View style={{ position: 'absolute', left: 10, bottom: 10, width: 70, height: 12, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.75)' }} />
                </View>
              ))}
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 120, alignItems: 'center' }}>
              <View style={{ width: '100%', maxWidth: 380, backgroundColor: t.surface, borderRadius: 22, padding: 24, gap: 12, alignItems: 'center', shadowColor: '#1E2629', shadowOpacity: 0.22, shadowRadius: 50, shadowOffset: { width: 0, height: 20 } }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="lock" size={26} color={t.accent} />
                </View>
                <H size={23} level={2} style={{ textAlign: 'center' }}>{list.total} {list.total === 1 ? 'person' : 'people'} {kind === 'likes' ? (list.total === 1 ? 'likes' : 'like') : (list.total === 1 ? 'viewed' : 'viewed')} you</H>
                <Txt sub center size={15}>Upgrade to see who they are, like them back, and start chatting first.</Txt>
                {checkout ? (
                  <View style={{ width: '100%', gap: 10 }}>
                    <Notice tone="warn" title="Prototype checkout">{`No payment is taken. The real build hands off to ${site.slug === 'afterh' ? 'PayPal' : 'the site\'s processor'} and your statement shows "${site.billingDescriptor}".`}</Notice>
                    <Btn label="Confirm upgrade" size="lg" onPress={async () => { setMe(await api.upgrade(true)); setCheckout(false); }} />
                  </View>
                ) : (
                  <Btn label={`See who ${kind === 'likes' ? 'likes' : 'viewed'} you · ${list.priceLabel}`} size="lg" style={{ alignSelf: 'stretch' }} onPress={() => setCheckout(true)} />
                )}
                <Pressable onPress={() => setKind('mine')}><Txt bold size={14} color={t.accent}>Maybe later</Txt></Pressable>
              </View>
            </View>
          </View>
        ) : list.people.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: 6 }}>
            <Icon name="heart" size={28} color={t.sub} />
            <Txt bold>Nothing here yet</Txt>
            <Txt sub center>{kind === 'mine' ? 'Like someone from Browse and they will show up here.' : 'When people find you, they will show up here.'}</Txt>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {me?.member.premium && kind !== 'mine' ? <Notice tone="success" icon="star">You're on {site.name} Premium.</Notice> : null}
            <Grid min={150} gap={12}>
              {list.people.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/member/${p.id}`)} accessibilityLabel={`${p.displayName}, ${p.age}`}>
                  <PhotoTile photo={p.mainPhoto} radius={16} style={{ height: 180 }}>
                    {p.online ? <View style={{ position: 'absolute', top: 10, left: 10 }}><Badge label="Online" tone="online" /></View> : null}
                  </PhotoTile>
                  <Txt bold style={{ marginTop: 6 }}>{p.displayName}, {p.age}</Txt>
                  <Txt sub size={13}>{p.city} · {relTime(p.at)}</Txt>
                </Pressable>
              ))}
            </Grid>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
