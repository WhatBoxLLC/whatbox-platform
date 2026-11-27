// Every environment-specific value comes from env vars, so the same image runs locally and in Azure.
export const config = {
  port: Number(process.env.PORT ?? 4100),
  pgServer: process.env.PG_SERVER_URL ?? 'postgres://postgres@localhost:5432',
  pgSsl: process.env.PG_SSL === 'true',
  db: process.env.AI_DB ?? 'whatbox_ai',
  engine: (process.env.AI_ENGINE ?? 'stub') as 'stub' | 'azure',
  contentSafetyEndpoint: process.env.CONTENT_SAFETY_ENDPOINT ?? '',
  contentSafetyKey: process.env.CONTENT_SAFETY_KEY ?? '',
  visionEndpoint: process.env.VISION_ENDPOINT ?? '',
  visionKey: process.env.VISION_KEY ?? '',
  // Platform Admin uses this to list callers and add new ones. From Key Vault in Azure.
  adminKey: process.env.AI_ADMIN_KEY ?? '',
  // The dating platform's own key. Registered as the "whatbox-dating" caller (not billed) on start.
  platformKey: process.env.PLATFORM_CALLER_KEY ?? '',
};
