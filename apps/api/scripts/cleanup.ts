// One-off housekeeping run, e.g. from an Azure Container Apps scheduled job.
import { runCleanupOnce } from '../src/cleanup';
import { closePools, createPlatform } from '../src/db';

(async () => {
  const { platform } = createPlatform();
  console.log('cleanup', await runCleanupOnce(platform));
  await closePools();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
