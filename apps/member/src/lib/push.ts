// Push notifications on the phone apps (never on the web). Asks once, after sign-up is complete.
import type { MemberApi } from '@whatbox/core';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { IS_PREVIEW } from './backend';

let listening = false;

export async function registerForPush(api: MemberApi) {
  if (Platform.OS === 'web' || IS_PREVIEW) return;
  const Notifications = await import('expo-notifications');
  const Device = await import('expo-device');
  if (!Device.isDevice) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Activity', importance: Notifications.AndroidImportance.DEFAULT });
  }
  // Tapping a notification opens the matching screen (messages, activity, photos).
  if (!listening) {
    listening = true;
    Notifications.addNotificationResponseReceivedListener((r) => {
      const url = r.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api.registerPush(data, Platform.OS as 'ios' | 'android');
}
