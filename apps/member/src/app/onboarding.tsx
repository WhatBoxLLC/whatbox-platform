import { ApiError, GENDERS, type Gender, type Member } from '@whatbox/core';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { IS_PREVIEW } from '../lib/backend';
import { useSession } from '../lib/session';
import { AuthFrame } from '../ui/AuthFrame';
import { FieldsEditor } from '../ui/FieldsEditor';
import { Btn, ChipPicker, ErrorText, Eyebrow, Field, H, Notice, Txt } from '../ui/kit';
import { PhotoManager } from '../ui/PhotoManager';

export default function Onboarding() {
  const { api, me, setMe, site, signedIn } = useSession();
  const [step, setStep] = useState(2);
  const [name, setName] = useState(me?.member.displayName ?? '');
  const [year, setYear] = useState('');
  const [gender, setGender] = useState<Gender | undefined>();
  const [seeking, setSeeking] = useState<Gender[]>([]);
  const [postal, setPostal] = useState('');
  const [fields, setFields] = useState<Member['fields']>(me?.member.fields ?? {});
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn || !me) return <Redirect href="/join" />;

  async function save(next: number, patch: Parameters<typeof api.updateMe>[0]) {
    setBusy(true); setError(null);
    try { setMe(await api.updateMe(patch)); setStep(next); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  }

  const label = (v: Gender) => GENDERS.find((g) => g.value === v)!.label;

  return (
    <AuthFrame step={step} back={false}>
      {step === 2 ? (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Eyebrow>Step 2 of 4</Eyebrow>
            <H size={32}>The basics</H>
            <Txt sub>Only your display name, age and city appear on your card.</Txt>
          </View>
          <Field label="Display name" value={name} onChangeText={setName} placeholder="A nickname, not your full name" maxLength={24} />
          <Field label="Birth year" value={year} onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))} placeholder="1988" keyboardType="number-pad" hint="You must be 18 or older. Only your age is shown." />
          <ChipPicker label="I am a" options={GENDERS.map((g) => g.label)} value={gender ? label(gender) : undefined} onChange={(v: string) => setGender(GENDERS.find((g) => g.label === v)!.value)} />
          <ChipPicker label="I want to meet" multi options={GENDERS.map((g) => g.label)} value={seeking.map(label)} onChange={(v: string[]) => setSeeking(v.map((x) => GENDERS.find((g) => g.label === x)!.value))} />
          <Txt sub size={13} style={{ marginTop: -8 }}>Pick all that apply.</Txt>
          <Field label="ZIP code" value={postal} onChangeText={setPostal} placeholder="80202" keyboardType="number-pad" hint={IS_PREVIEW ? 'The prototype knows Denver-area ZIPs like 80202, 80301 and 80226, plus a few big cities.' : 'Used to show distance. Your exact location is never shared.'} />
          <ErrorText error={error} />
          <Btn label="Continue" size="lg" busy={busy} onPress={() => {
            if (!gender || !seeking.length) { setError('Choose who you are and who you want to meet.'); return; }
            save(3, { displayName: name, birthYear: Number(year), gender, seeking, postal });
          }} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Eyebrow>Step 3 of 4</Eyebrow>
            <H size={32}>About you</H>
            <Txt sub>Share as much or as little as you like. You can change this later.</Txt>
          </View>
          <FieldsEditor fields={site.fields} value={fields} onChange={setFields} />
          <Field label="About me" value={about} onChangeText={setAbout} multiline numberOfLines={5} style={{ minHeight: 120, textAlignVertical: 'top' }} placeholder="What should people know about you?" hint="Phone numbers, emails and links are not allowed here." />
          <ErrorText error={error} />
          <Btn label="Continue" size="lg" busy={busy} onPress={() => save(4, { fields, about })} />
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Eyebrow>Step 4 of 4</Eyebrow>
            <H size={32}>Add photos</H>
            <Txt sub>Optional, but profiles with a main photo get far more replies.</Txt>
          </View>
          <PhotoManager only={['main', 'public']} />
          <Notice>New photos are reviewed by the {site.name} team. You can add private photos from your profile later.</Notice>
          <Btn label={me.photos.length ? 'Start discovering' : 'Skip for now'} size="lg" onPress={() => router.replace('/discover')} />
        </View>
      ) : null}
    </AuthFrame>
  );
}
