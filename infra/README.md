# Deploying WhatBox to Azure

Everything runs in one Azure resource group per environment. `dev` lives in Nichesoft's
subscription while we build; `prod` moves to WhatBox's own subscription at go-live. The
template has no subscription-specific values, so moving is a fresh deploy plus a database restore.

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

1. Create a resource group, e.g. `az group create -n whatbox-dev -l centralus`.
2. Create an Entra app registration for GitHub with a federated credential for this repo's
   `dev` (and later `prod`) environment, and give it **Contributor** and **User Access
   Administrator** on the resource group (the template assigns roles to its managed identity).
3. In GitHub → Settings → Environments → `dev`, add:
   - Variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`
   - Secrets: `PG_ADMIN_PASSWORD` (long random), and optionally `PAYPAL_JSON`, `OAUTH_CLIENTS_JSON`, `EXPO_ACCESS_TOKEN`
4. Run the **Deploy to Azure** workflow once. It stops at "Check site encryption keys exist"
   and prints the command to run next.
5. Create the site encryption keys straight into Key Vault (never through GitHub):
   ```
   infra/scripts/bootstrap-secrets.sh <key-vault-name> site_afterh site_hfriends site_datealittle
   ```
   Back up the vault. Losing a site's key makes its members' encrypted contact details unreadable.
6. Run the workflow again. It builds the images, deploys the apps and runs migrations.

Every push to `main` then redeploys `dev`. `prod` is deployed by hand from the Actions tab.

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
