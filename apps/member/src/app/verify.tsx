import { ApiError } from '@whatbox/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSession } from '../lib/session';
import { AuthFrame } from '../ui/AuthFrame';
import { Btn, ErrorText, Eyebrow, fonts, H, Notice, Txt, useTheme } from '../ui/kit';

export default function Verify() {
  const params = useLocalSearchParams<{ challengeId: string; sentTo: string; channel: string; devCode?: string }>();
  const { api, signIn } = useSession();
  const t = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(params.challengeId);
  const [devCode, setDevCode] = useState(params.devCode);
  const [wait, setWait] = useState(45);
  const input = useRef<any>(null);

  useEffect(() => {
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  async function submit(value = code) {
    if (value.length !== 6) { setError('Enter all 6 digits.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.verify(challenge!, value);
      const me = await signIn(r.token);
      router.replace(me?.member.profileComplete ? '/discover' : '/onboarding');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
      setCode('');
    } finally { setBusy(false); }
  }

  if (!params.challengeId) {
    return <AuthFrame><Txt>Start from the join page.</Txt></AuthFrame>;
  }

  return (
    <AuthFrame step={1}>
      <View style={{ gap: 10 }}>
        <Eyebrow>Step 1 of 4</Eyebrow>
        <H size={32}>Enter your code</H>
        <Txt sub>We sent a 6-digit code to <Txt bold>{params.sentTo}</Txt>. It expires in 10 minutes.</Txt>
      </View>
      {devCode ? (
        <View style={{ marginTop: 18 }}>
          <Notice tone="warn" title="Prototype: nothing was really sent">{`Your code is ${devCode}. In the real build it arrives by ${params.channel === 'phone' ? 'text message' : 'email'} through Azure Communication Services.`}</Notice>
        </View>
      ) : null}
      <Pressable onPress={() => input.current?.focus()} style={{ marginTop: 24 }} accessibilityLabel="Verification code">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ flex: 1, height: 60, borderRadius: 12, borderWidth: 2, borderColor: i < code.length || i === code.length ? t.accent : '#CFC7BB', backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Txt bold size={26}>{code[i] ?? ''}</Txt>
            </View>
          ))}
        </View>
        <TextInput
          ref={input}
          value={code}
          autoFocus
          onChangeText={(v) => {
            const d = v.replace(/\D/g, '').slice(0, 6);
            setCode(d);
            if (d.length === 6) submit(d);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          accessibilityLabel="Verification code"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, opacity: 0.01, fontFamily: fonts(t).body } as any}
        />
      </Pressable>
      <ErrorText error={error} />
      <View style={{ marginTop: 20, gap: 8 }}>
        <Txt sub size={15}>
          Didn't get it?{' '}
          {wait > 0 ? <Txt size={15} sub>Resend in 0:{String(wait).padStart(2, '0')}</Txt> : null}
        </Txt>
        {wait === 0 ? (
          <Btn kind="ghost" size="sm" label="Resend code" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.back()} />
        ) : null}
      </View>
      <View style={{ flexGrow: 1, minHeight: 32 }} />
      <View style={{ gap: 18 }}>
        <Notice>Next you'll pick a display name. Use a nickname, not your full name. You can't browse until you're verified.</Notice>
        <Btn label="Verify and continue" size="lg" onPress={() => submit()} busy={busy} />
      </View>
    </AuthFrame>
  );
}
