// Recent admin changes. Shows who did what and when; never member details.
import type { AdminApi, AuditEntry } from '@whatbox/core';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, H, Loading, relTime, Txt, useTheme } from './kit';

const LABELS: Record<string, string> = {
  'admin.sign_in': 'Signed in',
  'site.update': 'Changed site settings',
  'field.save': 'Saved profile field',
  'field.delete': 'Deleted profile field',
  'page.save': 'Saved public page',
  'page.delete': 'Deleted public page',
  'member.status': 'Changed a member status',
  'member.comp_tier': 'Gave a member a level',
  'moderation.approve': 'Approved',
  'moderation.reject': 'Rejected',
  'platform.site_create': 'Added site',
  'platform.site_update': 'Edited site',
  'platform.site_suspend': 'Suspended site',
  'platform.site_resume': 'Resumed site',
  'platform.owner_create': 'Added owner',
  'platform.owner_update': 'Edited owner',
  'platform.owner_delete': 'Removed owner',
};

export function AuditList({ api, siteId, siteNames, refreshKey }: { api: AdminApi; siteId?: string; siteNames?: Record<string, string>; refreshKey?: unknown }) {
  const t = useTheme();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  useEffect(() => { api.audit(siteId).then(setRows).catch(() => setRows([])); }, [api, siteId, refreshKey]);
  return (
    <Card style={{ gap: 8 }}>
      <H size={18} level={2}>Recent admin changes</H>
      {!rows ? <Loading /> : rows.length === 0 ? <Txt sub size={14}>Nothing yet.</Txt> : rows.slice(0, 15).map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', borderTopWidth: 1, borderColor: t.line, paddingTop: 8 }}>
          <Txt size={14} bold>{LABELS[e.action] ?? e.action}{e.action.startsWith('moderation.') && e.detail ? ` ${e.detail}` : ''}{e.action.startsWith('field.') || e.action.startsWith('page.') ? ` "${e.target}"` : ''}</Txt>
          {!siteId && e.siteId ? <Txt sub size={14}>{siteNames?.[e.siteId] ?? e.siteId}</Txt> : null}
          {e.action === 'site.update' && e.detail ? <Txt sub size={13}>{e.detail.replace(/settings\.|membership\./g, '')}</Txt> : null}
          <View style={{ marginLeft: 'auto' }}><Txt sub size={13}>{e.actorEmail} · {relTime(e.at)}</Txt></View>
        </View>
      ))}
    </Card>
  );
}
