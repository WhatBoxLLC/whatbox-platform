// Landing page inside the app. The crawlable public version of this page is served by apps/web;
// this one is what app users and signed-out web visitors of the member app see.
import type { ContentPage } from '@whatbox/core';
import { Link, Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { IS_PREVIEW } from '../lib/backend';
import { useSession } from '../lib/session';
import { JoinForm } from '../ui/JoinForm';
import { Btn, Card, Eyebrow, H, Icon, Logo, Notice, Txt, useTheme, useWide, type IconName } from '../ui/kit';

export default function Landing() {
  const { site, signedIn, me, api } = useSession();
  const t = useTheme();
  const wide = useWide(960);
  const [pages, setPages] = useState<ContentPage[]>([]);
  useEffect(() => { api.pages().then(setPages).catch(() => {}); }, [api]);

  if (signedIn && me) return <Redirect href={me.member.profileComplete ? '/browse' : '/onboarding'} />;
  const sensitive = site.mode === 'sensitive';
  const guides = pages.filter((p) => p.placement === 'guides');
  const footer = pages.filter((p) => p.placement === 'footer');
  const faq = pages.find((p) => p.slug === 'faq');

  const bullets = [
    sensitive ? 'No public profiles. Members are only visible after you sign in.' : 'Your profile is only public if you choose a public teaser.',
    'Every account is verified by email or phone before it can browse.',
    'Discreet billing name and private photos you control.',
  ];
  const features: [IconName, string, string][] = [
    ['eyeOff', 'Hidden from search engines', 'Profiles live behind sign-in. Search engines only see the public pages.'],
    ['image', 'Private photos, your call', 'Members ask to see them. You approve, and you can revoke access any time.'],
    ['shield', 'Scam screening', 'Messages are checked for money requests, off-site contact pushes and copy-paste spam.'],
    ['card', 'Discreet billing', `If you upgrade, your statement shows "${site.billingDescriptor}", not the site name.`],
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.line }}>
        <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <Logo size={34} />
          <View style={{ flexGrow: 1 }} />
          {wide ? ['How it works', 'Privacy', 'Guides'].map((l) => <Txt key={l} bold size={15}>{l}</Txt>) : null}
          <Btn label="Sign in" kind="secondary" size="sm" onPress={() => router.push('/join?mode=signin')} />
        </View>
      </View>

      <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: wide ? 64 : 32, flexDirection: wide ? 'row' : 'column', gap: 40, alignItems: wide ? 'center' : 'stretch' }}>
        <View style={{ flex: wide ? 1.2 : undefined, gap: 18 }}>
          <Txt bold color="#8A5233" size={15}>{site.audience}</Txt>
          <H size={wide ? 58 : 40}>{site.tagline}</H>
          <Txt size={19} sub>
            {sensitive
              ? 'Everyone here understands. So you can skip the disclosure worry and get to the good part: meeting someone who gets it.'
              : 'A warm, verified community built for people like you. No judgment, no explaining, just good people.'}
          </Txt>
          <View style={{ gap: 12, marginTop: 6 }}>
            {bullets.map((b) => (
              <View key={b} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ marginTop: 2 }}><Icon name="check" color={t.accent} stroke={2.4} /></View>
                <Txt style={{ flex: 1 }}>{b}</Txt>
              </View>
            ))}
          </View>
        </View>
        <Card style={{ flex: wide ? 0.9 : undefined, shadowColor: '#1E2629', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }} pad={28}>
          <JoinForm />
          {IS_PREVIEW ? (
            <View style={{ marginTop: 18 }}>
              <Notice tone="warn" title="Prototype tip">Sign in as the demo member with alex@example.com. The code appears on the next screen, since nothing is really sent.</Notice>
            </View>
          ) : null}
        </Card>
      </View>

      <View style={{ backgroundColor: t.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.line }}>
        <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 48, gap: 24 }}>
          <H size={32} level={2}>How it works</H>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
            {[
              ['Verify', 'Confirm your email or phone with a one-time code. It keeps out bots and most scammers before they reach anyone.'],
              ['Make a profile', 'Share as much or as little as you like. Add a main photo, up to six public photos and up to six private ones.'],
              ['Connect', 'Browse members near you, send a like, and start a conversation when it feels right.'],
            ].map(([h, b], i) => (
              <View key={h} style={{ flex: 1, gap: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt bold color={t.accent}>{i + 1}</Txt>
                </View>
                <H size={20} level={3}>{h}</H>
                <Txt sub>{b}</Txt>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 48, gap: 24 }}>
        <H size={32} level={2}>Private by design</H>
        <Txt sub size={17}>Your {sensitive ? 'health' : 'life'} is your business. {site.name} is built so nothing about you goes further than you choose.</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {features.map(([icon, h, b]) => (
            <Card key={h} style={{ flexGrow: 1, flexBasis: 240, gap: 8 }}>
              <Icon name={icon} size={28} color={t.accent} />
              <H size={18} level={3}>{h}</H>
              <Txt sub size={15}>{b}</Txt>
            </Card>
          ))}
        </View>
      </View>

      {guides.length ? (
        <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 20 }}>
          <H size={32} level={2}>Guides and stories</H>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {guides.map((g) => (
              <Pressable key={g.slug} onPress={() => router.push(`/page/${g.slug}`)} style={{ flexGrow: 1, flexBasis: 280 }}>
                <Card style={{ gap: 6, height: '100%' }}>
                  <Eyebrow>{g.category ?? 'Guide'}</Eyebrow>
                  <H size={20} level={3}>{g.title}</H>
                  <Txt sub size={15}>{g.summary}</Txt>
                </Card>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {faq ? (
        <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 12 }}>
          <H size={32} level={2}>Common questions</H>
          {faq.body.split(/\n\n+/).map((qa) => {
            const [q, ...a] = qa.split('\n');
            return (
              <Card key={q} pad={18} style={{ gap: 4 }}>
                <Txt bold>{q}</Txt>
                <Txt sub size={15}>{a.join(' ')}</Txt>
              </Card>
            );
          })}
        </View>
      ) : null}

      <View style={{ backgroundColor: t.accent }}>
        <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 40, flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: wide ? 'center' : 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <H size={30} style={{ color: '#FFFFFF' }} level={2}>Ready when you are.</H>
            <Txt color="#E3EFEC">Joining takes about two minutes.</Txt>
          </View>
          <Btn label="Join free" kind="secondary" size="lg" onPress={() => router.push('/join')} />
        </View>
      </View>

      <View style={{ backgroundColor: '#1E2629' }}>
        <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 36, gap: 16 }}>
          <Txt bold color="#FFFFFF" size={18}>{site.name}</Txt>
          <Txt color="#B9C2BF" size={14}>{site.audience}. Part of the WhatBox network.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
            {footer.map((p) => (
              <Link key={p.slug} href={`/page/${p.slug}`} style={{ color: '#E3EFEC', fontSize: 14, fontWeight: '600' }}>{p.title}</Link>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
