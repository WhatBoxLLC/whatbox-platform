import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon, Logo, useTheme } from './kit';

export function AuthFrame({ children, step, back = true }: { children: ReactNode; step?: number; back?: boolean }) {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: 460, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40, flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
          {back ? (
            <Pressable accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="back" size={24} color={t.ink} />
            </Pressable>
          ) : <View style={{ width: 44 }} />}
          <Logo size={26} />
          <View style={{ width: 44 }} />
        </View>
        {step ? (
          <View role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={4} style={{ flexDirection: 'row', gap: 6, marginTop: 16, marginBottom: 32 }}>
            {[1, 2, 3, 4].map((i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 9, backgroundColor: i <= step ? t.accent : '#DCD5CA' }} />)}
          </View>
        ) : <View style={{ height: 24 }} />}
        {children}
      </View>
    </ScrollView>
  );
}
