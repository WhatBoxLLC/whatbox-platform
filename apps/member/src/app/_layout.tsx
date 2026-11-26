import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { PrototypeBar } from '../ui/PrototypeBar';

function WebHead() {
  const { site } = useSession();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = site.name;
    const id = 'site-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (site.theme.fontsHref) link.href = site.theme.fontsHref;
    document.body.style.backgroundColor = site.theme.ground;
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = 'noindex'; // the member app is never indexed; SEO pages come from apps/web
  }, [site]);
  return null;
}

function Shell() {
  const { site } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: site.theme.ground }}>
      <WebHead />
      <PrototypeBar />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: site.theme.ground } }} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F3EE' }}><ActivityIndicator color="#22655F" size="large" /></View>}>
        <Shell />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
