// WhatBox platform on Azure. One resource group per environment (dev, prod), both in
// WhatBox's own Azure account. Nothing here is tied to a subscription, so it moves unchanged.
//
// Deploy in two passes (the GitHub workflow does this):
//   1. deployApps=false  -> registry, Key Vault, Postgres, Storage, Communication Services
//   2. build images into the registry, then deployApps=true -> Container Apps and jobs
// Between the passes the workflow creates any missing per-site encryption keys directly in Key Vault
// (infra/scripts/bootstrap-secrets.sh). They are never passed through this template.

targetScope = 'resourceGroup'

@allowed(['dev', 'prod'])
param env string = 'dev'
param location string = resourceGroup().location
@description('Short prefix for resource names, lowercase letters and digits.')
param prefix string = 'whatbox'

@description('Set false for the first pass, before images exist in the registry.')
param deployApps bool = true
param imageTag string = 'latest'

@description('Object id of the GitHub deploy identity. It may create missing site encryption keys in Key Vault (never read out to GitHub logs).')
param deployerObjectId string = ''

param postgresAdminLogin string = 'whatboxadmin'
@secure()
param postgresAdminPassword string

@description('Per-site PayPal REST credentials JSON. Optional; {} means PayPal is off.')
@secure()
param paypalJson string = '{}'
@description('Per-site Apple / Google sign-in client IDs JSON. Optional.')
@secure()
param oauthClientsJson string = '{}'
@description('Expo push access token. Optional.')
@secure()
param expoAccessToken string = ''
@description('Extra browser origins allowed to call the API (comma-separated). Site domains are allowed automatically.')
param extraCorsOrigins string = ''
@description('SMS sender numbers JSON, e.g. {"*":"+18005550100"}, once a number is bought in Communication Services.')
param acsSmsFromJson string = ''

@description('Custom domains already bound to the public site app, as the deploy workflow reads them back from Azure. Passed in so a redeploy keeps every domain and certificate that infra/scripts/add-domain.sh bound.')
param webCustomDomains array = []
@description('Custom domains already bound to the member app (app.<domain>). Same as webCustomDomains.')
param appCustomDomains array = []

@description('Dev only: email of a person to add as Platform Admin when the demo seed job runs.')
param seedAdminEmail string = ''

var prod = env == 'prod'
var suffix = uniqueString(resourceGroup().id)
var name = '${prefix}-${env}'
var tags = { app: 'whatbox', env: env }

// ---------- Identity used by every container app to read secrets and pull images ----------

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-id'
  location: location
  tags: tags
}

// ---------- Logs ----------

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: prod ? 90 : 30
  }
}

// ---------- Container registry ----------

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: take('${prefix}${env}${suffix}', 50)
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

var acrPullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, identity.id, acrPullRole)
  properties: { roleDefinitionId: acrPullRole, principalId: identity.properties.principalId, principalType: 'ServicePrincipal' }
}

// ---------- Key Vault (RBAC). Encryption keys and connection strings live here only. ----------

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('${prefix}-${env}-${suffix}', 24)
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: prod ? true : null
  }
}

var kvSecretsUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
resource kvRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, identity.id, kvSecretsUserRole)
  properties: { roleDefinitionId: kvSecretsUserRole, principalId: identity.properties.principalId, principalType: 'ServicePrincipal' }
}

var kvSecretsOfficerRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
resource kvDeployer 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerObjectId)) {
  scope: kv
  name: guid(kv.id, deployerObjectId, kvSecretsOfficerRole)
  properties: { roleDefinitionId: kvSecretsOfficerRole, principalId: deployerObjectId, principalType: 'ServicePrincipal' }
}

// ---------- PostgreSQL: one server, a control database plus one database per site ----------

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: '${name}-pg-${suffix}'
  location: location
  tags: tags
  sku: prod ? { name: 'Standard_D2ds_v5', tier: 'GeneralPurpose' } : { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: prod ? 64 : 32, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: prod ? 35 : 7, geoRedundantBackup: prod ? 'Enabled' : 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    // Data is encrypted at rest by Azure; member contact details are also encrypted per site by the API.
    network: { publicNetworkAccess: 'Enabled' }
  }
}

// Container Apps reach Postgres over Azure's network. (For prod, move both into a VNet; see infra/README.md.)
resource pgAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: pg
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource pgTls 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: pg
  name: 'require_secure_transport'
  properties: { value: 'on', source: 'user-override' }
}

resource pgUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'pg-server-url'
  properties: { value: 'postgres://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${pg.properties.fullyQualifiedDomainName}:5432' }
}

// ---------- Photos: Blob storage, one private container per site (created by the API) ----------

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('${prefix}${env}${suffix}', 24)
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: prod ? 'Standard_ZRS' : 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    encryption: { keySource: 'Microsoft.Storage', services: { blob: { enabled: true } } }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 7 }
    // Browsers load photos straight from Blob with short-lived signed URLs.
    cors: { corsRules: [ { allowedOrigins: ['*'], allowedMethods: ['GET', 'HEAD'], allowedHeaders: ['*'], exposedHeaders: [], maxAgeInSeconds: 3600 } ] }
  }
}

resource storageKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'storage-key'
  properties: { value: storage.listKeys().keys[0].value }
}

// ---------- Email and SMS: Azure Communication Services ----------

resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: '${name}-email'
  location: 'global'
  tags: tags
  properties: { dataLocation: 'United States' }
}

// Azure-managed sender domain to start. Add each site's own domain later so codes come from it.
resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: { domainManagement: 'AzureManaged', userEngagementTracking: 'Disabled' }
}

resource acs 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: '${name}-acs-${suffix}'
  location: 'global'
  tags: tags
  properties: { dataLocation: 'United States', linkedDomains: [emailDomain.id] }
}

resource acsSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'acs-connection-string'
  properties: { value: acs.listKeys().primaryConnectionString }
}

resource paypalSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'paypal-json'
  properties: { value: paypalJson }
}

resource oauthSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'oauth-clients-json'
  properties: { value: oauthClientsJson }
}

resource expoSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'expo-access-token'
  properties: { value: empty(expoAccessToken) ? 'none' : expoAccessToken }
}

// ---------- Container Apps ----------

resource cae 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

var registries = [ { server: acr.properties.loginServer, identity: identity.id } ]
var kvUri = kv.properties.vaultUri
var apiSecrets = [
  { name: 'pg-server-url', keyVaultUrl: '${kvUri}secrets/pg-server-url', identity: identity.id }
  { name: 'site-keys-json', keyVaultUrl: '${kvUri}secrets/site-keys-json', identity: identity.id }
  { name: 'storage-key', keyVaultUrl: '${kvUri}secrets/storage-key', identity: identity.id }
  { name: 'acs-connection-string', keyVaultUrl: '${kvUri}secrets/acs-connection-string', identity: identity.id }
  { name: 'paypal-json', keyVaultUrl: '${kvUri}secrets/paypal-json', identity: identity.id }
  { name: 'oauth-clients-json', keyVaultUrl: '${kvUri}secrets/oauth-clients-json', identity: identity.id }
  { name: 'expo-access-token', keyVaultUrl: '${kvUri}secrets/expo-access-token', identity: identity.id }
]
var apiHost = '${name}-api.${cae.properties.defaultDomain}'
var memberHost = '${name}-app.${cae.properties.defaultDomain}'
var apiEnv = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'PORT', value: '4000' }
  { name: 'PG_SERVER_URL', secretRef: 'pg-server-url' }
  { name: 'PG_SSL', value: 'true' }
  { name: 'SITE_KEYS_JSON', secretRef: 'site-keys-json' }
  { name: 'NOTIFIER', value: 'acs' }
  { name: 'ACS_CONNECTION_STRING', secretRef: 'acs-connection-string' }
  { name: 'ACS_EMAIL_FROM_JSON', value: string({ '*': 'DoNotReply@${emailDomain.properties.mailFromSenderDomain}' }) }
  { name: 'ACS_SMS_FROM_JSON', value: acsSmsFromJson }
  { name: 'PHOTO_STORE', value: 'azure' }
  { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
  { name: 'AZURE_STORAGE_KEY', secretRef: 'storage-key' }
  { name: 'PUBLIC_API_URL', value: 'https://${apiHost}' }
  { name: 'PAYPAL_JSON', secretRef: 'paypal-json' }
  { name: 'OAUTH_CLIENTS_JSON', secretRef: 'oauth-clients-json' }
  { name: 'PUSH', value: 'expo' }
  { name: 'EXPO_ACCESS_TOKEN', secretRef: 'expo-access-token' }
  // The member app's default Azure address, for testing before site domains point here.
  { name: 'CORS_ORIGINS', value: join(filter(['https://${memberHost}', extraCorsOrigins], o => !empty(o)), ',') }
  { name: 'TRUST_PROXY_HOPS', value: '1' }
  { name: 'EXPOSE_DEV_CODES', value: 'false' }
  { name: 'CLEANUP_MINUTES', value: '10' }
]

resource api 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: '${name}-api'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull, kvRead]
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      ingress: { external: true, targetPort: 4000, transport: 'auto', allowInsecure: false }
      registries: registries
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acr.properties.loginServer}/whatbox-api:${imageTag}'
          resources: { cpu: json(prod ? '1.0' : '0.5'), memory: prod ? '2Gi' : '1Gi' }
          env: apiEnv
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 4000 }, periodSeconds: 30, failureThreshold: 3 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 4000 }, periodSeconds: 10 }
          ]
        }
      ]
      // Live updates hold connections open, so keep at least one instance warm.
      scale: { minReplicas: 1, maxReplicas: prod ? 6 : 2, rules: [ { name: 'http', http: { metadata: { concurrentRequests: '200' } } } ] }
    }
  }
}

// Applies database schemas to the control DB and every site DB. Started by the deploy workflow.
resource migrate 'Microsoft.App/jobs@2024-03-01' = if (deployApps) {
  name: '${name}-migrate'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull, kvRead]
  properties: {
    environmentId: cae.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: '${acr.properties.loginServer}/whatbox-api:${imageTag}'
          command: ['node', '--import', 'tsx', 'scripts/migrate.ts']
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: apiEnv
        }
      ]
    }
  }
}

// Dev only: loads placeholder demo sites and members. Wipes demo member data each run.
// Started by the deploy workflow only when "Load demo data" is ticked. Never created in prod.
resource seed 'Microsoft.App/jobs@2024-03-01' = if (deployApps && !prod) {
  name: '${name}-seed'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull, kvRead]
  properties: {
    environmentId: cae.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: registries
      secrets: apiSecrets
    }
    template: {
      containers: [
        {
          name: 'seed'
          image: '${acr.properties.loginServer}/whatbox-api:${imageTag}'
          command: ['node', '--import', 'tsx', 'scripts/seed.ts']
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(apiEnv, [
            { name: 'ALLOW_DEMO_SEED', value: 'true' }
            { name: 'SEED_ADMIN_EMAIL', value: seedAdminEmail }
          ])
        }
      ]
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: '${name}-web'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull]
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false, customDomains: webCustomDomains }
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${acr.properties.loginServer}/whatbox-web:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'API_URL', value: 'https://${apiHost}' }
            { name: 'APP_URL', value: 'https://app.{host}' }
            { name: 'DEFAULT_SITE', value: 'afterh' } // used on the default Azure address only
            { name: 'APP_URL_DEFAULT', value: 'https://${memberHost}' }
          ]
        }
      ]
      scale: { minReplicas: prod ? 1 : 0, maxReplicas: prod ? 4 : 1 }
    }
  }
}

resource member 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: '${name}-app'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull]
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      ingress: { external: true, targetPort: 8080, transport: 'auto', allowInsecure: false, customDomains: appCustomDomains }
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'app'
          image: '${acr.properties.loginServer}/whatbox-member:${imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          probes: [ { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30 } ]
        }
      ]
      scale: { minReplicas: prod ? 1 : 0, maxReplicas: prod ? 4 : 1 }
    }
  }
}

// For custom domains: the TXT verification value and the addresses DNS points at on go-live day.
output customDomainVerificationId string = deployApps ? web!.properties.customDomainVerificationId : ''
output staticIp string = cae.properties.staticIp
output webFqdn string = '${name}-web.${cae.properties.defaultDomain}'
output appFqdn string = memberHost
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output keyVaultName string = kv.name
output apiUrl string = 'https://${apiHost}'
output webUrl string = 'https://${name}-web.${cae.properties.defaultDomain}'
output memberAppUrl string = 'https://${memberHost}'
output migrateJobName string = '${name}-migrate'
output emailSender string = 'DoNotReply@${emailDomain.properties.mailFromSenderDomain}'
