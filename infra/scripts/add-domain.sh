#!/usr/bin/env bash
# A site's custom domains on Azure Container Apps. Three steps, so everything except the DNS
# switch can be done ahead of go-live:
#
#   infra/scripts/add-domain.sh records <resource-group> <env> afterh.com
#       Prints the DNS records. The asuid TXT records only prove ownership: adding them changes
#       nothing about where the domain points, so they can go in at the current DNS host today.
#
#   infra/scripts/add-domain.sh add <resource-group> <env> afterh.com
#       Adds afterh.com and www.afterh.com to the public site app and app.afterh.com to the member
#       app, with no certificate yet. Live traffic is untouched: nothing reaches Azure until DNS does.
#
#   infra/scripts/add-domain.sh bind <resource-group> <env> afterh.com
#       Go-live day, after the A and CNAME records point at Azure: issues the free managed
#       certificates (a few minutes each) and switches each hostname to HTTPS.
#
# A domain with more than one dot (next.afterh.com) is treated as a subdomain: the public site on
# next.afterh.com (CNAME) and the member app on app.next.afterh.com, no www. Useful for trying the
# real sites on a new name before go-live.
#
# Also list every domain on the site in Platform Admin (Sites > Domains), or the apps won't know
# which site a domain belongs to.
set -euo pipefail
STEP="${1:?step: records, add or bind}"; RG="${2:?resource group}"; ENV="${3:?env}"
DOMAIN="${4:?domain}"; DOMAIN="${DOMAIN,,}"; DOMAIN="${DOMAIN#www.}"
PREFIX="${PREFIX:-whatbox}"
CAE="$PREFIX-$ENV-env"; WEB="$PREFIX-$ENV-web"; APP="$PREFIX-$ENV-app"

sub=false; [ "$(tr -cd . <<<"$DOMAIN" | wc -c)" -ge 2 ] && sub=true
# name|container app|validation
hosts=()
if $sub; then hosts+=("$DOMAIN|$WEB|CNAME"); else hosts+=("$DOMAIN|$WEB|HTTP" "www.$DOMAIN|$WEB|CNAME"); fi
hosts+=("app.$DOMAIN|$APP|CNAME")

fqdn() { az containerapp show -g "$RG" -n "$1" --query properties.configuration.ingress.fqdn -o tsv; }
bound() { az containerapp hostname list -g "$RG" -n "$2" --query "[?name=='$1'].bindingType | [0]" -o tsv 2>/dev/null || true; }

case "$STEP" in
records)
  id=$(az containerapp show -g "$RG" -n "$WEB" --query properties.customDomainVerificationId -o tsv)
  ip=$(az containerapp env show -g "$RG" -n "$CAE" --query properties.staticIp -o tsv)
  webf=$(fqdn "$WEB"); appf=$(fqdn "$APP")
  echo "Add now (ownership only, changes nothing for visitors):"
  for h in "${hosts[@]}"; do n="${h%%|*}"; echo "  TXT    asuid.$n    $id"; done
  echo "Add on go-live day (this is the switch; lower the TTL to 300 a day before):"
  for h in "${hosts[@]}"; do
    IFS='|' read -r n a v <<<"$h"; target=$([ "$a" = "$WEB" ] && echo "$webf" || echo "$appf")
    if [ "$v" = HTTP ]; then echo "  A      $n    $ip"; else echo "  CNAME  $n    $target"; fi
  done
  ;;
add)
  for h in "${hosts[@]}"; do
    IFS='|' read -r n a v <<<"$h"
    if [ -n "$(bound "$n" "$a")" ]; then echo "already added: $n -> $a"; continue; fi
    az containerapp hostname add -g "$RG" -n "$a" --hostname "$n" --output none
    echo "added $n -> $a (no certificate until go-live)"
  done
  ;;
bind)
  for h in "${hosts[@]}"; do
    IFS='|' read -r n a v <<<"$h"
    if [ "$(bound "$n" "$a")" = SniEnabled ]; then echo "already live: $n"; continue; fi
    az containerapp hostname bind -g "$RG" -n "$a" --hostname "$n" --environment "$CAE" --validation-method "$v" --output none
    echo "bound $n -> $a with a managed certificate"
  done
  ;;
*) echo "unknown step $STEP (use records, add or bind)" >&2; exit 2 ;;
esac
