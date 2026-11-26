// Tiny postal-code lookup for the prototype. Production swaps this for Azure Maps.
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
