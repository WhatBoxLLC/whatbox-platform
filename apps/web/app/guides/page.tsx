import type { Metadata } from 'next';
import { getPages } from '../../lib/site';

export const metadata: Metadata = { title: 'Guides and stories' };

export default async function Guides() {
  const guides = (await getPages()).filter((p) => p.placement === 'guides');
  return (
    <section className="wrap section">
      <h1 style={{ fontSize: 40 }}>Guides and stories</h1>
      <div className="cols">
        {guides.map((g) => (
          <article className="card" key={g.slug}>
            <span className="eyebrow" style={{ fontSize: 13 }}>{g.category}</span>
            <h2 style={{ fontSize: 20, margin: '6px 0' }}><a href={`/${g.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{g.title}</a></h2>
            <p className="muted" style={{ margin: 0 }}>{g.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
