import { ApiError } from '@whatbox/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '../lib/session';
import { Btn, Check, ErrorText, Field, H, Icon, Segmented, Txt, useTheme } from './kit';

export function JoinForm({ title = 'Join free', signIn = false }: { title?: string; signIn?: boolean }) {
  const { api } = useSession();
  const t = useTheme();
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [target, setTarget] = useState('');
  const [agree, setAgree] = useState(signIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    if (!agree) { setError('Please confirm you are 18 or older and agree to the terms.'); return; }
    setBusy(true);
    try {
      const r = await api.startVerification(channel, target);
      router.push({ pathname: '/verify', params: { challengeId: r.challengeId, sentTo: r.sentTo, channel, devCode: r.devCode ?? '' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 4 }}>
        <H size={26} level={2}>{title}</H>
        <Txt sub size={15}>We send a 6-digit code to confirm it is really you.</Txt>
      </View>
      <Segmented options={[{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }]} value={channel} onChange={(v) => { setChannel(v); setError(null); }} />
      {channel === 'email' ? (
        <Field label="Email address" value={target} onChangeText={setTarget} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={send} />
      ) : (
        <Field label="Mobile number" value={target} onChangeText={setTarget} placeholder="(555) 555-0123" keyboardType="phone-pad" autoComplete="tel" onSubmitEditing={send} />
      )}
      {!signIn ? (
        <Check label="I am 18 or older and agree to the Terms and Privacy Policy." value={agree} onChange={setAgree} />
      ) : null}
      <ErrorText error={error} />
      <Btn label="Send my code" size="lg" onPress={send} busy={busy} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="lock" size={16} color={t.sub} />
        <Txt sub size={13}>Your email or number is never shown to other members.</Txt>
      </View>
    </View>
  );
}
