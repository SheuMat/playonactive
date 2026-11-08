// Local preview with working booking APIs: node _build/dev-server.mjs [port]
// Uses an in-memory store and captures emails instead of sending them
// (view them at /__emails). Nothing real is booked or sent.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8911);

process.env.RESEND_API_KEY ||= 're_local_dev';
process.env.EMAIL_TO ||= 'owner@playonactive.co.uk';
process.env.EMAIL_FROM ||= 'PlayOn Active <hello@playonactive.co.uk>';
process.env.SITE_URL = `http://localhost:${PORT}`;
globalThis.__poaMemStore = new Map();

const emails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    const m = JSON.parse(opts.body);
    emails.unshift({ ...m, at: new Date().toISOString() });
    console.log(`  ✉  ${m.to.join(', ')}: ${m.subject}`);
    return new Response(JSON.stringify({ id: 'local' }), { status: 200 });
  }
  return realFetch(url, opts);
};

const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

async function api(req, res, name) {
  let mod;
  try { mod = await import(path.join(ROOT, 'api', `${name}.js`)); } catch { res.writeHead(404); return res.end('no such api'); }
  const handler = mod[req.method];
  if (!handler) { res.writeHead(405); return res.end(); }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  const out = await handler(request);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (p.startsWith('/api/')) return await api(req, res, p.slice(5).replace(/\/$/, ''));
    if (p === '/__emails') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset=utf-8><title>Emails</title><body style="font-family:sans-serif;max-width:760px;margin:20px auto">
        <h1>Captured emails (${emails.length})</h1>${emails.map((m, i) => `<details ${i ? '' : 'open'} style="margin:10px 0;border:1px solid #ddd;padding:10px"><summary><b>${m.subject}</b> → ${m.to.join(', ')}</summary>${m.html}</details>`).join('')}`);
    }
    const r = vercel.redirects.find((x) => x.source === p);
    if (r) { res.writeHead(307, { Location: r.destination + url.search }); return res.end(); }
    let file = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT) || /\/(_src|_build|api|\.git)\b/.test(p)) { res.writeHead(404); return res.end(); }
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file += '.html'; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(err);
    res.writeHead(err.code === 'ENOENT' ? 404 : 500);
    res.end(err.code === 'ENOENT' ? 'Not found' : 'Error');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`PlayOn Active dev server: http://localhost:${PORT}`));
