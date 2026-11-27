# WhatBox platform

Multi-site dating platform. AfterH is the first site; HFriends and DateALittle follow.
Each site has its own database and encryption key; nothing is shared between sites.

```
packages/core   rules, services and storage interfaces shared by everything
apps/api        NestJS API on PostgreSQL (control DB + one DB per site)
apps/member     Expo app: iOS, Android and web, plus Owner/Platform Admin at /admin
apps/web        Next.js public pages per site (SEO), picked by domain
infra           Azure: Bicep, Dockerfiles, scripts (see infra/README.md)
```

## Run locally

Needs Node 22 and PostgreSQL 16.

```
npm ci
export PG_SERVER_URL=postgres://postgres@localhost:5432 DEV_MASTER_KEY=local-dev-key \
  EXPOSE_DEV_CODES=true PHOTO_STORE=local PAYMENTS_STUB=true ALLOW_SELF_SERVE_TIER=true
npm run db:migrate && npm run db:seed       # demo data only; never run seed against production
npm run dev:api                             # http://localhost:4000
EXPO_PUBLIC_API_URL=http://localhost:4000 npm run dev:member
npm run dev:web                             # http://localhost:3000
```

Demo sign-ins: member `alex@example.com`; owner `owner@whatbox.test`; WhatBox platform admin
`admin@whatbox.test`. Codes are shown on screen because `EXPOSE_DEV_CODES=true`.

`npm run build:preview` builds the clickable preview, which runs the same core code in the browser
with no server.

## Tests

```
npm test -w @whatbox/core      # rules, tiers, billing, platform admin, isolation, cleanup
npm test -w @whatbox/api       # PayPal gateway
npm run smoke -w @whatbox/api  # end to end over HTTP against a running API
```
