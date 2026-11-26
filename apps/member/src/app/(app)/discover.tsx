// Discover: one blended stack (active, new and good-fit people together), reviewed one at a time.
// Phones swipe; the web uses the X and heart buttons or the arrow keys.
import type { DiscoverCard } from '@whatbox/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSession } from '../../lib/session';
import { Badge, Btn, Card, H, Icon, Loading, Notice, PhotoTile, Txt, useTheme, type IconName } from '../../ui/kit';

const SWIPE_AT = 110;

export default function Discover() {
  const { api, me, site } = useSession();
  const t = useTheme();
  const [deck, setDeck] = useState<DiscoverCard[] | null>(null);
  const [photo, setPhoto] = useState(0);
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'info' | 'warn' } | null>(null);
  const pos = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);

  const load = useCallback(async () => { setDeck(await api.discover()); setPhoto(0); }, [api]);
  useEffect(() => { load(); }, [load]);

  const top = deck?.[0];
  const ms = site.membership;
  const priority = ms.tiers[me?.member.tier ?? 'free'].priorityLikes;

  const next = useCallback(() => {
    pos.setValue({ x: 0, y: 0 });
    setPhoto(0);
    setDeck((d) => {
      const rest = d ? d.slice(1) : d;
      if (rest && rest.length < 3) api.discover().then((more) => setDeck((cur) => {
        const have = new Set((cur ?? []).map((c) => c.id));
        return [...(cur ?? []), ...more.filter((m) => !have.has(m.id))];
      }));
      return rest;
    });
  }, [api, pos]);

  const act = useCallback(async (what: 'pass' | 'like') => {
    if (!top || busy.current) return;
    busy.current = true;
    try {
      const dir = what === 'pass' ? -1 : 1;
      Animated.timing(pos, { toValue: { x: dir * 520, y: 0 }, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
      if (what === 'pass') await api.pass(top.id);
      else {
        const r = await api.like(top.id, true);
        setToast(r.mutual ? { text: `It's mutual. You and ${top.displayName} like each other.`, tone: 'success' }
          : r.vip ? { text: `Liked. As a ${ms.tiers.vip.label} member you're at the top of ${top.displayName}'s list.`, tone: 'success' } : null);
      }
      setTimeout(next, 200);
    } catch (e: any) {
      pos.setValue({ x: 0, y: 0 });
      setToast({ text: e?.message ?? 'Something went wrong.', tone: 'warn' });
    } finally {
      setTimeout(() => { busy.current = false; }, 240);
    }
  }, [api, ms, next, pos, top]);

  // Arrow keys on the web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); act('pass'); }
      if (e.key === 'ArrowRight') { e.preventDefault(); act('like'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => pos.setValue({ x: g.dx, y: g.dy * 0.2 }),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_AT) actRef.current('like');
      else if (g.dx < -SWIPE_AT) actRef.current('pass');
      else Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: Platform.OS !== 'web' }).start();
    },
  })).current;
  const actRef = useRef(act);
  actRef.current = act;

  const rotate = pos.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-10deg', '0deg', '10deg'] });
  const likeOpacity = pos.x.interpolate({ inputRange: [0, SWIPE_AT], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pos.x.interpolate({ inputRange: [-SWIPE_AT, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const photos = top ? [top.mainPhoto, ...top.publicPhotos].filter(Boolean) : [];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ maxWidth: 520, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexShrink: 1 }}>
            <H size={30}>Discover</H>
            <Txt sub size={14}>Active, new and good-fit people, all in one stack.</Txt>
          </View>
          {priority ? <Badge label={`★ ${ms.tiers.vip.label}: your likes go first`} tone="alert" /> : null}
        </View>

        {toast ? <Notice tone={toast.tone} icon={toast.tone === 'success' ? 'heart' : 'shield'}>{toast.text}</Notice> : null}
        {ms.paywallEnabled && !priority ? (
          <Notice tone="info" icon="star">{`${ms.tiers.vip.label} members' likes go to the top of the list, and anyone can read and answer their messages.`}</Notice>
        ) : null}

        {!deck ? <Loading /> : !top ? (
          <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 40 }}>
            <Icon name="users" size={30} color={t.sub} />
            <Txt bold>You're all caught up</Txt>
            <Txt sub center>New people join every day. Check back soon, or widen your age range in your profile.</Txt>
            <Btn size="sm" kind="secondary" label="Browse everyone" onPress={() => router.push('/browse')} />
          </Card>
        ) : (
          <>
            <View style={{ height: 520 }}>
              {deck[1] ? (
                <View style={{ position: 'absolute', inset: 0, transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.7 } as any}>
                  <PhotoTile photo={deck[1].mainPhoto} radius={24} style={{ flex: 1 }} />
                </View>
              ) : null}
              <Animated.View {...pan.panHandlers} style={{ position: 'absolute', inset: 0, transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }], borderRadius: 24, overflow: 'hidden', backgroundColor: t.surface, shadowColor: '#1E2629', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } } as any}>
                <Pressable style={{ flex: 1 }} accessibilityLabel={`Next photo of ${top.displayName}`} onPress={() => setPhoto((i) => (photos.length ? (i + 1) % photos.length : 0))}>
                  <PhotoTile photo={photos[photo]} radius={0} style={{ flex: 1 }} silhouette="70%">
                    {photos.length > 1 ? (
                      <View style={{ position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4 }}>
                        {photos.map((_, i) => <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i === photo ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }} />)}
                      </View>
                    ) : null}
                    <View style={{ position: 'absolute', top: 22, left: 12, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {top.vipLikedMe ? <Badge label="★ VIP liked you" tone="alert" /> : null}
                      {top.isNew ? <Badge label="New" tone="accent" /> : null}
                      {top.online ? <Badge label="Online" tone="online" /> : null}
                    </View>
                    <Animated.View style={{ position: 'absolute', top: 60, left: 20, opacity: likeOpacity, borderWidth: 3, borderColor: '#2F8F5B', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '-12deg' }] }}>
                      <Txt bold size={22} color="#2F8F5B">LIKE</Txt>
                    </Animated.View>
                    <Animated.View style={{ position: 'absolute', top: 60, right: 20, opacity: passOpacity, borderWidth: 3, borderColor: '#9A4A2E', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '12deg' }] }}>
                      <Txt bold size={22} color="#9A4A2E">PASS</Txt>
                    </Animated.View>
                  </PhotoTile>
                </Pressable>
                <Pressable onPress={() => router.push(`/member/${top.id}`)} accessibilityLabel={`Open ${top.displayName}'s full profile`} style={{ padding: 16, gap: 6, backgroundColor: t.surface }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <Txt bold size={22}>{top.displayName}, {top.age}</Txt>
                    <Txt sub size={14}>{top.city}{top.miles !== null ? ` · ${top.miles} mi` : ''}</Txt>
                  </View>
                  {top.facts.length ? <Txt size={14} color={t.accent} bold numberOfLines={1}>{top.facts.join(' · ')}</Txt> : null}
                  <Txt size={15} numberOfLines={3}>{top.summary}</Txt>
                  {top.interests.length ? (
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {top.interests.map((i) => <View key={i} style={{ backgroundColor: t.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Txt size={13} color={t.accent}>{i}</Txt></View>)}
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 22, marginTop: 4 }}>
              <RoundBtn icon="x" label={`Pass on ${top.displayName}`} color="#9A4A2E" size={64} onPress={() => act('pass')} />
              <RoundBtn icon="heart" label={`Like ${top.displayName}`} color="#FFFFFF" bg={t.alert} size={64} onPress={() => act('like')} />
            </View>
            {Platform.OS === 'web' ? <Txt sub center size={13}>Keyboard: ← pass · → like. Tap the photo for more.</Txt> : <Txt sub center size={13}>Swipe right to like, left to pass. Tap the photo for more.</Txt>}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function RoundBtn({ icon, label, color, bg = '#FFFFFF', size, onPress }: { icon: IconName; label: string; color: string; bg?: string; size: number; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable role="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: 1.5, borderColor: bg === '#FFFFFF' ? t.line : bg, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }], shadowColor: '#1E2629', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } })}>
      <Icon name={icon} size={size * 0.42} color={color} stroke={2.4} />
    </Pressable>
  );
}
