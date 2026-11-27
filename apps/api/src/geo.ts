// Worldwide places for sign-up and distance search.
// Cities: every place of 1,000+ people (GeoNames via the all-the-cities package, CC BY 4.0, credited on the
// privacy page). Postal codes: US ZIPs and Canadian FSAs (zipcodes package). A member's location is always
// one of these places, so we only ever store a town's coordinates, never where someone actually is.
import { countryName, type GeoCountry, type GeoPlace, type GeoProvider, unitsForCountry } from '@whatbox/core';

interface City { cityId: number; name: string; country: string; adminCode: string; population: number; loc: { coordinates: [number, number] } }
interface Row extends GeoPlace { fold: string; pop: number }

// GeoNames admin codes are numbers in some countries; these are the common ones members will see.
const REGIONS: Record<string, Record<string, string>> = {
  CA: { '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL', '07': 'NS', '08': 'ON', '09': 'PE', '10': 'QC', '11': 'SK', '12': 'YT', '13': 'NT', '14': 'NU' },
  AU: { '01': 'ACT', '02': 'NSW', '03': 'NT', '04': 'QLD', '05': 'SA', '06': 'TAS', '07': 'VIC', '08': 'WA' },
};
const POSTAL_COUNTRIES = new Set(['US', 'CA']);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cell = (lat: number, lng: number) => `${Math.floor(lat)}:${Math.floor(lng)}`;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

export class WorldGeo implements GeoProvider {
  private rows: Row[] = [];
  private byId = new Map<string, Row>();
  private byCountry = new Map<string, Row[]>();
  private grid = new Map<string, Row[]>();
  private countryList: GeoCountry[] = [];
  private zip: { lookup(z: string): { latitude: number; longitude: number; city: string; state: string; country: string } | undefined };

  constructor() {
    const cities: City[] = require('all-the-cities');
    this.zip = require('zipcodes');
    for (const c of cities) {
      const region = REGIONS[c.country]?.[c.adminCode] ?? (/^[A-Z]{2,3}$/.test(c.adminCode) ? c.adminCode : '');
      const row: Row = { id: 'g' + c.cityId, name: c.name, region, country: c.country, lat: c.loc.coordinates[1], lng: c.loc.coordinates[0], fold: fold(c.name), pop: c.population };
      this.rows.push(row);
    }
    this.rows.sort((a, b) => b.pop - a.pop);
    for (const r of this.rows) {
      this.byId.set(r.id, r);
      (this.byCountry.get(r.country) ?? this.byCountry.set(r.country, []).get(r.country)!).push(r);
      const k = cell(r.lat, r.lng);
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(r);
    }
    this.countryList = [...this.byCountry.keys()]
      .map((code) => ({ code, name: countryName(code), postal: POSTAL_COUNTRIES.has(code), units: unitsForCountry(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async countries() { return this.countryList; }

  async postal(country: string, postal: string): Promise<GeoPlace | null> {
    if (!POSTAL_COUNTRIES.has(country)) return null;
    const code = postal.trim().toUpperCase().replace(/\s+/g, '');
    const key = country === 'US' ? code.slice(0, 5) : code.slice(0, 3);
    if (country === 'US' ? !/^\d{5}$/.test(key) : !/^[A-Z]\d[A-Z]$/.test(key)) return null;
    const z = this.zip.lookup(key);
    if (!z || (country === 'US') !== (z.country === 'US')) return null;
    // Name it after the nearest real town (Canadian FSA names are long neighbourhood lists).
    const town = await this.nearest(z.latitude, z.longitude);
    const name = country === 'US' ? z.city : town?.name ?? z.city;
    const region = country === 'US' ? z.state : town?.region ?? '';
    return { id: `zip:${country}:${key}`, name, region, country, lat: z.latitude, lng: z.longitude, postal: key };
  }

  async search(country: string | undefined, q: string, limit = 8): Promise<GeoPlace[]> {
    const f = fold(q.trim());
    if (!f) return [];
    const pool = country ? this.byCountry.get(country) ?? [] : this.rows;
    const out: GeoPlace[] = [];
    for (const r of pool) {
      if (r.fold.startsWith(f)) out.push(this.place_(r));
      if (out.length >= limit) break;
    }
    return out;
  }

  async place(id: string): Promise<GeoPlace | null> {
    const m = /^zip:([A-Z]{2}):(.+)$/.exec(id);
    if (m) return this.postal(m[1], m[2]);
    const r = this.byId.get(id);
    return r ? this.place_(r) : null;
  }

  // The biggest town within 15 km, else the closest one. Reads better ("Toronto", not a suburb) and is
  // coarser, which is what we want for privacy.
  async nearest(lat: number, lng: number): Promise<GeoPlace | null> {
    let closest: Row | null = null, closestKm = Infinity, big: Row | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const r of this.grid.get(cell(lat + dy, lng + dx)) ?? []) {
        const d = km({ lat, lng }, r);
        if (d < closestKm) { closest = r; closestKm = d; }
        if (d <= 15 && (!big || r.pop > big.pop)) big = r;
      }
    }
    const pick = big ?? closest;
    return pick ? this.place_(pick) : null;
  }

  private place_(r: Row): GeoPlace {
    return { id: r.id, name: r.name, region: r.region, country: r.country, lat: r.lat, lng: r.lng };
  }
}
