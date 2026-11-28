// Events the site runs: upcoming first (featured on top), or past ones. Members only.
import type { EventView } from '@whatbox/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { dateBlock, eventPlace, eventWhen } from '../../../lib/events';
import { useSession } from '../../../lib/session';
import { Avatar, Badge, Card, H, Loading, Notice, Segmented, Txt, useTheme, useWide } from '../../../ui/kit';

export default function Events() {
  const { api, site } = useSession();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [list, setList] = useState<EventView[] | null>(null);
  useEffect(() => { setList(null); api.events(when).then(setList).catch(() => setList([])); }, [api, when]);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={{ maxWidth: 900, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 18 }}>
        <View style={{ gap: 4 }}>
          <H size={30}>Events</H>
          <Txt sub>Gatherings run by {site.name}. Only members can see these.</Txt>
        </View>
        <Segmented value={when} onChange={setWhen} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
        {!list ? <Loading /> : list.length === 0 ? (
          <Notice tone="info" icon="calendar">{when === 'upcoming' ? 'Nothing planned yet. Check back soon.' : 'No past events yet.'}</Notice>
        ) : list.map((e) => <EventRow key={e.id} e={e} />)}
      </View>
    </ScrollView>
  );
}

function EventRow({ e }: { e: EventView }) {
  const t = useTheme();
  const wide = useWide(640);
  const d = dateBlock(e);
  const cancelled = e.status === 'cancelled';
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={e.title} onPress={() => router.push(`/events/${e.id}`)}>
      <Card pad={0} style={{ overflow: 'hidden', borderColor: e.featured && !cancelled ? t.accent : t.line, borderWidth: e.featured && !cancelled ? 2 : 1, opacity: cancelled ? 0.75 : 1 }}>
        <View style={{ flexDirection: 'row', gap: 16, padding: 18 }}>
          <View style={{ width: 62, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: t.accentSoft, alignSelf: 'flex-start' }}>
            <Txt bold size={12} color={t.accent}>{d.month}</Txt>
            <Txt bold size={24} color={t.accent}>{d.day}</Txt>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {cancelled ? <Badge label="Cancelled" tone="alert" /> : null}
              {e.featured && !cancelled ? <Badge label="Featured" /> : null}
              {e.myRsvp === 'going' ? <Badge label="You're going" tone="online" /> : e.myRsvp === 'interested' ? <Badge label="Interested" /> : null}
            </View>
            <H size={19} level={2}>{e.title}</H>
            <Txt sub size={14}>{eventWhen(e)}</Txt>
            <Txt sub size={14}>{eventPlace(e)} · {e.price}</Txt>
            {e.summary && wide ? <Txt size={15} style={{ marginTop: 4 }}>{e.summary}</Txt> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <View style={{ flexDirection: 'row' }}>
                {e.attendees.slice(0, 5).map((a, i) => <View key={a.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 16, borderWidth: 2, borderColor: t.surface }}><Avatar photo={a.mainPhoto} size={28} /></View>)}
              </View>
              <Txt sub size={13}>{e.past ? `${e.goingCount} went` : `${e.goingCount} going${e.interestedCount ? ` · ${e.interestedCount} interested` : ''}`}</Txt>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
