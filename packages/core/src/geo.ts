// Built-in place lookup for the preview and tests: a few Denver-area ZIPs and some world cities.
// The API swaps in WorldGeo (every city of 1,000+ people worldwide, plus US and Canada postal codes).
import type { GeoCountry, GeoPlace, GeoProvider } from './types';

const ZIPS: Record<string, [number, number, string, string]> = {
  '80202': [39.7527, -104.9992, 'Denver', 'CO'],
  '80203': [39.7313, -104.9826, 'Denver', 'CO'],
  '80205': [39.759, -104.9665, 'Denver', 'CO'],
  '80210': [39.6787, -104.9631, 'Denver', 'CO'],
  '80226': [39.7121, -105.0667, 'Lakewood', 'CO'],
  '80012': [39.6993, -104.8376, 'Aurora', 'CO'],
  '80301': [40.0496, -105.2132, 'Boulder', 'CO'],
  '80401': [39.7317, -105.2386, 'Golden', 'CO'],
  '80110': [39.6455, -105.0105, 'Englewood', 'CO'],
  '80002': [39.7948, -105.0975, 'Arvada', 'CO'],
  '80120': [39.5994, -105.0105, 'Littleton', 'CO'],
  '80031': [39.8761, -105.0372, 'Westminster', 'CO'],
  '80134': [39.4866, -104.8445, 'Parker', 'CO'],
  '80501': [40.1655, -105.1022, 'Longmont', 'CO'],
  '80525': [40.5386, -105.0461, 'Fort Collins', 'CO'],
  '80903': [38.8339, -104.8214, 'Colorado Springs', 'CO'],
  '10001': [40.7506, -73.9972, 'New York', 'NY'],
  '60601': [41.8857, -87.6181, 'Chicago', 'IL'],
  '78701': [30.2711, -97.7437, 'Austin', 'TX'],
  '98101': [47.6114, -122.3305, 'Seattle', 'WA'],
  '30303': [33.7525, -84.3888, 'Atlanta', 'GA'],
  '85004': [33.4515, -112.0702, 'Phoenix', 'AZ'],
  '97205': [45.5206, -122.6852, 'Portland', 'OR'],
  '32801': [28.5421, -81.379, 'Orlando', 'FL'],
};

export function lookupPostal(postal: string): { lat: number; lng: number; city: string; region: string } | null {
  const z = ZIPS[postal.trim().slice(0, 5)];
  return z ? { lat: z[0], lng: z[1], city: z[2], region: z[3] } : null;
}

export const KNOWN_POSTALS = Object.keys(ZIPS);

// A handful of non-US cities so the preview can show worldwide sign-up.
const WORLD: [string, string, string, number, number][] = [
  ['Dallas', 'TX', 'US', 32.7831, -96.8067], ['Fort Worth', 'TX', 'US', 32.7254, -97.3208], ['Denver', 'CO', 'US', 39.7392, -104.9847],
  ['Toronto', 'ON', 'CA', 43.7001, -79.4163], ['Vancouver', 'BC', 'CA', 49.2497, -123.1193], ['London', 'England', 'GB', 51.5085, -0.1257],
  ['Manchester', 'England', 'GB', 53.4809, -2.2374], ['Dublin', 'Leinster', 'IE', 53.3331, -6.2489], ['Sydney', 'NSW', 'AU', -33.8679, 151.2073],
  ['Melbourne', 'VIC', 'AU', -37.814, 144.9633], ['Auckland', 'Auckland', 'NZ', -36.8485, 174.7633], ['Berlin', 'Berlin', 'DE', 52.5244, 13.4105],
  ['Paris', 'Île-de-France', 'FR', 48.8534, 2.3488], ['Madrid', 'Madrid', 'ES', 40.4165, -3.7026], ['Mexico City', 'CDMX', 'MX', 19.4285, -99.1277],
  ['São Paulo', 'SP', 'BR', -23.5475, -46.6361], ['Johannesburg', 'Gauteng', 'ZA', -26.2023, 28.0436], ['Manila', 'NCR', 'PH', 14.6042, 120.9822],
];
const IMPERIAL = new Set(['US', 'GB', 'LR', 'MM']);
export const unitsForCountry = (country: string): 'imperial' | 'metric' => (IMPERIAL.has(country) ? 'imperial' : 'metric');

export function countryName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

export const builtinGeo: GeoProvider = {
  async countries(): Promise<GeoCountry[]> {
    const codes = [...new Set(['US', ...WORLD.map((w) => w[2])])];
    return codes.map((code) => ({ code, name: countryName(code), postal: code === 'US', units: unitsForCountry(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async postal(country, postal) {
    if (country !== 'US') return null;
    const z = lookupPostal(postal);
    return z ? { id: 'zip:US:' + postal.trim().slice(0, 5), name: z.city, region: z.region, country: 'US', lat: z.lat, lng: z.lng, postal: postal.trim().slice(0, 5) } : null;
  },
  async search(country, q, limit = 8) {
    const f = fold(q.trim());
    if (!f) return [];
    return this.all().filter((p) => (!country || p.country === country) && fold(p.name).startsWith(f)).slice(0, limit);
  },
  async place(id) { return this.all().find((p) => p.id === id) ?? null; },
  async nearest(lat, lng) {
    let best: GeoPlace | null = null, bestKm = Infinity;
    for (const p of this.all()) { const d = km({ lat, lng }, p); if (d < bestKm) { best = p; bestKm = d; } }
    return bestKm < 300 ? best : null;
  },
  all(): GeoPlace[] {
    const zips = Object.entries(ZIPS).filter(([, z]) => !WORLD.some((w) => w[0] === z[2]))
      .map(([zip, z]) => ({ id: `city:US:${z[2]}`, name: z[2], region: z[3], country: 'US', lat: z[0], lng: z[1] }));
    const uniq = new Map(zips.map((z) => [z.id, z]));
    return [...WORLD.map(([name, region, country, lat, lng]) => ({ id: `city:${country}:${name}`, name, region, country, lat, lng })), ...uniq.values()];
  },
} as GeoProvider & { all(): GeoPlace[] };
