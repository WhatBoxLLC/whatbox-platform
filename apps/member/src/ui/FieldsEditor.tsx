// Renders the custom profile fields each site defines in Owner Admin.
import { cmToFeetInches, feetInchesToCm, normalizeFieldValue, type Member, type ProfileFieldDef } from '@whatbox/core';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '../lib/session';
import { ChipPicker, Field, Toggle, Txt } from './kit';

// Tapping an exclusive option ("None", "Prefer not to say") clears the rest, and tapping anything else clears it.
function exclusivePick(f: ProfileFieldDef, prev: string[] | undefined, next: string[]): string[] {
  const ex = f.exclusive ?? [];
  if (!ex.length) return next;
  const added = next.find((v) => !(prev ?? []).includes(v));
  if (added && ex.includes(added)) return [added];
  if (added) return next.filter((v) => !ex.includes(v));
  return next;
}

export function FieldsEditor({ fields, value, onChange, onlyRequired }: {
  fields: ProfileFieldDef[]; value: Member['fields']; onChange: (v: Member['fields']) => void; onlyRequired?: boolean;
}) {
  const list = [...fields].filter((f) => (onlyRequired ? f.required : true)).sort((a, b) => a.order - b.order);
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: 20 }}>
      {list.map((f) => {
        const label = f.label + (f.required ? ' (required)' : '');
        switch (f.type) {
          case 'select':
          case 'multiselect':
            return (
              <View key={f.key} style={{ gap: 4 }}>
                <ChipPicker label={label} options={f.options ?? []} value={normalizeFieldValue(f, value[f.key]) as any} multi={f.type === 'multiselect'}
                  onChange={(v) => set(f.key, f.type === 'multiselect' ? exclusivePick(f, normalizeFieldValue(f, value[f.key]) as string[] | undefined, v as string[]) : v)} />
                {f.exclusive?.length ? <Txt sub size={12}>Pick all that apply. {f.exclusive.map((x) => `"${x}"`).join(' and ')} can't be combined with others.</Txt> : null}
                {f.sensitive ? <Txt sub size={12}>Encrypted and only shown to signed-in members.</Txt> : null}
              </View>
            );
          case 'height':
            return <HeightInput key={f.key} label={label} cm={typeof value[f.key] === 'number' ? (value[f.key] as number) : undefined} onChange={(cm) => set(f.key, cm)} />;
          case 'boolean':
            return <Toggle key={f.key} label={label} value={!!value[f.key]} onChange={(v) => set(f.key, v)} />;
          case 'number':
            return <Field key={f.key} label={label} keyboardType="number-pad" value={value[f.key] === undefined ? '' : String(value[f.key])} onChangeText={(v) => set(f.key, v === '' ? undefined : Number(v))} />;
          default:
            return <Field key={f.key} label={label} value={(value[f.key] as string) ?? ''} onChangeText={(v) => set(f.key, v)} />;
        }
      })}
    </View>
  );
}

// Exact height. Entered in the member's preferred units, stored in cm, always shown in both.
function HeightInput({ label, cm, onChange }: { label: string; cm?: number; onChange: (cm: number | undefined) => void }) {
  const { me, site } = useSession();
  const units = me?.member.unitsResolved ?? site.units;
  const fi = cm ? cmToFeetInches(cm) : null;
  const [ft, setFt] = useState(fi ? String(fi.ft) : '');
  const [inch, setInch] = useState(fi ? String(fi.inch) : '');
  const [metric, setMetric] = useState(cm ? String(cm) : '');
  useEffect(() => {
    if (units === 'metric') return;
    const f = Number(ft), i = Number(inch || 0);
    if (ft === '') onChange(undefined);
    else if (f >= 3 && f <= 8 && i >= 0 && i < 12) onChange(feetInchesToCm(f, i));
  }, [ft, inch]); // eslint-disable-line react-hooks/exhaustive-deps
  const other = cm ? (units === 'metric' ? `${fi!.ft}′ ${fi!.inch}″` : `${cm} cm`) : '';
  return (
    <View style={{ gap: 4 }}>
      {units === 'metric' ? (
        <Field label={`${label}, cm`} keyboardType="number-pad" value={metric} placeholder="170"
          onChangeText={(v) => { setMetric(v); const n = Number(v); onChange(v === '' ? undefined : n >= 90 && n <= 250 ? n : cm); }} />
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label={`${label}, feet`} keyboardType="number-pad" value={ft} placeholder="5" onChangeText={setFt} /></View>
          <View style={{ flex: 1 }}><Field label="inches" keyboardType="number-pad" value={inch} placeholder="8" onChangeText={setInch} /></View>
        </View>
      )}
      {other ? <Txt sub size={12}>{`That's ${other}.`}</Txt> : null}
    </View>
  );
}
