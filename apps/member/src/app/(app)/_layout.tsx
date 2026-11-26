// Signed-in chrome: top nav on wide screens (like the mockup's web header), bottom tabs on phones.
import { Link, Redirect, Slot, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../lib/session';
import { Avatar, fonts, Icon, Logo, useTheme, useWide, type IconName } from '../../ui/kit';

const TABS: { href: Href; match: string; label: string; icon: IconName }[] = [
  { href: '/browse', match: '/browse', label: 'Browse', icon: 'search' },
  { href: '/activity', match: '/activity', label: 'Activity', icon: 'heart' },
  { href: '/messages', match: '/messages', label: 'Messages', icon: 'chat' },
  { href: '/me', match: '/me', label: 'Me', icon: 'user' },
];

export default function AppLayout() {
  const { signedIn, me, unread, refreshUnread } = useSession();
  const t = useTheme();
  const wide = useWide(760);
  const path = usePathname();
  const insets = useSafeAreaInsets();
  useEffect(() => { refreshUnread(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!signedIn || !me) return <Redirect href="/join" />;
  if (!me.member.profileComplete) return <Redirect href="/onboarding" />;
  const main = me.photos.find((p) => p.kind === 'main');

  const tabLabel = (label: string, on: boolean, size: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontFamily: fonts(t).body, fontWeight: on ? '700' : '600', fontSize: size, color: on ? t.accent : wide ? '#2E3A37' : '#5B6663' }}>{label}</Text>
    </View>
  );
  const unreadBadge = unread > 0 ? (
    <View style={{ backgroundColor: t.alert, borderRadius: 999, paddingHorizontal: 7, minWidth: 18, alignItems: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{unread}</Text>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      {wide ? (
        <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.line }}>
          <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 24 }}>
            <Logo />
            <View role="navigation" style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
              {TABS.slice(0, 3).map((tab) => {
                const on = path.startsWith(tab.match);
                return (
                  <Link key={tab.label} href={tab.href} asChild>
                    <Pressable aria-current={on ? 'page' : undefined} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: on ? t.accentSoft : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {tabLabel(tab.label, on, 15)}
                      {tab.label === 'Messages' ? unreadBadge : null}
                    </Pressable>
                  </Link>
                );
              })}
            </View>
            <Link href="/me" asChild>
              <Pressable accessibilityLabel="My profile"><Avatar photo={main} size={44} /></Pressable>
            </Link>
          </View>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      {!wide ? (
        <View role="navigation" style={{ flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, paddingBottom: Math.max(insets.bottom, 10), paddingTop: 8 }}>
          {TABS.map((tab) => {
            const on = path.startsWith(tab.match);
            return (
              <Link key={tab.label} href={tab.href} asChild>
                <Pressable aria-current={on ? 'page' : undefined} style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: 48, justifyContent: 'center' }}>
                  <View>
                    <Icon name={tab.icon} size={24} color={on ? t.accent : '#5B6663'} />
                    {tab.label === 'Messages' && unread > 0 ? <View style={{ position: 'absolute', top: -4, right: -10 }}>{unreadBadge}</View> : null}
                  </View>
                  {tabLabel(tab.label, on, 12)}
                </Pressable>
              </Link>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
