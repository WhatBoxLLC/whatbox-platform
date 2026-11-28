// Wall-clock time in a named time zone <-> ISO instants, without a date library.
// Used by Owner Admin so an organiser types "2026-12-12 18:00" in the event's own zone.

function parts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
function offsetMs(ms: number, tz: string) {
  const p = parts(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** "2026-12-12" + "18:00" in America/Denver -> ISO instant. null if the input isn't a real date/time. */
export function zonedToIso(date: string, time: string, tz: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim() || '00:00');
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  try {
    let ms = guess - offsetMs(guess, tz);
    ms = guess - offsetMs(ms, tz); // second pass settles DST edges
    return new Date(ms).toISOString();
  } catch { return null; }
}

/** ISO instant -> { date: "2026-12-12", time: "18:00" } as seen in tz. */
export function isoToZoned(iso: string, tz: string): { date: string; time: string } {
  const p = parts(new Date(iso).getTime(), tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.y}-${z(p.mo)}-${z(p.d)}`, time: `${z(p.h)}:${z(p.mi)}` };
}
