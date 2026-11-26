// Renders the custom profile fields each site defines in Owner Admin.
import type { Member, ProfileFieldDef } from '@whatbox/core';
import { View } from 'react-native';
import { ChipPicker, Field, Toggle, Txt } from './kit';

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
                <ChipPicker label={label} options={f.options ?? []} value={value[f.key] as any} multi={f.type === 'multiselect'} onChange={(v) => set(f.key, v)} />
                {f.sensitive ? <Txt sub size={12}>Encrypted and only shown to signed-in members.</Txt> : null}
              </View>
            );
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
