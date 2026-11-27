// All environment-specific values come from env vars, so the same build runs on a laptop,
// in Nichesoft's Azure subscription for dev, and in WhatBox's own subscription for production.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Server URL without a database name, e.g. postgres://user:pass@host:5432
  pgServer: process.env.PG_SERVER_URL ?? 'postgres://postgres@localhost:5432',
  controlDb: process.env.CONTROL_DB ?? 'whatbox_control',
  pgSsl: process.env.PG_SSL === 'true',
  // Dev only: per-site keys are derived from this. In Azure, set SITE_KEYS_JSON from Key Vault instead.
  devMasterKey: process.env.DEV_MASTER_KEY ?? '',
  siteKeysJson: process.env.SITE_KEYS_JSON ?? '', // {"site_afterh":"<64 hex chars>", ...}
  exposeDevCodes: process.env.EXPOSE_DEV_CODES === 'true',
  rateLimitScale: Number(process.env.RATE_LIMIT_SCALE ?? 1), // dev/test only
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  cleanupMinutes: Number(process.env.CLEANUP_MINUTES ?? 10), // 0 turns the in-process job off
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:3000').split(','),
  notifier: process.env.NOTIFIER ?? 'console', // console | acs (Azure Communication Services)
  acsConnectionString: process.env.ACS_CONNECTION_STRING ?? '',
  acsEmailFromJson: process.env.ACS_EMAIL_FROM_JSON ?? '', // {"site_afterh":"DoNotReply@mail.afterh.com","*":"..."}
  acsSmsFromJson: process.env.ACS_SMS_FROM_JSON ?? '', // {"*":"+18005550100"}
  push: process.env.PUSH ?? 'none', // none | expo
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN ?? '',
  oauthClientsJson: process.env.OAUTH_CLIENTS_JSON ?? '', // per-site Apple / Google client IDs
  // Photos: local (dev disk), azure (Blob, container per site) or inline (prototype data URIs only)
  photoStore: (process.env.PHOTO_STORE ?? 'local') as 'local' | 'azure' | 'inline',
  photoDir: process.env.PHOTO_DIR ?? './.data/photos',
  publicApiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  fileUrlSecret: process.env.FILE_URL_SECRET ?? '',
  azureStorageAccount: process.env.AZURE_STORAGE_ACCOUNT ?? '',
  azureStorageKey: process.env.AZURE_STORAGE_KEY ?? '',
  paypalJson: process.env.PAYPAL_JSON ?? '', // per-site PayPal REST credentials (from Key Vault)
  paymentsStub: process.env.PAYMENTS_STUB === 'true', // dev only: pretend processor with a /dev/checkout page
  allowSelfServeTier: process.env.ALLOW_SELF_SERVE_TIER === 'true', // dev only: switch tier without paying
  azureStorageJson: process.env.AZURE_STORAGE_JSON ?? '', // optional storage account per site
};

export function dbUrl(dbName: string) {
  const u = new URL(config.pgServer);
  u.pathname = '/' + dbName;
  return u.toString();
}
