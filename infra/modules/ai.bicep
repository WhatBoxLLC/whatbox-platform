// WhatBox AI: one shared photo check service for every WhatBox site and app.
// Adult content: Azure AI Content Safety. Text in photos (phone numbers, handles): Azure AI Vision OCR.
// Photos are analyzed in memory and never stored. Its own database (whatbox_ai) holds only callers
// and counts. Called from main.bicep, but it only needs an existing Container Apps environment,
// registry, identity and Key Vault, so it can move to its own resource group later unchanged.

param name string // e.g. whatbox-dev
param location string
@description('Region for the two Azure AI accounts. Content Safety and Image Analysis 4.0 (OCR) are both offered in East US.')
param aiLocation string = 'eastus'
param tags object
param prod bool
param deployApps bool
param imageTag string
param suffix string
param caeId string
param caeDomain string
param identityId string
param acrServer string
param kvName string

@description('Free tiers (5,000 photos a month each) for dev. Azure allows one free account of each kind per subscription.')
param useFreeTier bool = !prod

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: kvName }

resource contentSafety 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: '${name}-safety-${suffix}'
  location: aiLocation
  tags: tags
  kind: 'ContentSafety'
  sku: { name: useFreeTier ? 'F0' : 'S0' }
  properties: { customSubDomainName: '${name}-safety-${suffix}', publicNetworkAccess: 'Enabled' }
}

resource vision 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: '${name}-vision-${suffix}'
  location: aiLocation
  tags: tags
  kind: 'ComputerVision'
  sku: { name: useFreeTier ? 'F0' : 'S1' }
  properties: { customSubDomainName: '${name}-vision-${suffix}', publicNetworkAccess: 'Enabled' }
}

resource csKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'ai-content-safety-key'
  properties: { value: contentSafety.listKeys().key1 }
}

resource visionKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'ai-vision-key'
  properties: { value: vision.listKeys().key1 }
}

var kvUri = kv.properties.vaultUri
// ai-admin-key and ai-platform-key are random values that the deploy workflow creates in Key Vault
// (infra/scripts/bootstrap-ai-keys.sh) before this runs. They never pass through GitHub.
var secrets = [
  { name: 'pg-server-url', keyVaultUrl: '${kvUri}secrets/pg-server-url', identity: identityId }
  { name: 'content-safety-key', keyVaultUrl: '${kvUri}secrets/ai-content-safety-key', identity: identityId }
  { name: 'vision-key', keyVaultUrl: '${kvUri}secrets/ai-vision-key', identity: identityId }
  { name: 'ai-admin-key', keyVaultUrl: '${kvUri}secrets/ai-admin-key', identity: identityId }
  { name: 'ai-platform-key', keyVaultUrl: '${kvUri}secrets/ai-platform-key', identity: identityId }
]

resource ai 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: '${name}-ai'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  dependsOn: [csKey, visionKey]
  properties: {
    managedEnvironmentId: caeId
    configuration: {
      // Public HTTPS so apps hosted anywhere can call it; every call needs a key.
      ingress: { external: true, targetPort: 4100, transport: 'auto', allowInsecure: false }
      registries: [ { server: acrServer, identity: identityId } ]
      secrets: secrets
    }
    template: {
      containers: [
        {
          name: 'ai'
          image: '${acrServer}/whatbox-ai:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '4100' }
            { name: 'PG_SERVER_URL', secretRef: 'pg-server-url' }
            { name: 'PG_SSL', value: 'true' }
            { name: 'AI_ENGINE', value: 'azure' }
            { name: 'CONTENT_SAFETY_ENDPOINT', value: contentSafety.properties.endpoint }
            { name: 'CONTENT_SAFETY_KEY', secretRef: 'content-safety-key' }
            { name: 'VISION_ENDPOINT', value: vision.properties.endpoint }
            { name: 'VISION_KEY', secretRef: 'vision-key' }
            { name: 'AI_ADMIN_KEY', secretRef: 'ai-admin-key' }
            { name: 'PLATFORM_CALLER_KEY', secretRef: 'ai-platform-key' }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 4100 }, periodSeconds: 30, failureThreshold: 3 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 4100 }, periodSeconds: 10 }
          ]
        }
      ]
      // Dev scales to zero when idle (the first photo after a quiet spell waits a few seconds).
      scale: { minReplicas: prod ? 1 : 0, maxReplicas: prod ? 4 : 1, rules: [ { name: 'http', http: { metadata: { concurrentRequests: '30' } } } ] }
    }
  }
}

output url string = 'https://${name}-ai.${caeDomain}'
