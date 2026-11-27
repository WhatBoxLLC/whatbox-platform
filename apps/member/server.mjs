// Serves the member web app (Expo static export) in its container. Any path that isn't a file
// gets index.html so app routes like /messages/123 work on reload.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || './dist');
const port = Number(process.argv[3] || process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()', 'Strict-Transport-Security': 'max-age=31536000',
};

function file(p) { try { const s = statSync(p); return s.isFile() ? s : null; } catch { return null; } }

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, HEADERS).end('ok'); return; }
  let safe;
  try { safe = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  let p = resolve(join(root, safe));
  if (p !== root && !p.startsWith(root + sep)) { res.writeHead(404, HEADERS).end(); return; }
  let st = file(p);
  if (!st) { p = join(p, 'index.html'); st = file(p); }
  if (!st) { p = join(root, 'index.html'); st = file(p); }
  if (!st) { res.writeHead(404, HEADERS).end(); return; }
  const hashed = p.includes('/_expo/') || p.includes('/assets/');
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(p).pipe(res);
}).listen(port, () => console.log(`member app on :${port}`));
