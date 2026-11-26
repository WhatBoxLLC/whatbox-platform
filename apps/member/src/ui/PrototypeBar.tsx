// A thin strip shown only in the clickable preview: switch sites, jump to Owner Admin, reset demo data.
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { IS_PREVIEW, resetPreviewData } from '../lib/backend';
import { useSession } from '../lib/session';

const SITES = [
  { key: 'afterh', label: 'AfterH' },
  { key: 'hfriends', label: 'HFriends' },
  { key: 'datealittle', label: 'DateALittle' },
];

export function PrototypeBar() {
  const { siteKey, switchSite } = useSession();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  if (!IS_PREVIEW) return null;
  const inAdmin = path.startsWith('/admin');
  const item = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityLabel={label} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? '#FFFFFF' : 'transparent' }}>
      <Text style={{ color: on ? '#1E2629' : '#E8EDEA', fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ backgroundColor: '#1E2629', paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <Text style={{ color: '#F3C9A8', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginRight: 6 }}>PROTOTYPE · DEMO DATA</Text>
      {SITES.map((s) => item(s.label, !inAdmin && s.key === siteKey, async () => {
        if (s.key !== siteKey) await switchSite(s.key);
        router.replace('/');
      }))}
      <View style={{ width: 1, height: 18, backgroundColor: '#46524F', marginHorizontal: 4 }} />
      {item('Owner Admin', inAdmin, () => router.push('/admin'))}
      <View style={{ flexGrow: 1 }} />
      <Pressable disabled={busy} accessibilityLabel="Reset demo data" onPress={async () => {
        setBusy(true);
        await resetPreviewData();
        if (typeof window !== 'undefined' && window.location) {
          try { Object.keys(window.localStorage).filter((k) => k.startsWith('whatbox.')).forEach((k) => window.localStorage.removeItem(k)); } catch {}
          window.location.reload();
        }
      }} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ color: '#E8EDEA', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>Reset demo data</Text>
      </Pressable>
    </View>
  );
}
