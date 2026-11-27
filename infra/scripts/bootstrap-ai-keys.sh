#!/usr/bin/env bash
# Creates the two WhatBox AI keys in Key Vault if they are missing. Generated here and written
# straight to Key Vault: never printed, committed, or passed through GitHub. Existing keys are kept.
#   ai-admin-key     lets Platform Admin list and add WhatBox AI callers
#   ai-platform-key  the dating platform's own key for photo checks
#
#   infra/scripts/bootstrap-ai-keys.sh <key-vault-name>
set -euo pipefail
KV="${1:?Key Vault name}"
for name in ai-admin-key ai-platform-key; do
  if az keyvault secret show --vault-name "$KV" --name "$name" --query id -o tsv >/dev/null 2>/tmp/kv-err; then
    echo "$name already set"; continue
  fi
  if ! grep -q "SecretNotFound" /tmp/kv-err; then cat /tmp/kv-err >&2; exit 1; fi
  value="$(python3 -c 'import secrets; print(("wbai_" if "'"$name"'" == "ai-platform-key" else "wbadm_") + secrets.token_urlsafe(32))')"
  az keyvault secret set --vault-name "$KV" --name "$name" --value "$value" --output none
  echo "$name created"
done
