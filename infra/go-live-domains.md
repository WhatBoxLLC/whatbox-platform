# Site domains: set up ahead, switch on go-live day

Sites: afterh.com, hfriends.com, datealittle.com. Each one uses three names on Azure:

| Name | Serves | Go-live record |
|---|---|---|
| `afterh.com` | Public site (`whatbox-<env>-web`) | A → the environment's IP |
| `www.afterh.com` | Public site | CNAME → `whatbox-<env>-web.<env domain>` |
| `app.afterh.com` | Member app and admin (`whatbox-<env>-app`) | CNAME → `whatbox-<env>-app.<env domain>` |

All steps run from GitHub → Actions → **Custom domains** → Run workflow (pick environment and step).
`infra/scripts/add-domain.sh` does the same from Cloud Shell.

## Ahead of go-live (no effect on the live sites)

1. **records**: prints every record for each domain.
2. At the current DNS host, add only the **TXT** records it lists:
   `asuid`, `asuid.www` and `asuid.app` for each domain. They prove ownership and change nothing
   about where the domain points. Leave the A, CNAME and MX records alone.
3. **add**: adds the names to the apps with no certificate. Azure holds them ready; nobody reaches
   Azure on those names until DNS points there.
4. In Platform Admin → Sites, check each site lists its domain (for example `afterh.com`). The apps
   use that list to pick the site and to allow `https://app.afterh.com` to call the API.
5. Optional: try a site on a real name before go-live with a new subdomain, for example
   `next.afterh.com` and `app.next.afterh.com`. Add those two CNAMEs and their `asuid.` TXT records
   (new names, so nothing live changes), add `next.afterh.com` to the site's domains in Platform
   Admin, then run **add** and **bind** with `next.afterh.com`.

Redeploys keep every added domain and certificate (the deploy workflow reads them back first).

## Moving DNS to GoDaddy

When the nameservers move from SmarterASP to GoDaddy, copy every record across, including the
`asuid` TXT records and the mail (MX, SPF, DKIM) records, so nothing is lost in the move.

## Go-live day

1. A day before: lower the TTL on the existing A and CNAME records to 300 seconds.
2. Final data import and checks on the Azure side.
3. Change the records to the go-live values from step 1 above (A for the bare domain, CNAME for
   `www` and `app`). This is the switch.
4. Run **bind** for the domain. It issues the free managed certificates (a few minutes per name).
   Until a name's certificate is issued, HTTPS on that name shows a certificate warning, so run
   bind right after the records change, and switch one site at a time.
5. Run **status**: every name should show `SniEnabled`.
6. Check `https://afterh.com`, `https://www.afterh.com` and `https://app.afterh.com` sign-in.
7. Rollback: put the old A/CNAME values back. The old hosting keeps working until it's cancelled.

## Dev or prod

Domains can be bound in one Container Apps environment at a time. If go-live is on `prod`, run
**records** there once prod exists. If its verification value differs from dev's, add those TXT
records too. Then run **add** on prod, and remove the names from dev first
(`az containerapp hostname delete`).
