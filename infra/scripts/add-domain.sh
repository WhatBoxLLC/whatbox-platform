#!/usr/bin/env bash
# Point a site's domains at WhatBox with free managed certificates.
#   infra/scripts/add-domain.sh <resource-group> <env> afterh.com
# Before running: in the domain's DNS add
#   afterh.com      A/ALIAS  -> the web app's IP (az containerapp env show ... --query properties.staticIp)
#   www.afterh.com  CNAME    -> <prefix>-<env>-web.<env default domain>
#   app.afterh.com  CNAME    -> <prefix>-<env>-app.<env default domain>
#   asuid.*         TXT      -> the verification id (az containerapp show ... --query properties.customDomainVerificationId)
# Then also add the domain to the site in Platform Admin.
set -euo pipefail
RG="${1:?resource group}"; ENV="${2:?env}"; DOMAIN="${3:?domain}"; PREFIX="${PREFIX:-whatbox}"
CAE="$PREFIX-$ENV-env"
bind() { # app hostname
  az containerapp hostname add -g "$RG" -n "$1" --hostname "$2" --output none
  az containerapp hostname bind -g "$RG" -n "$1" --hostname "$2" --environment "$CAE" --validation-method "${3:-CNAME}" --output none
  echo "bound $2 -> $1"
}
bind "$PREFIX-$ENV-web" "$DOMAIN" HTTP
bind "$PREFIX-$ENV-web" "www.$DOMAIN"
bind "$PREFIX-$ENV-app" "app.$DOMAIN"
