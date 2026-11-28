import { ApiError, type EventView, type RsvpStatus } from '@whatbox/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { dateBlock, eventPlace, eventWhen } from '../../../lib/events';
import { useSession } from '../../../lib/session';
import { Avatar, Badge, Btn, Card, ErrorText, H, Icon, Loading, Notice, Txt, useTheme, useWide } from '../../../ui/kit';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, me } = useSession();
  const t = useTheme();
  const wide = useWide(900);
  const [e, setE] = useState<EventView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setE(await api.event(id)); } catch (x) { setError(x instanceof ApiError ? x.message : 'Could not load.'); }
  }, [api, id]);
  useEffect(() => { load(); }, [load]);
  if (!e) return error ? <View style={{ padding: 24 }}><Notice tone="error">{error}</Notice></View> : <Loading />;

  const set = async (s: RsvpStatus | null) => {
    setBusy(true); setError(null);
    try { setE(await api.rsvp(e.id, s)); } catch (x) { setError(x instanceof ApiError ? x.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const d = dateBlock(e);
  const cancelled = e.status === 'cancelled';
  const open = !cancelled && !e.past;
  const showing = !!me?.member.showEvents;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 56 }}>
      <View style={{ maxWidth: 1000, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, gap: 18 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}>
          <Icon name="back" size={18} color={t.accent} stroke={2.2} />
          <Txt bold size={15} color={t.accent}>All events</Txt>
        </Pressable>
        {cancelled ? <Notice tone="error" icon="calendar" title="This event was cancelled">The organizers cancelled it.</Notice> : null}
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 28, alignItems: 'flex-start' }}>
          <View style={{ flex: 3, width: '100%', gap: 16 }}>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              <View style={{ width: 72, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: t.accentSoft }}>
                <Txt bold size={13} color={t.accent}>{d.month}</Txt>
                <Txt bold size={30} color={t.accent}>{d.day}</Txt>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {e.featured && !cancelled ? <Badge label="Featured" /> : null}
                <H size={32}>{e.title}</H>
              </View>
            </View>
            <Card style={{ gap: 12 }}>
              <Row icon="calendar" text={eventWhen(e)} />
              <Row icon={e.online ? 'globe' : 'pin'} text={eventPlace(e)} />
              {e.address && !e.online ? <Row icon="pin" text={e.address} sub /> : null}
              {e.addressHidden && !e.online ? <Row icon="lock" text="The street address shows once you say you're going." sub /> : null}
              <Row icon="card" text={e.price} />
              {e.link ? (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(e.link!)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Icon name="next" size={18} color={t.accent} />
                  <Txt bold color={t.accent}>Tickets and more info</Txt>
                </Pressable>
              ) : null}
            </Card>
            {e.summary ? <Txt size={17} bold>{e.summary}</Txt> : null}
            {e.details.split(/\n\s*\n/).filter(Boolean).map((p, i) => <Txt key={i}>{p}</Txt>)}
          </View>

          <View style={{ flex: 2, width: '100%', gap: 16 }}>
            <Card style={{ gap: 12 }}>
              <H size={18} level={2}>{e.past ? 'This event has passed' : 'Are you going?'}</H>
              {open ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Btn flex label={e.myRsvp === 'going' ? "I'm going ✓" : "I'm going"} kind={e.myRsvp === 'going' ? 'primary' : 'secondary'} busy={busy} onPress={() => set(e.myRsvp === 'going' ? null : 'going')} />
                  <Btn flex label={e.myRsvp === 'interested' ? 'Interested ✓' : 'Interested'} kind={e.myRsvp === 'interested' ? 'primary' : 'secondary'} busy={busy} onPress={() => set(e.myRsvp === 'interested' ? null : 'interested')} />
                </View>
              ) : null}
              <Txt sub size={14}>{e.past ? `${e.goingCount} went.` : `${e.goingCount} going${e.interestedCount ? `, ${e.interestedCount} interested` : ''}.`}</Txt>
              {open ? (
                <Txt sub size={13}>
                  {showing ? 'Your events show on your profile, and you appear in the list below when you say you are going.' : 'Other members only see a count. To show your events on your profile and be listed here, turn it on in Me → Profile.'}
                </Txt>
              ) : null}
              <ErrorText error={error} />
            </Card>
            {e.attendees.length ? (
              <Card style={{ gap: 12 }}>
                <H size={16} level={2}>{e.past ? 'Members who went' : 'Members going'}</H>
                {e.attendees.map((a) => (
                  <Pressable key={a.id} accessibilityRole="link" onPress={() => router.push(`/member/${a.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar photo={a.mainPhoto} size={36} />
                    <Txt bold>{a.displayName}</Txt>
                  </Pressable>
                ))}
                {e.goingCount > e.attendees.length + (e.myRsvp === 'going' ? 1 : 0) ? <Txt sub size={13}>Some members keep their events private.</Txt> : null}
              </Card>
            ) : null}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Row({ icon, text, sub }: { icon: 'calendar' | 'pin' | 'globe' | 'card' | 'lock'; text: string; sub?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Icon name={icon} size={18} color={t.sub} />
      <Txt sub={sub} style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}
