import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { appUrl, getPages, getSite } from '../lib/site';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    title: { default: `${site.name}: ${site.audience}`, template: `%s | ${site.name}` },
    description: `${site.tagline} ${site.audience}. Verified members, private photos you control.`,
    openGraph: { siteName: site.name, type: 'website' },
  };
}

function Logo({ name, accent, second }: { name: string; accent: string; second: string }) {
  return (
    <a href="/" className="brand">
      <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="13" cy="17" r="10" fill="none" stroke={accent} strokeWidth="3" />
        <circle cx="21" cy="17" r="10" fill="none" stroke={second} strokeWidth="3" />
      </svg>
      {name}
    </a>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  const pages = await getPages();
  const t = site.theme;
  const vars = {
    '--ground': t.ground, '--surface': t.surface, '--ink': t.ink, '--sub': t.sub, '--line': t.line, '--accent': t.accent,
    '--accentSoft': t.accentSoft, '--heading': `'${t.headingFont}'`, '--body': `'${t.bodyFont}'`, '--radius': t.radius + 'px',
  } as React.CSSProperties;
  const app = await appUrl();
  return (
    <html lang="en">
      <head>{t.fontsHref ? <link rel="stylesheet" href={t.fontsHref} /> : null}</head>
      <body style={vars}>
        <header className="top">
          <div className="wrap">
            <Logo name={site.name} accent={t.accent} second={t.second} />
            <nav className="nav" aria-label="Main">
              <a className="hide-sm" href="/#how">How it works</a>
              <a className="hide-sm" href="/#privacy">Privacy</a>
              <a className="hide-sm" href="/guides">Guides</a>
              <a className="btn secondary" href={`${app}/join?mode=signin`}>Sign in</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="wrap">
            <strong style={{ color: '#fff', fontSize: 18 }}>{site.name}</strong>
            <span>{site.audience}. Part of the WhatBox network.</span>
            <nav aria-label="Footer">{pages.filter((p) => p.placement === 'footer').map((p) => <a key={p.slug} href={`/${p.slug}`}>{p.title}</a>)}</nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
