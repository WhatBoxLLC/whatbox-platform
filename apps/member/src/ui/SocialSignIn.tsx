// "Continue with Apple / Google". Shown only when the site's client IDs are configured
// (EXPO_PUBLIC_OAUTH_JSON, e.g. {"afterh":{"googleWeb":"...","googleIos":"...","googleAndroid":"...","apple":true}}).
// The app gets an ID token from the provider; the API verifies it against that site's client IDs.
import { ApiError } from '@whatbox/core';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSession } from '../lib/session';
import { Btn, ErrorText, Txt, useTheme } from './kit';

WebBrowser.maybeCompleteAuthSession();

interface SiteOauth { googleWeb?: string; googleIos?: string; googleAndroid?: string; apple?: boolean }
function oauthFor(siteKey: string): SiteOauth {
  try { return (JSON.parse(process.env.EXPO_PUBLIC_OAUTH_JSON || '{}') as Record<string, SiteOauth>)[siteKey] ?? {}; } catch { return {}; }
}

export function SocialSignIn() {
  const { siteKey } = useSession();
  const cfg = oauthFor(siteKey);
  const google = Platform.select({ web: cfg.googleWeb, ios: cfg.googleIos, android: cfg.googleAndroid });
  const apple = cfg.apple && Platform.OS === 'ios';
  if (!google && !apple) return null;
  return <Buttons google={google ? cfg : null} apple={!!apple} />;
}

function Buttons({ google, apple }: { google: SiteOauth | null; apple: boolean }) {
  const { api, signIn } = useSession();
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    webClientId: google?.googleWeb, iosClientId: google?.googleIos, androidClientId: google?.googleAndroid,
  });

  async function finish(provider: 'apple' | 'google', idToken: string) {
    setBusy(true); setError(null);
    try {
      const r = await api.signInWithProvider(provider, idToken);
      const me = await signIn(r.token);
      router.replace(me?.member.profileComplete ? '/discover' : '/onboarding');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in did not finish. Try again.');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) finish('google', response.params.id_token);
    else if (response?.type === 'error') setError('Google sign-in did not finish. Try again.');
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
        <Txt sub size={13}>or</Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
      </View>
      {apple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={t.radius > 30 ? 24 : t.radius}
          style={{ height: 48 }}
          onPress={async () => {
            try {
              const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL] });
              if (cred.identityToken) await finish('apple', cred.identityToken);
            } catch (e: any) {
              if (e?.code !== 'ERR_REQUEST_CANCELED') setError('Apple sign-in did not finish. Try again.');
            }
          }}
        />
      ) : null}
      {google ? <Btn label="Continue with Google" kind="secondary" disabled={!request} busy={busy} onPress={() => prompt()} /> : null}
      <ErrorText error={error} />
    </View>
  );
}
