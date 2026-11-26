import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { IS_PREVIEW } from '../lib/backend';
import { AuthFrame } from '../ui/AuthFrame';
import { JoinForm } from '../ui/JoinForm';
import { Notice } from '../ui/kit';

export default function Join() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const signIn = mode === 'signin';
  return (
    <AuthFrame>
      <View style={{ gap: 24 }}>
        <JoinForm title={signIn ? 'Sign in' : 'Join free'} signIn={signIn} />
        {IS_PREVIEW ? <Notice tone="warn" title="Prototype tip">Use alex@example.com to sign in as the demo member, or any new email to try signup from scratch.</Notice> : null}
      </View>
    </AuthFrame>
  );
}
