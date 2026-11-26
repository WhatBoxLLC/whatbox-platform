import { ApiError, type ConversationView } from '@whatbox/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSession } from '../../../lib/session';
import { Avatar, Btn, clockTime, ErrorText, fonts, Icon, Loading, Notice, Txt, useTheme } from '../../../ui/kit';

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, refreshUnread } = useSession();
  const t = useTheme();
  const [c, setC] = useState<ConversationView | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const scroll = useRef<any>(null);

  const load = useCallback(async () => {
    try { setC(await api.conversation(id)); refreshUnread(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load.'); }
  }, [api, id, refreshUnread]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 30); }, [c?.messages.length]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true); setError(null);
    try { setC(await api.send(id, body)); setBody(''); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not send.'); }
    finally { setBusy(false); }
  }

  if (!c) return error ? <View style={{ padding: 20 }}><Notice tone="error">{error}</Notice></View> : <Loading />;
  const other = c.other;
  const meetingTalk = c.messages.some((m) => /coffee|meet|dinner|drink|weekend/i.test(m.body));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, maxWidth: 760, width: '100%', alignSelf: 'center', backgroundColor: t.ground }}>
        <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.line, paddingVertical: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable accessibilityLabel="Back to messages" onPress={() => router.replace('/messages')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" size={24} color={t.ink} />
          </Pressable>
          <Pressable onPress={() => router.push(`/member/${other.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar photo={other.mainPhoto} size={42} />
            <View>
              <Txt bold size={17}>{other.displayName}, {other.age}</Txt>
              <Txt size={13} color={other.online ? '#2F7A52' : t.sub}>{other.online ? 'Online now' : other.city}</Txt>
            </View>
          </Pressable>
          <Pressable accessibilityLabel="Safety options" onPress={() => setMenu(!menu)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="dots" color={t.sub} />
          </Pressable>
        </View>
        {menu ? (
          <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.line, padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap' }}>
            <Btn size="sm" kind="secondary" label="View profile" onPress={() => router.push(`/member/${other.id}`)} />
            {!c.contactShared.me ? <Btn size="sm" kind="secondary" label="Share my contact info" onPress={async () => setC(await api.shareContact(other.id))} /> : null}
            <Btn size="sm" kind="danger" label="Block" onPress={async () => { await api.block(other.id, true); router.replace('/messages'); }} />
          </View>
        ) : null}

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {c.messages.map((m) => (
            <View key={m.id} style={{ alignSelf: m.fromMe ? 'flex-end' : 'flex-start', maxWidth: '78%', gap: 4 }}>
              <View style={{
                backgroundColor: m.fromMe ? (m.held ? '#8FA9A5' : t.accent) : m.sealed ? t.ground : t.surface, borderWidth: m.fromMe ? 0 : m.fromVip ? 2 : 1, borderColor: m.fromVip ? '#D9A43A' : t.line,
                borderStyle: m.sealed ? 'dashed' : 'solid',
                borderRadius: 18, borderBottomRightRadius: m.fromMe ? 6 : 18, borderBottomLeftRadius: m.fromMe ? 18 : 6, paddingHorizontal: 14, paddingVertical: 10,
              }}>
                {m.fromVip ? <Txt size={11} bold color="#A8740F">★ VIP MEMBER</Txt> : null}
                <Txt size={15} color={m.fromMe ? '#FFFFFF' : m.sealed ? t.sub : t.ink}>{m.sealed ? '🔒 ' : ''}{m.body}</Txt>
              </View>
              {m.notice ? <Txt size={12} sub style={{ textAlign: m.fromMe ? 'right' : 'left' }}>{m.notice}</Txt> : null}
              <Txt size={11} sub style={{ textAlign: m.fromMe ? 'right' : 'left' }}>{m.fromMe && m.readAt ? `Read ${clockTime(m.readAt)}` : clockTime(m.at)}</Txt>
            </View>
          ))}
          {meetingTalk ? (
            <View style={{ marginTop: 6 }}>
              <Notice tone="warn" title="Meeting up? Stay safe.">Meet somewhere public and tell a friend. Never send money to someone you met here.</Notice>
            </View>
          ) : null}
          {c.contactShared.them && !c.contactShared.me ? (
            <Notice title={`${other.displayName} is ready to share contact info`}>
              <Btn size="sm" kind="soft" label="Share mine too" style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={async () => setC(await api.shareContact(other.id))} />
            </Notice>
          ) : null}
        </ScrollView>

        <View style={{ backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 14, gap: 8 }}>
          {c.lockReason ? (
            <View style={{ gap: 8 }}>
              <Notice tone="warn" icon="lock">{c.lockReason}</Notice>
              <Btn size="sm" label="See membership levels" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/me?tab=settings')} />
            </View>
          ) : (
            <>
              <Txt sub size={12}>
                {c.contactShared.me && c.contactShared.them ? 'You both shared contact info, so numbers and emails now show.' : 'Phone numbers, emails and links are hidden until you both opt in.'}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <TextInput
                  value={body} onChangeText={setBody} placeholder="Write a message" placeholderTextColor="#8C948F" multiline accessibilityLabel="Message"
                  onKeyPress={(e: any) => { if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault(); send(); } }}
                  style={[{ flex: 1, fontFamily: fonts(t).body, fontSize: 16, color: t.ink, minHeight: 46, maxHeight: 120, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 23, borderWidth: 1.5, borderColor: '#CFC7BB' }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
                />
                <Pressable accessibilityLabel="Send" disabled={busy} onPress={send} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
                  <Icon name="send" size={20} color="#FFFFFF" stroke={2.2} />
                </Pressable>
              </View>
              <ErrorText error={error} />
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
