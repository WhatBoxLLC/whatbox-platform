# Deploying WhatBox to Azure

Everything runs in one Azure resource group per environment (`whatbox-dev`, `whatbox-prod`),
both in WhatBox's own Azure account. The template has no subscription-specific values, so moving
to another subscription is a fresh deploy plus a database restore.

## What gets created (`infra/main.bicep`)

| Piece | Azure service | Notes |
|---|---|---|
| API | Container App `whatbox-<env>-api` | NestJS. Min 1 instance (live updates). Cleanup job runs inside it. |
| Public SEO site | Container App `whatbox-<env>-web` | Next.js. One app serves every site, picked by domain. |
| Member web app | Container App `whatbox-<env>-app` | Expo web build. `app.<domain>` picks the site. |
| WhatBox AI | Container App `whatbox-<env>-ai` | Shared photo checks for every site and app (`apps/ai`). Own database `whatbox_ai`. Scales to zero in dev. |
| Photo AI | Azure AI Content Safety + Azure AI Vision (East US) | Adult rating and text in photos. Free tiers in dev, pay per photo in prod. `infra/modules/ai.bicep`. |
| Migrations | Container Apps Job `whatbox-<env>-migrate` | Started by the deploy workflow. |
| Databases | PostgreSQL Flexible Server 16 | Control DB plus one database per site. TLS required. |
| Photos | Storage account, one private container per site | Short-lived signed URLs only. |
| Secrets | Key Vault (RBAC) | Site encryption keys, DB URL, storage key, ACS, PayPal, WhatBox AI keys. |
| Email/SMS codes | Azure Communication Services | Azure-managed sender domain to start. |
| Images | Container Registry | Built in Azure by `az acr build`. |
| Logs | Log Analytics | 30 days dev, 90 days prod. |

Rough dev cost: about $60 to $90 a month (Postgres B1ms, the API's always-on instance, registry,
logs). Web, the member app and WhatBox AI scale to zero in dev, and the Azure AI accounts use free
tiers there (5,000 photos a month each), so WhatBox AI adds about nothing to the dev bill.

## First-time setup (once per environment)

1. In the Azure portal, open **Cloud Shell** (Bash) and run `infra/scripts/setup-azure.sh dev`
   (paste its contents). It creates the resource group and lets this repo's GitHub Actions deploy,
   using OIDC so no Azure password is stored in GitHub. It trusts both forms of GitHub's token
   subject (names, and names with ids). It prints five values.
2. In GitHub → Settings → Environments, create `dev` and add the four printed variables and the
   `PG_ADMIN_PASSWORD` secret. Optional secrets: `PAYPAL_JSON`, `OAUTH_CLIENTS_JSON`, `EXPO_ACCESS_TOKEN`.
3. Run **Deploy to Azure** from the Actions tab. It creates everything, generates each site's
   encryption key straight into Key Vault (never shown or stored in GitHub), builds the images,
   deploys the apps and runs migrations. The first run takes about 20 to 30 minutes.

Back up the Key Vault: losing a site's key makes its members' encrypted contact details unreadable.

For now both `dev` and `prod` are deployed by hand from the Actions tab (Run workflow, pick the
environment). Automatic deploys of `dev` on every push to `main` get switched on once the first
deploy is clean.

## WhatBox AI (shared photo checks)

The deploy creates two random keys straight in Key Vault (`infra/scripts/bootstrap-ai-keys.sh`):
`ai-platform-key`, which the dating platform uses to check photos, and `ai-admin-key`, which lets
Platform Admin list callers and make keys for other apps. Neither is ever shown or stored in GitHub.

To let another app use it, sign in to Platform Admin, open **WhatBox AI**, choose
**Add an app or site**, and give the key it shows to that app's developer with `apps/ai/README.md`.
The deploy summary lists the WhatBox AI address.

Azure only allows one free account of each Azure AI kind per subscription. If prod is ever deployed
into the same subscription as dev, prod uses paid tiers automatically. If a deploy stops with
"agree to Responsible AI terms", create any **Computer Vision** resource once in the Azure portal
(tick the terms box), delete it, and run the deploy again.

## Adding a site

1. Add its key: `infra/scripts/bootstrap-secrets.sh <vault> site_<slug>` and restart the API revision.
2. In Platform Admin → Add a site. The API creates the site's database.
3. Point DNS and bind certificates: `infra/scripts/add-domain.sh <rg> <env> <domain>` (instructions in the script).

## Payments

Each site uses its own PayPal Business account. Put credentials in the `PAYPAL_JSON` secret:
`{"site_afterh":{"clientId":"…","secret":"…","webhookId":"…","env":"sandbox"}}`. In PayPal, create
one monthly plan per paid level and a webhook pointing at
`https://<api>/v1/webhooks/paypal/<slug>` (subscription and sale events). The owner pastes the
plan IDs into Owner Admin → Site settings → Payments.

## Before production

- Move Postgres and the Container Apps environment into a VNet with private endpoints, and turn
  off public network access on Postgres, Storage and Key Vault.
- Give the API its own Postgres role (with CREATEDB) instead of the server admin.
- Add each site's own email domain in Communication Services so codes come from `@afterh.com`.
- Buy an SMS number in Communication Services and set `acsSmsFromJson`.
- Turn on Defender for Cloud and set budget alerts on the resource group.
- Give WhatBox AI its own Postgres role limited to the `whatbox_ai` database.

## Local development

See the root README. CI runs the same steps against a Postgres service container:
type check, core and API tests, migrate, seed, two API instances, end-to-end smoke test, and a
Bicep compile.
