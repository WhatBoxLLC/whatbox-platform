import type { MetadataRoute } from 'next';
import { baseUrl, getPages } from '../lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await baseUrl();
  const pages = await getPages();
  return [
    { url: base + '/', changeFrequency: 'weekly', priority: 1 },
    { url: base + '/guides', changeFrequency: 'weekly', priority: 0.7 },
    ...pages.map((p) => ({ url: `${base}/${p.slug}`, lastModified: p.updatedAt, priority: p.kind === 'article' ? 0.6 : 0.3 })),
  ];
}
