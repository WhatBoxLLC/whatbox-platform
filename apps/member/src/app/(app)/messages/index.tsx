import type { ConversationSummary } from '@whatbox/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSession } from '../../../lib/session';
import { Avatar, Badge, Card, H, Icon, Loading, relTime, Txt, useTheme } from '../../../ui/kit';

export default function Messages() {
  const { api, onEvent } = useSession();
  const t = useTheme();
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  useEffect(() => { api.conversations().then(setList); }, [api]);
  useEffect(() => onEvent((ev) => { if (ev.type === 'message') api.conversations().then(setList); }), [api, onEvent]);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 16 }}>
        <H size={30}>Messages</H>
        {!list ? <Loading /> : list.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: 6 }}>
            <Icon name="chat" size={28} color={t.sub} />
            <Txt bold>No conversations yet</Txt>
            <Txt sub center>Say hello to someone from Browse.</Txt>
          </Card>
        ) : (
          <Card pad={0} style={{ overflow: 'hidden' }}>
            {list.map((c, i) => (
              <Pressable key={c.other.id} onPress={() => router.push(`/messages/${c.other.id}`)} accessibilityLabel={`Conversation with ${c.other.displayName}`}
                style={({ hovered }: any) => ({ flexDirection: 'row', gap: 14, padding: 16, alignItems: 'center', borderTopWidth: i ? 1 : 0, borderColor: t.line, backgroundColor: hovered ? '#FAF8F4' : t.surface })}>
                <View>
                  <Avatar photo={c.other.mainPhoto} size={52} />
                  {c.other.online ? <View style={{ position: 'absolute', right: 0, bottom: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#2F7A52', borderWidth: 2, borderColor: '#FFFFFF' }} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                      <Txt bold size={17}>{c.other.displayName}, {c.other.age}</Txt>
                      {c.fromVip ? <Badge label="★ VIP" tone="alert" /> : null}
                    </View>
                    <Txt sub size={13}>{relTime(c.last.at)}</Txt>
                  </View>
                  <Txt sub={!c.unread} bold={!!c.unread} size={15} numberOfLines={1}>{c.last.sealed ? '🔒 ' : c.last.fromMe ? 'You: ' : ''}{c.last.body}</Txt>
                </View>
                {c.unread ? <View style={{ backgroundColor: t.alert, borderRadius: 999, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><Txt bold size={12} color="#FFFFFF">{c.unread}</Txt></View> : null}
              </Pressable>
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
