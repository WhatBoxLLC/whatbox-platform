import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { baseUrl, getPage, getSite } from '../../lib/site';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || page.summary,
    alternates: { canonical: `${await baseUrl()}/${page.slug}` },
  };
}

export default async function ContentPage({ params }: Props) {
  const { slug } = await params;
  const [page, site] = await Promise.all([getPage(slug), getSite()]);
  if (!page) notFound();
  const ld = page.kind === 'article'
    ? { '@context': 'https://schema.org', '@type': 'Article', headline: page.title, description: page.summary, dateModified: page.updatedAt, publisher: { '@type': 'Organization', name: site.name } }
    : null;
  return (
    <article className="article">
      {ld ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /> : null}
      {page.category ? <span className="eyebrow">{page.category}</span> : null}
      <h1>{page.title}</h1>
      {page.body.split(/\n\n+/).map((p, i) => <p key={i} style={{ margin: 0 }}>{p}</p>)}
    </article>
  );
}
