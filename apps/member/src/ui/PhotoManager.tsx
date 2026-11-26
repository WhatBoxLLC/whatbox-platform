// Main photo + up to 6 public + up to 6 private, with the site's explicit-photo rules.
import { ApiError, TONES, type MyProfile, type PhotoKind, type PhotoRating, type PhotoView } from '@whatbox/core';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSession } from '../lib/session';
import { Badge, Btn, Chip, ErrorText, H, Icon, PhotoTile, Txt, useTheme } from './kit';

export function PhotoManager({ only }: { only?: PhotoKind[] }) {
  const { api, me, setMe, site } = useSession();
  const t = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const photos = me.photos;
  const main = photos.find((p) => p.kind === 'main');
  const pub = photos.filter((p) => p.kind === 'public');
  const priv = photos.filter((p) => p.kind === 'private');
  const sel = photos.find((p) => p.id === selected);

  async function run(fn: () => Promise<MyProfile>) {
    setBusy(true); setError(null);
    try { setMe(await fn()); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save that photo.'); }
    finally { setBusy(false); }
  }

  async function add(kind: PhotoKind, source: 'device' | 'sample') {
    if (source === 'sample') {
      const tone = TONES[Math.floor(Math.random() * TONES.length)];
      return run(() => api.addPhoto({ kind, tone }));
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const url = a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
    return run(() => api.addPhoto({ kind, url }));
  }

  const slot = (p: PhotoView | undefined, kind: PhotoKind, i: number) => {
    if (!p) {
      return (
        <View key={kind + i} style={{ width: '31%', aspectRatio: 1, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CFC7BB', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 6 }}>
          <Pressable accessibilityLabel={`Add ${kind} photo from your device`} onPress={() => add(kind, 'device')} style={{ alignItems: 'center', gap: 2 }}>
            <Icon name="plus" color={t.accent} />
            <Txt size={12} bold color={t.accent}>Upload</Txt>
          </Pressable>
          <Pressable accessibilityLabel={`Add a sample ${kind} photo`} onPress={() => add(kind, 'sample')}>
            <Txt size={11} sub>or use a sample</Txt>
          </Pressable>
        </View>
      );
    }
    const on = selected === p.id;
    return (
      <Pressable key={p.id} accessibilityLabel={`${kind} photo ${i + 1}`} onPress={() => setSelected(on ? null : p.id)} style={{ width: '31%', aspectRatio: 1 }}>
        <PhotoTile photo={p} style={{ flex: 1, borderWidth: on ? 3 : 0, borderColor: t.accent }}>
          <View style={{ position: 'absolute', top: 6, left: 6, gap: 4 }}>
            {p.status === 'pending' ? <Badge label="In review" tone="dark" /> : null}
            {p.status === 'rejected' ? <Badge label="Not approved" tone="alert" /> : null}
            {p.rating !== 'safe' ? <Badge label={p.rating === 'explicit' ? 'Explicit' : 'Suggestive'} tone="dark" /> : null}
          </View>
        </PhotoTile>
      </Pressable>
    );
  };

  const section = (title: string, kind: PhotoKind, list: PhotoView[], note: string) => (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <H size={17} level={3}>{title}</H>
        <Txt sub size={14}>{list.length} of {me.limits[kind]}</Txt>
      </View>
      <Txt sub size={13}>{note}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '3.5%' as any, rowGap: 10 }}>
        {Array.from({ length: me.limits[kind] }).map((_, i) => slot(list[i], kind, i))}
      </View>
    </View>
  );

  const show = (k: PhotoKind) => !only || only.includes(k);

  return (
    <View style={{ gap: 22 }}>
      {show('main') ? (
        <View style={{ gap: 10 }}>
          <H size={17} level={3}>Main photo</H>
          <Txt sub size={13}>Shown on your card in search. A clear photo of your face gets the most replies.</Txt>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {main ? (
              <Pressable accessibilityLabel="Main photo" onPress={() => setSelected(selected === main.id ? null : main.id)} style={{ width: 120, height: 140 }}>
                <PhotoTile photo={main} radius={16} style={{ flex: 1, borderWidth: selected === main.id ? 3 : 0, borderColor: t.accent }}>
                  {main.status === 'pending' ? <View style={{ position: 'absolute', top: 6, left: 6 }}><Badge label="In review" tone="dark" /></View> : null}
                </PhotoTile>
              </Pressable>
            ) : (
              <View style={{ width: 120, height: 140, borderRadius: 16, backgroundColor: '#EFEAE2' }} />
            )}
            <View style={{ gap: 8, flex: 1 }}>
              <Btn label={main ? 'Replace from device' : 'Upload from device'} icon="image" size="sm" onPress={() => add('main', 'device')} busy={busy} />
              <Btn label="Use a sample photo" kind="secondary" size="sm" onPress={() => add('main', 'sample')} />
            </View>
          </View>
        </View>
      ) : null}
      {show('public') ? section('Public photos', 'public', pub, 'Any signed-in member can see these.') : null}
      {show('private') ? section('Private photos', 'private', priv, `Members have to ask. You approve each request and can revoke it any time.${site.explicitPhotosAllowed ? ' Explicit photos are allowed here, shown on the website only.' : ''}`) : null}

      {sel ? (
        <View style={{ backgroundColor: t.accentSoft, borderRadius: 14, padding: 14, gap: 12 }}>
          <Txt bold size={14}>Selected {sel.kind} photo</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {sel.kind !== 'main' ? <Btn size="sm" kind="secondary" label="Make main" onPress={() => run(() => api.updatePhoto(sel.id, { kind: 'main', rating: 'safe' }))} /> : null}
            {sel.kind !== 'public' ? <Btn size="sm" kind="secondary" label="Move to public" onPress={() => run(() => api.updatePhoto(sel.id, { kind: 'public', rating: sel.rating === 'explicit' ? 'suggestive' : sel.rating }))} /> : null}
            {sel.kind !== 'private' ? <Btn size="sm" kind="secondary" label="Move to private" onPress={() => run(() => api.updatePhoto(sel.id, { kind: 'private' }))} /> : null}
            <Btn size="sm" kind="danger" label="Delete" onPress={() => { setSelected(null); run(() => api.deletePhoto(sel.id)); }} />
          </View>
          {sel.kind === 'private' ? (
            <View style={{ gap: 6 }}>
              <Txt size={13} bold>Content rating</Txt>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(['safe', 'suggestive', 'explicit'] as PhotoRating[]).map((r) => (
                  <Chip key={r} label={r[0].toUpperCase() + r.slice(1)} selected={sel.rating === r} onPress={() => run(() => api.updatePhoto(sel.id, { rating: r }))} />
                ))}
              </View>
              {!site.explicitPhotosAllowed ? <Txt sub size={12}>{site.name} does not allow explicit photos.</Txt> : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <ErrorText error={error} />
      {Platform.OS !== 'web' && site.explicitPhotosAllowed ? (
        <Txt sub size={12}>Explicit photos never appear in the app. Members see them on the website.</Txt>
      ) : null}
    </View>
  );
}
