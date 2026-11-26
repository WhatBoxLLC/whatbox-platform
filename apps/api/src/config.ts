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
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:3000').split(','),
  notifier: process.env.NOTIFIER ?? 'console', // console | acs (Azure Communication Services)
  // Photos: local (dev disk), azure (Blob, container per site) or inline (prototype data URIs only)
  photoStore: (process.env.PHOTO_STORE ?? 'local') as 'local' | 'azure' | 'inline',
  photoDir: process.env.PHOTO_DIR ?? './.data/photos',
  publicApiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  fileUrlSecret: process.env.FILE_URL_SECRET ?? '',
  azureStorageAccount: process.env.AZURE_STORAGE_ACCOUNT ?? '',
  azureStorageKey: process.env.AZURE_STORAGE_KEY ?? '',
  azureStorageJson: process.env.AZURE_STORAGE_JSON ?? '', // optional storage account per site
};

export function dbUrl(dbName: string) {
  const u = new URL(config.pgServer);
  u.pathname = '/' + dbName;
  return u.toString();
}
