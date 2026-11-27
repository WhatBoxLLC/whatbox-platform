// Upgrading. In the preview, tiers switch instantly. Against a real API the member goes to the
// site's processor (PayPal first) and comes back here; the tier changes only when the processor's
// webhook confirms payment, so we refresh a few times after returning.
import type { Tier } from '@whatbox/core';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { IS_PREVIEW } from './backend';
import { useSession } from './session';

export function useBilling() {
  const { api, setMe, refreshMe } = useSession();

  // Poll briefly: the processor's webhook usually lands within a few seconds of approval.
  async function waitForTier(tier?: Tier) {
    for (let i = 0; i < 8; i++) {
      const p = await refreshMe();
      if (tier ? p?.member.tier === tier : p?.subscription?.status === 'active') return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  return {
    selfServe: IS_PREVIEW,
    async upgrade(tier: Tier): Promise<'done' | 'pending' | 'cancelled'> {
      if (IS_PREVIEW || tier === 'free') { setMe(await api.setTier(tier)); return 'done'; }
      const back = Platform.OS === 'web' ? window.location.origin + '/me?tab=settings&checkout=' : Linking.createURL('/me', { queryParams: { tab: 'settings' } }) + '&checkout=';
      const { checkoutUrl } = await api.checkout(tier, { returnUrl: back + 'done', cancelUrl: back + 'cancelled' });
      if (Platform.OS === 'web') { window.location.assign(checkoutUrl); return 'pending'; }
      const r = await WebBrowser.openAuthSessionAsync(checkoutUrl, back);
      if (r.type !== 'success' || r.url.endsWith('cancelled')) return 'cancelled';
      return (await waitForTier(tier)) ? 'done' : 'pending';
    },
    waitForTier,
    async cancel() { setMe(await api.cancelSubscription()); },
  };
}
