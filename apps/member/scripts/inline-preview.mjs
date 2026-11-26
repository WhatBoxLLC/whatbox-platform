// Turns the Expo web export into one self-contained HTML file for the clickable preview.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const out = path.resolve(process.argv[3] ?? 'preview-dist/index.html');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="icon"[^>]*>/, '');
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>${js}</script>`;
});
html = html.replace('<title>AfterH</title>', '<title>AfterH Prototype</title>\n    <meta name="robots" content="noindex" />');
// Publishing wraps the page in its own document skeleton, so keep only what sits inside head and body.
if (process.argv.includes('--fragment')) {
  const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>|<meta httpEquiv[^>]*>/g, '');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = head + body;
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
