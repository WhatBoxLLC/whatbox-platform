import type { MetadataRoute } from 'next';
import { baseUrl } from '../lib/site';

export const dynamic = 'force-dynamic';

// Only the public pages are crawlable. The member app lives on its own origin and sends noindex.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await baseUrl();
  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: `${base}/sitemap.xml` };
}
