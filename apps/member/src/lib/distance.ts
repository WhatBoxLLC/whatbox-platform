// Distances are stored in miles; members see km or miles depending on their units.
import type { Units } from '@whatbox/core';

export const DISTANCE_STEPS: (number | null)[] = [10, 25, 50, 100, null];

export function distanceLabel(miles: number | null, units: Units): string {
  if (miles === null) return 'Anywhere';
  return units === 'metric' ? `${Math.round((miles * 1.609) / 5) * 5} km` : `${miles} mi`;
}

export function awayLabel(miles: number | null, units: Units, long = false): string {
  if (miles === null) return '';
  const n = units === 'metric' ? Math.round(miles * 1.609) : miles;
  const unit = units === 'metric' ? 'km' : long ? (n === 1 ? 'mile' : 'miles') : 'mi';
  return long ? `${n} ${unit} away` : `${n} ${unit}`;
}
