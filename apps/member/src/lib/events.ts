import type { SiteEvent } from '@whatbox/core';

// Event times show in the event's own time zone (a Denver meetup reads "7 PM MST" wherever you are).
export function eventWhen(e: Pick<SiteEvent, 'startsAt' | 'endsAt' | 'timezone'>, opts: { short?: boolean } = {}) {
  const tz = e.timezone;
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => {
    try { return new Date(iso).toLocaleString(undefined, { ...o, timeZone: tz }); } catch { return new Date(iso).toLocaleString(undefined, o); }
  };
  const day: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  if (opts.short) return fmt(e.startsAt, { ...day, hour: 'numeric', minute: '2-digit' });
  const start = `${fmt(e.startsAt, day)}, ${fmt(e.startsAt, time)}`;
  if (!e.endsAt) return start;
  const sameDay = fmt(e.startsAt, day) === fmt(e.endsAt, day);
  return sameDay ? `${start} to ${fmt(e.endsAt, time)}` : `${fmt(e.startsAt, day)} to ${fmt(e.endsAt, day)}`;
}

export function eventPlace(e: Pick<SiteEvent, 'online' | 'venue' | 'city' | 'region'>) {
  if (e.online) return 'Online';
  return [e.venue, [e.city, e.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

export function dateBlock(e: Pick<SiteEvent, 'startsAt' | 'timezone'>) {
  const f = (o: Intl.DateTimeFormatOptions) => { try { return new Date(e.startsAt).toLocaleString(undefined, { ...o, timeZone: e.timezone }); } catch { return new Date(e.startsAt).toLocaleString(undefined, o); } };
  return { month: f({ month: 'short' }).toUpperCase(), day: f({ day: 'numeric' }) };
}
