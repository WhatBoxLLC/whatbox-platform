#!/usr/bin/env bash
# One-time (and per new site): create each site's encryption key in Key Vault.
# Keys are generated here and written straight to Key Vault; they are never printed,
# committed, or passed through GitHub. Existing keys are kept: losing a key makes that
# site's encrypted contact details unreadable.
#
#   infra/scripts/bootstrap-secrets.sh <key-vault-name> site_afterh site_hfriends site_datealittle
set -euo pipefail
KV="${1:?Key Vault name}"; shift
SITES=("__admin__" "$@")

# Only start from {} when the secret truly doesn't exist. Any other error (no access yet, network)
# stops here, so existing keys are never replaced.
if ! current="$(az keyvault secret show --vault-name "$KV" --name site-keys-json --query value -o tsv 2>/tmp/kv-err)"; then
  if grep -q "SecretNotFound" /tmp/kv-err; then current='{}'; else cat /tmp/kv-err >&2; exit 1; fi
fi
updated="$(python3 - "$current" "${SITES[@]}" <<'PY'
import json, secrets, sys
keys = json.loads(sys.argv[1] or '{}')
added = [s for s in sys.argv[2:] if s not in keys]
for s in added: keys[s] = secrets.token_hex(32)
print(json.dumps(keys))
print('added: ' + (', '.join(added) or 'none'), file=sys.stderr)
PY
)"
az keyvault secret set --vault-name "$KV" --name site-keys-json --value "$updated" --output none
echo "site-keys-json updated in $KV"
