#!/usr/bin/env bash
# One-time Azure setup for an environment. Paste into Azure Cloud Shell (Bash) while signed in
# to the WhatBox Azure account. Creates the resource group and lets GitHub Actions in
# WhatBoxLLC/whatbox-platform deploy into it (OIDC: no password is stored in GitHub).
set -euo pipefail
ENV="${1:-dev}"; LOC="${2:-centralus}"; REPO="WhatBoxLLC/whatbox-platform"; RG="whatbox-$ENV"
SUB=$(az account show --query id -o tsv); TENANT=$(az account show --query tenantId -o tsv)
for p in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.KeyVault \
         Microsoft.Communication Microsoft.OperationalInsights Microsoft.Storage Microsoft.ManagedIdentity; do
  az provider register -n "$p" -o none
done
az group create -n "$RG" -l "$LOC" -o none
APP=$(az ad app create --display-name "github-whatbox-$ENV" --query appId -o tsv)
az ad sp create --id "$APP" -o none 2>/dev/null || true
# GitHub signs tokens for this repo with its owner and repo ids in the subject
# (WhatBoxLLC = 361781416, whatbox-platform = 1473883584). Trust both forms.
for SUBJ in "repo:$REPO:environment:$ENV" "repo:WhatBoxLLC@361781416/whatbox-platform@1473883584:environment:$ENV"; do
  N="github-$ENV-$(echo "$SUBJ" | md5sum | cut -c1-6)"
  az ad app federated-credential create --id "$APP" --parameters \
    "{\"name\":\"$N\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"$SUBJ\",\"audiences\":[\"api://AzureADTokenExchange\"]}" -o none
done
sleep 20 # let the new identity appear before granting it access
SCOPE="/subscriptions/$SUB/resourceGroups/$RG"
az role assignment create --assignee "$APP" --role Contributor --scope "$SCOPE" -o none
az role assignment create --assignee "$APP" --role "User Access Administrator" --scope "$SCOPE" -o none
echo
echo "Add these in GitHub: WhatBoxLLC/whatbox-platform > Settings > Environments > $ENV"
echo "  Variable AZURE_CLIENT_ID       = $APP"
echo "  Variable AZURE_TENANT_ID       = $TENANT"
echo "  Variable AZURE_SUBSCRIPTION_ID = $SUB"
echo "  Variable AZURE_RESOURCE_GROUP  = $RG"
echo "  Secret   PG_ADMIN_PASSWORD     = $(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)"
