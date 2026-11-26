import type { ContentPage } from '@whatbox/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSession } from '../../lib/session';
import { Btn, Eyebrow, H, Loading, Logo, Page, Txt } from '../../ui/kit';

export default function ContentPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api } = useSession();
  const [page, setPage] = useState<ContentPage | null | undefined>(undefined);
  useEffect(() => { api.page(slug).then(setPage).catch(() => setPage(null)); }, [api, slug]);
  return (
    <ScrollView>
      <Page max={760} style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo />
          <Btn label="Back" kind="secondary" size="sm" icon="back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
        {page === undefined ? <Loading /> : page === null ? <Txt>Page not found.</Txt> : (
          <View style={{ gap: 14, marginTop: 12 }}>
            {page.category ? <Eyebrow>{page.category}</Eyebrow> : null}
            <H size={38}>{page.title}</H>
            {page.body.split(/\n\n+/).map((p, i) => <Txt key={i} size={17}>{p}</Txt>)}
          </View>
        )}
      </Page>
    </ScrollView>
  );
}
