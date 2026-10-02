// LAN server: serves docs/, a shared state with change log, and ICS/JSON feeds.
// Access is limited by network reach — no logins.
import { apply, emptyState, filterTasks, toICS, parseAny, INDEX, CATS } from './docs/cal.js';
import { networkInterfaces } from 'os';

const PORT = +(process.env.PORT || 8787);
const DB = new URL('./data/db.json', import.meta.url).pathname;
const DOCS = new URL('./docs/', import.meta.url).pathname;

let state = emptyState();
try { state = { ...state, ...(await Bun.file(DB).json()) }; } catch {}
let saving: Promise<unknown> = Promise.resolve();
const save = () => (saving = saving.then(() => Bun.write(DB, JSON.stringify(state, null, 1))));

function allowed(ip = '') {
  ip = ip.replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(ip)) return true;
  const [a, b] = ip.split('.').map(Number);
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / Tailscale
  return /^f[cd]|^fe[89ab]/i.test(ip); // IPv6 ULA + link-local
}

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d, null, 1), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
});

function feed(url: URL) {
  const cats = url.searchParams.get('cat')?.split(',').filter(c => c in CATS) || null;
  const by = url.searchParams.get('by') || null;
  return { tasks: filterTasks(state.tasks, cats?.length ? cats : null, by), name: ['Alarmclock', ...(cats || []).map(c => CATS[c].name), by].filter(Boolean).join(' · ') };
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req, srv) {
    const ip = srv.requestIP(req)?.address;
    if (!allowed(ip)) return new Response('Endast lokalt nätverk', { status: 403 });
    const url = new URL(req.url);
    const p = url.pathname;

    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' } });
    if (p === '/index.json') return json({ ...INDEX, server: { lan: lanURLs(), tasks: Object.keys(state.tasks).length } });
    if (p === '/api/state') return json(state);
    if (p === '/api/log') return json(state.log);
    if (p === '/cal.ics') {
      const f = feed(url);
      return new Response(toICS(f.tasks, f.name), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="alarmclock.ics"', 'cache-control': 'no-store' } });
    }
    if (p === '/cal.json') return json({ ...feed(url), exported: new Date().toISOString() });

    if (req.method === 'POST' && p === '/api/op') {
      const op = await req.json().catch(() => null);
      if (!op?.type) return json({ error: 'op.type saknas' }, 400);
      apply(state, { ...op, at: new Date().toISOString() });
      await save();
      return json(state);
    }
    if (req.method === 'POST' && p === '/api/merge') {
      const b = await req.json().catch(() => ({}));
      try {
        let text = b.ics || b.json || '', source = b.source || 'fil';
        if (b.url) {
          const u = String(b.url).replace(/^webcal:/, 'https:');
          text = await (await fetch(u, { signal: AbortSignal.timeout(10e3) })).text();
          source = u;
        }
        apply(state, { type: 'merge', tasks: parseAny(text), source, by: b.by, at: new Date().toISOString() });
        await save();
        return json(state);
      } catch (e) { return json({ error: String(e) }, 400); }
    }

    const file = Bun.file(DOCS + (p === '/' ? 'index.html' : p.slice(1)).replace(/\.\.+/g, ''));
    if (await file.exists()) return new Response(file, { headers: { 'cache-control': 'no-cache' } });
    return new Response('Hittades inte', { status: 404 });
  },
});

function lanURLs() {
  return Object.values(networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i!.address}:${PORT}`);
}

console.log(`alarmclock på http://localhost:${server.port}`);
for (const u of lanURLs()) console.log(`  LAN: ${u}   prenumerera: ${u.replace('http', 'webcal')}/cal.ics`);
