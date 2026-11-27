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
| Migrations | Container Apps Job `whatbox-<env>-migrate` | Started by the deploy workflow. |
| Databases | PostgreSQL Flexible Server 16 | Control DB plus one database per site. TLS required. |
| Photos | Storage account, one private container per site | Short-lived signed URLs only. |
| Secrets | Key Vault (RBAC) | Site encryption keys, DB URL, storage key, ACS, PayPal. |
| Email/SMS codes | Azure Communication Services | Azure-managed sender domain to start. |
| Images | Container Registry | Built in Azure by `az acr build`. |
| Logs | Log Analytics | 30 days dev, 90 days prod. |

Rough dev cost: about $60 to $90 a month (Postgres B1ms, the API's always-on instance, registry,
logs). Web and the member app scale to zero in dev.

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

## Local development

See the root README. CI runs the same steps against a Postgres service container:
type check, core and API tests, migrate, seed, two API instances, end-to-end smoke test, and a
Bicep compile.
