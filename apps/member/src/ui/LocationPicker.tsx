// Where a member lives: country, then a postal code (US, Canada), a city search, or "use my location".
// Whatever they pick resolves to a town, so only the town's coordinates are ever stored.
import { ApiError, type GeoCountry, type GeoPlace, type LocationInput } from '@whatbox/core';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSession } from '../lib/session';
import { Btn, ErrorText, Field, Txt, useTheme } from './kit';

export interface PickedLocation { input: LocationInput; label: string }

function guessCountry(): string {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || (typeof navigator !== 'undefined' ? navigator.language : '');
    const m = /[-_]([A-Z]{2})\b/.exec(loc);
    return m ? m[1] : 'US';
  } catch { return 'US'; }
}

export function placeLabel(p: { name: string; region?: string; country: string }, countries: GeoCountry[]) {
  const country = countries.find((c) => c.code === p.country)?.name ?? p.country;
  return [p.name, p.region, country].filter(Boolean).join(', ');
}

export function LocationPicker({ current, onChange }: {
  current?: { city: string; region: string; country?: string; postal?: string };
  onChange: (v: PickedLocation | null) => void;
}) {
  const { api } = useSession();
  const t = useTheme();
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [country, setCountry] = useState(current?.country || (current?.city ? 'US' : guessCountry()));
  const [countryQ, setCountryQ] = useState('');
  const [pickingCountry, setPickingCountry] = useState(false);
  const [postal, setPostal] = useState(current?.postal ?? '');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<GeoPlace[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.geoCountries().then(setCountries).catch(() => {}); }, [api]);
  const c = countries.find((x) => x.code === country);
  const countryMatches = useMemo(() => {
    const f = countryQ.trim().toLowerCase();
    return f ? countries.filter((x) => x.name.toLowerCase().includes(f) || x.code.toLowerCase() === f).slice(0, 8) : [];
  }, [countries, countryQ]);

  // City suggestions as they type.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    const id = setTimeout(() => { api.geoSearch(country, q).then((r) => live && setHits(r)).catch(() => {}); }, 200);
    return () => { live = false; clearTimeout(id); };
  }, [api, country, q]);

  const choose = (input: LocationInput, label: string) => { setPicked(label); setHits([]); setQ(''); setError(null); onChange({ input, label }); };

  async function useMyLocation() {
    setBusy(true); setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setError('Location is off. Search for your city instead.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const place = await api.geoNear(pos.coords.latitude, pos.coords.longitude);
      setCountry(place.country);
      choose({ country: place.country, placeId: place.id }, placeLabel(place, countries));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not get your location. Search for your city instead.');
    } finally { setBusy(false); }
  }

  const shown = picked ?? (!cleared && current?.city ? placeLabel({ name: current.city, region: current.region, country: current.country || 'US' }, countries) : null);

  return (
    <View style={{ gap: 12 }}>
      <Txt bold size={14}>Where you live</Txt>
      {shown ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.line }}>
          <Txt bold>{shown}</Txt>
          <Btn size="sm" kind="secondary" label="Change" onPress={() => { setPicked(null); setCleared(true); onChange(null); setPostal(''); }} />
        </View>
      ) : (
        <>
          {pickingCountry || !c ? (
            <View style={{ gap: 6 }}>
              <Field label="Country" value={countryQ} onChangeText={setCountryQ} placeholder="Start typing your country" autoFocus={pickingCountry} />
              {countryMatches.map((x) => (
                <Pressable key={x.code} accessibilityRole="button" onPress={() => { setCountry(x.code); setPickingCountry(false); setCountryQ(''); }} style={{ paddingVertical: 8 }}>
                  <Txt>{x.name}</Txt>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt>Country: <Txt bold>{c.name}</Txt></Txt>
              <Btn size="sm" kind="secondary" label="Change" onPress={() => setPickingCountry(true)} />
            </View>
          )}
          {c?.postal ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field label={country === 'US' ? 'ZIP code' : 'Postal code'} value={postal} onChangeText={setPostal} placeholder={country === 'US' ? '75201' : 'M5V 3L9'}
                  autoCapitalize="characters" keyboardType={country === 'US' ? 'number-pad' : 'default'} />
              </View>
              <Btn label="Use" kind="secondary" disabled={postal.trim().length < 3} onPress={() => choose({ country, postal: postal.trim() }, `${postal.trim().toUpperCase()}, ${c.name}`)} />
            </View>
          ) : null}
          <View style={{ gap: 4 }}>
            <Field label={c?.postal ? 'Or search for your city' : 'City or town'} value={q} onChangeText={setQ} placeholder="Start typing" />
            {hits.map((h) => (
              <Pressable key={h.id} accessibilityRole="button" onPress={() => choose({ country: h.country, placeId: h.id }, placeLabel(h, countries))} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: t.line }}>
                <Txt>{placeLabel(h, countries)}</Txt>
              </Pressable>
            ))}
          </View>
          <Btn label="Use my current location" icon="globe" kind="secondary" busy={busy} onPress={useMyLocation} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
      <ErrorText error={error} />
      <Txt sub size={12}>Only your town is saved, never your exact location. Place data from GeoNames (CC BY 4.0).</Txt>
    </View>
  );
}
