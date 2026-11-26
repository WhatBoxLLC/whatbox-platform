// Public, crawlable landing page. Member profiles never appear here on sensitive sites.
import { APP_URL, getPages, getSite } from '../lib/site';

export default async function Home() {
  const site = await getSite();
  const pages = await getPages();
  const sensitive = site.mode === 'sensitive';
  const guides = pages.filter((p) => p.placement === 'guides');
  const faq = pages.find((p) => p.slug === 'faq');
  const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, description: site.audience };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="wrap hero">
        <div style={{ display: 'grid', gap: 18 }}>
          <span className="eyebrow">{site.audience}</span>
          <h1>{site.tagline}</h1>
          <p className="lead">
            {sensitive
              ? 'Everyone here understands. So you can skip the disclosure worry and get to the good part: meeting someone who gets it.'
              : 'A warm, verified community built for people like you. No judgment, no explaining, just good people.'}
          </p>
          <ul className="checks">
            <li>{sensitive ? 'No public profiles. Members are only visible after you sign in.' : 'Your profile is only public if you choose a public teaser.'}</li>
            <li>Every account is verified by email or phone before it can browse.</li>
            <li>Discreet billing name and private photos you control.</li>
          </ul>
        </div>
        <div className="card join">
          <h2 style={{ fontSize: 26 }}>Join free</h2>
          <p className="muted" style={{ margin: 0 }}>We send a 6-digit code to confirm it is really you. Joining takes about two minutes.</p>
          <a className="btn primary" href={`${APP_URL}/join`}>Join with email or phone</a>
          <a className="btn secondary" href={`${APP_URL}/join?mode=signin`}>I already have an account</a>
          <small className="muted">Your email or number is never shown to other members.</small>
        </div>
      </div>

      <section className="band" id="how">
        <div className="wrap section">
          <h2 style={{ fontSize: 32 }}>How it works</h2>
          <div className="cols">
            {[
              ['Verify', 'Confirm your email or phone with a one-time code. It keeps out bots and most scammers before they reach anyone.'],
              ['Make a profile', 'Share as much or as little as you like. Add a main photo, up to six public photos and up to six private ones.'],
              ['Connect', 'Browse members near you, send a like, and start a conversation when it feels right.'],
            ].map(([h, b], i) => (
              <div key={h} style={{ display: 'grid', gap: 8 }}>
                <span className="num">{i + 1}</span><h3>{h}</h3><p className="muted" style={{ margin: 0 }}>{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap section" id="privacy">
        <h2 style={{ fontSize: 32 }}>Private by design</h2>
        <div className="cols">
          {[
            ['Hidden from search engines', 'Profiles live behind sign-in. Search engines only see these public pages.'],
            ['Private photos, your call', 'Members ask to see them. You approve, and you can revoke access any time.'],
            ['Scam screening', 'Messages are checked for money requests, off-site contact pushes and copy-paste spam.'],
            ['Discreet billing', `If you upgrade, your statement shows "${site.billingDescriptor}", not the site name.`],
          ].map(([h, b]) => <div className="card" key={h}><h3 style={{ fontSize: 18, marginBottom: 6 }}>{h}</h3><p className="muted" style={{ margin: 0 }}>{b}</p></div>)}
        </div>
      </section>

      {guides.length ? (
        <section className="wrap section" id="guides">
          <h2 style={{ fontSize: 32 }}>Guides and stories</h2>
          <div className="cols">
            {guides.map((g) => (
              <article className="card" key={g.slug}>
                <span className="eyebrow" style={{ fontSize: 13 }}>{g.category}</span>
                <h3 style={{ fontSize: 20, margin: '6px 0' }}><a href={`/${g.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{g.title}</a></h3>
                <p className="muted" style={{ margin: 0 }}>{g.summary}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {faq ? (
        <section className="wrap section" style={{ maxWidth: 820 }}>
          <h2 style={{ fontSize: 32 }}>Common questions</h2>
          {faq.body.split(/\n\n+/).map((qa, i) => {
            const [q, ...a] = qa.split('\n');
            return <details key={q} open={i === 0}><summary>{q}</summary><p className="muted">{a.join(' ')}</p></details>;
          })}
        </section>
      ) : null}

      <section className="cta">
        <div className="wrap">
          <div><h2 style={{ fontSize: 30, color: '#fff' }}>Ready when you are.</h2><p style={{ margin: 0 }}>Joining takes about two minutes.</p></div>
          <a className="btn secondary" href={`${APP_URL}/join`}>Join free</a>
        </div>
      </section>
    </>
  );
}
