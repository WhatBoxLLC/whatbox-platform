import { GENDERS, type MemberCard, type SearchFilters, type SearchResult } from '@whatbox/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSession } from '../../lib/session';
import {
  Badge, Btn, Card, Check, ChipPicker, Field, Grid, H, Icon, Loading, PhotoTile, Txt, useTheme, useWide,
} from '../../ui/kit';

const DIST: { label: string; value: number | null }[] = [
  { label: '10 mi', value: 10 }, { label: '25 mi', value: 25 }, { label: '50 mi', value: 50 }, { label: '100 mi', value: 100 }, { label: 'Anywhere', value: null },
];
const SORTS: { label: string; value: NonNullable<SearchFilters['sort']> }[] = [
  { label: 'Best match', value: 'best' }, { label: 'Recently active', value: 'recent' }, { label: 'Newest', value: 'newest' }, { label: 'Closest', value: 'closest' },
];

export default function Browse() {
  const { api, me, site } = useSession();
  const t = useTheme();
  const wide = useWide(980);
  const [filters, setFilters] = useState<SearchFilters>(() => ({
    seeking: me!.member.seeking, ageMin: me!.member.ageMin, ageMax: me!.member.ageMax, withinMiles: 50, withPhoto: true, sort: 'best', page: 1, pageSize: 12, fields: {},
  }));
  const [draft, setDraft] = useState(filters);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async (f: SearchFilters) => {
    setRes(null);
    setRes(await api.search(f));
  }, [api]);
  useEffect(() => { load(filters); }, [filters, load]);

  const apply = () => { setFilters({ ...draft, page: 1 }); setShowFilters(false); };
  const filterable = site.fields.filter((f) => f.filterable && (f.type === 'select' || f.type === 'multiselect'));

  const panel = (
    <Card style={{ gap: 18 }}>
      <H size={18} level={2}>Filters</H>
      <ChipPicker label="Looking for" multi options={GENDERS.map((g) => g.plural)} value={(draft.seeking ?? []).map((v) => GENDERS.find((g) => g.value === v)!.plural)}
        onChange={(ls: string[]) => { if (ls.length) setDraft({ ...draft, seeking: ls.map((l) => GENDERS.find((g) => g.plural === l)!.value) }); }} />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="Age from" keyboardType="number-pad" value={String(draft.ageMin ?? '')} onChangeText={(v) => setDraft({ ...draft, ageMin: Number(v) || 18 })} /></View>
        <View style={{ flex: 1 }}><Field label="to" keyboardType="number-pad" value={String(draft.ageMax ?? '')} onChangeText={(v) => setDraft({ ...draft, ageMax: Number(v) || 99 })} /></View>
      </View>
      <ChipPicker label={`Within, of ${me!.member.postal}`} options={DIST.map((d) => d.label)} value={DIST.find((d) => d.value === draft.withinMiles)?.label} onChange={(l: string) => setDraft({ ...draft, withinMiles: DIST.find((d) => d.label === l)!.value })} />
      {filterable.map((f) => (
        <ChipPicker key={f.key} multi label={f.label} options={f.options ?? []} value={draft.fields?.[f.key] ?? []}
          onChange={(v: string[]) => setDraft({ ...draft, fields: { ...draft.fields, [f.key]: v } })} />
      ))}
      <View style={{ gap: 4 }}>
        <Txt bold size={14}>Show only</Txt>
        <Check label="With a photo" value={!!draft.withPhoto} onChange={(v) => setDraft({ ...draft, withPhoto: v })} />
        <Check label="Online now" value={!!draft.onlineNow} onChange={(v) => setDraft({ ...draft, onlineNow: v })} />
      </View>
      <Btn label="Show results" onPress={apply} />
    </Card>
  );

  const pages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 28, flexDirection: wide ? 'row' : 'column', gap: 28, alignItems: 'flex-start' }}>
        {wide ? <View style={{ width: 290 }}>{panel}</View> : null}
        <View style={{ flex: 1, width: '100%', gap: 18 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <View>
              <H size={30}>People near you</H>
              {res ? <Txt sub size={14}>{res.total} {res.total === 1 ? 'person matches' : 'people match'} your filters</Txt> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', flexShrink: 1 }}>
              {!wide ? <Btn label={showFilters ? 'Hide filters' : 'Filters'} icon="sliders" kind="secondary" size="sm" onPress={() => setShowFilters(!showFilters)} /> : null}
              {SORTS.map((s) => (
                <Btn key={s.value} size="sm" label={s.label} kind={filters.sort === s.value ? 'soft' : 'secondary'} onPress={() => { setDraft({ ...draft, sort: s.value }); setFilters({ ...filters, sort: s.value, page: 1 }); }} />
              ))}
            </View>
          </View>
          {!wide && showFilters ? panel : null}
          {!res ? <Loading /> : res.people.length === 0 ? (
            <Card style={{ alignItems: 'center', gap: 8 }}>
              <Icon name="search" size={30} color={t.sub} />
              <Txt bold>No one matches yet</Txt>
              <Txt sub center>Try a wider distance or age range.</Txt>
            </Card>
          ) : (
            <Grid min={230}>
              {res.people.map((p) => <PersonCard key={p.id} p={p} width="100%" onLiked={(liked) => setRes({ ...res, people: res.people.map((x) => (x.id === p.id ? { ...x, likedByMe: liked } : x)) })} />)}
            </Grid>
          )}
          {res && pages > 1 ? (
            <View role="navigation" style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {Array.from({ length: Math.min(pages, 6) }).map((_, i) => (
                <Btn key={i} size="sm" label={String(i + 1)} kind={res.page === i + 1 ? 'primary' : 'secondary'} onPress={() => setFilters({ ...filters, page: i + 1 })} style={{ minWidth: 44 }} />
              ))}
              {res.page < pages ? <Btn size="sm" label="Next" kind="secondary" onPress={() => setFilters({ ...filters, page: res.page + 1 })} /> : null}
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function PersonCard({ p, width, onLiked }: { p: MemberCard; width: any; onLiked: (v: boolean) => void }) {
  const { api } = useSession();
  const t = useTheme();
  return (
    <View style={{ width, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 18, overflow: 'hidden' }}>
      <Pressable accessibilityLabel={`View ${p.displayName}'s profile`} onPress={() => router.push(`/member/${p.id}`)}>
        <PhotoTile photo={p.mainPhoto} radius={0} style={{ height: 230 }} silhouette="72%">
          <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 }}>
            {p.online ? <Badge label="Online" tone="online" /> : null}
            {p.isNew ? <Badge label="New" /> : null}
          </View>
          <View style={{ position: 'absolute', top: 12, right: 12 }}><Badge label={`${p.photoCount} photo${p.photoCount === 1 ? '' : 's'}`} tone="dark" /></View>
        </PhotoTile>
      </Pressable>
      <View style={{ padding: 14, paddingTop: 12, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Pressable onPress={() => router.push(`/member/${p.id}`)} style={{ flex: 1 }}>
            <Txt bold size={18}>{p.displayName}, {p.age}</Txt>
          </Pressable>
          <Pressable
            role="button" accessibilityLabel={p.likedByMe ? `Unlike ${p.displayName}` : `Like ${p.displayName}`}
            onPress={async () => { const r = await api.like(p.id, !p.likedByMe); onLiked(r.liked); }}
            style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: p.likedByMe ? t.alert : t.line, backgroundColor: p.likedByMe ? '#FBEAE5' : t.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="heart" size={20} color={t.alert} stroke={2.2} />
          </Pressable>
        </View>
        <Txt sub size={14}>{p.city}{p.miles !== null ? ` · ${p.miles} mi` : ''}</Txt>
        <Txt size={14} numberOfLines={1} style={{ marginTop: 2 }}>{p.headline}</Txt>
      </View>
    </View>
  );
}
