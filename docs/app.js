import { CATS, PRESETS, REPEATS, CLAUDE, apply, emptyState, uid, occurrences, filterTasks, toICS, parseAny,
  localISO, dayKey, pad } from './cal.js';

const $ = s => document.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k.startsWith('on') ? e.addEventListener(k.slice(2), v) : k === 'style' ? e.style.cssText = v : e.setAttribute(k, v);
  e.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));
  return e;
};
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
             set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const catVars = c => `--c:var(--${c});--ci:var(--${c}-i)`;
const fmtT = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + m % 60 + ' min' : ''}` : `${m} min`;
const rel = ms => { const m = Math.round(ms / 60e3); if (m < 60) return `${m} min`; const hh = Math.floor(m / 60); return hh < 48 ? `${hh} h ${m % 60} min` : `${Math.floor(hh / 24)} d ${hh % 24} h`; };

// ---------- store: server API when present, otherwise localStorage
let state = emptyState(), server = false;
const me = () => ($('#me').value.trim() || 'okänd');

async function load() {
  if (!location.hostname.endsWith('github.io')) try {
    const r = await fetch('api/state', { cache: 'no-store' });
    if (r.ok && r.headers.get('content-type')?.includes('json')) { state = await r.json(); server = true; return; }
  } catch {}
  state = ls.get('ac.state', emptyState());
}
async function op(o) {
  o = { ...o, by: me() };
  if (server) {
    try {
      const r = await fetch('api/op', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
      if (r.ok) { state = await r.json(); return render(); }
    } catch {}
    toast('Servern svarar inte — försök igen');
    return;
  }
  apply(state, o); ls.set('ac.state', state); render();
}

// ---------- filters
let cats = ls.get('ac.cats', Object.keys(CATS));
const qc = new URLSearchParams(location.search).get('cat');
if (qc) cats = qc.split(',').filter(c => CATS[c]);
let days = 7;
const activeCats = () => cats.length === Object.keys(CATS).length ? null : cats;

// ---------- render
function render() {
  renderFilters(); renderAgenda(); renderClaude(); renderLog(); renderNext();
  $('#mode').textContent = server ? '● delad' : '○ lokal';
  $('#mode').title = server ? 'Synkas via servern på ditt nätverk' : 'Sparas bara i den här webbläsaren';
  $('#calHint').textContent = server
    ? `Prenumeration följer filtret (${activeCats() ? activeCats().map(c => CATS[c].name).join(', ') : 'alla'}) och uppdateras var 15:e minut.`
    : 'Lokalt läge: dela/ladda ner fungerar. Prenumeration kräver servern (just run).';
}

function renderFilters() {
  const all = !activeCats();
  $('#filters').replaceChildren(
    h('button', { class: 'chip' + (all ? '' : ' off'), style: '--c:var(--ink);--ci:var(--bg)', type: 'button',
      onclick: () => { cats = Object.keys(CATS); ls.set('ac.cats', cats); render(); } }, 'Alla'),
    ...Object.entries(CATS).map(([k, c]) => h('button', {
      class: 'chip' + (cats.includes(k) && !all ? '' : all ? '' : ' off'), style: catVars(k), type: 'button', 'aria-pressed': String(cats.includes(k)),
      onclick: () => { cats = all ? [k] : cats.includes(k) ? cats.filter(x => x !== k) : [...cats, k]; if (!cats.length) cats = Object.keys(CATS); ls.set('ac.cats', cats); render(); },
    }, c.name)));
}

function renderAgenda() {
  const now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getTime() + days * 864e5);
  const occ = occurrences(state.tasks, from, to, activeCats());
  const box = $('#agenda'); box.replaceChildren();
  if (!occ.length) { box.append(h('div', { class: 'empty' }, 'Inget planerat. Tryck på ett snabbval ↑')); return; }
  const byDay = Map.groupBy ? Map.groupBy(occ, o => o.key) : occ.reduce((m, o) => m.set(o.key, [...(m.get(o.key) || []), o]), new Map());
  const today = dayKey(now), tomorrow = dayKey(new Date(now.getTime() + 864e5));
  for (const [key, list] of byDay) {
    const d = list[0].at;
    const name = key === today ? 'Idag' : key === tomorrow ? 'Imorgon' : d.toLocaleDateString('sv-SE', { weekday: 'long' });
    box.append(h('div', { class: 'day' },
      h('h3', {}, name, h('span', {}, d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }))),
      list.map(o => item(o, now))));
  }
}

function item({ t, at, key }, now) {
  const done = t.done?.includes(key);
  const rep = REPEATS.find(r => r[0] === t.rrule)?.[1] || (t.rrule ? 'upprepas' : '');
  const meta = [CATS[t.cat].name, t.dur ? fmtDur(t.dur) : null, rep && t.rrule ? '↻ ' + rep.toLowerCase() : null, t.alarm !== null ? '🔔' + (t.alarm ? ` ${t.alarm} min innan` : '') : null].filter(Boolean).join(' · ');
  return h('div', { class: 'item' + (done ? ' done' : ''), style: catVars(t.cat) + (at < now && !done && at.getTime() + t.dur * 60e3 < now ? ';opacity:.7' : '') },
    h('div', { class: 'time' }, fmtT(at)),
    h('div', { style: 'min-width:0' }, h('div', { class: 'tt', role: 'button', tabindex: '0', onclick: () => openEdit(t), onkeydown: e => e.key === 'Enter' && openEdit(t) }, t.title), h('div', { class: 'meta' }, meta)),
    h('div', { class: 'acts' },
      t.dur ? h('button', { type: 'button', title: 'Starta timer', 'aria-label': 'Starta timer för ' + t.title, onclick: () => startTimer(t.dur, t.title, t.cat) }, '▶') : null,
      h('button', { type: 'button', title: done ? 'Ångra' : 'Klar', 'aria-label': (done ? 'Ångra ' : 'Klarmarkera ') + t.title, onclick: () => op({ type: 'done', id: t.id, date: key }) }, done ? '↺' : '✓')));
}

function renderClaude() {
  const now = Date.now();
  $('#claude').replaceChildren(...Object.entries(CLAUDE).map(([win, w]) => {
    const c = state.claude?.[win];
    const reset = c ? Date.parse(c.start) + w.ms : 0;
    const live = c && reset > now;
    return h('div', { class: 'clrow' },
      h('b', {}, win === 'h5' ? '5 h' : '7 dagar'),
      h('div', { class: 'row' }, w.steps.map(p => h('button', { type: 'button', class: live && c.pct === p ? 'on' : '', onclick: () => op({ type: 'claude', win, pct: p }) }, p + '%'))),
      live ? h('div', { class: 'bar' }, h('i', { style: `width:${c.pct}%` })) : null,
      h('div', { class: 'clinfo' }, live
        ? [`återställs ${new Date(reset).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · om ${rel(reset - now)} · `,
           h('label', { style: 'display:inline-flex;gap:4px;align-items:center;font-size:13px' }, 'start',
             h('input', { type: 'datetime-local', value: localISO(new Date(c.start)), 'aria-label': 'Fönstrets start',
               onchange: e => e.target.value && op({ type: 'claude', win, pct: c.pct, start: new Date(e.target.value).toISOString() }) }))]
        : c ? `senast ${c.pct}% — fönstret har återställts` : 'Ingen nivå noterad'));
  }));
}

function renderLog() {
  $('#logCount').textContent = state.log.length ? `${state.log.length} ändringar` : '';
  $('#log').replaceChildren(...state.log.slice(0, 120).map(l => h('li', {},
    h('time', {}, new Date(l.at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    h('b', {}, l.by), ' ', l.type, ' ', h('span', { style: 'font-weight:700' }, l.title), l.detail ? h('span', { class: 'd' }, l.detail) : null)));
  if (!state.log.length) $('#log').append(h('li', { class: 'muted' }, 'Inga ändringar ännu.'));
}

function nextAlarm() {
  const now = new Date();
  return occurrences(state.tasks, now, new Date(now.getTime() + 8 * 864e5))
    .filter(o => o.t.alarm !== null && !o.t.done?.includes(o.key) && o.at.getTime() - o.t.alarm * 60e3 > now)[0];
}
function renderNext() {
  const n = nextAlarm(), el = $('#next');
  el.hidden = !n;
  if (!n) return;
  const ring = new Date(n.at.getTime() - n.t.alarm * 60e3);
  el.style.cssText = catVars(n.t.cat) + ';background:var(--c);color:var(--ci)';
  el.replaceChildren('⏰ ', h('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, n.t.title), h('span', {}, `${dayKey(ring) === dayKey(new Date()) ? '' : ring.toLocaleDateString('sv-SE', { weekday: 'short' }) + ' '}${fmtT(ring)}`));
}

// ---------- presets & edit dialog
function nextSlot() { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() < 30 ? 30 : 60); return localISO(d); }

$('#presets').append(...PRESETS.map(p => h('button', { class: 'chip', type: 'button', style: catVars(p.cat), onclick: () => openEdit({ ...p, alarm: p.title === 'Väckning' ? 0 : 5 }) }, p.title)));
$('#addFree').onclick = () => openEdit({ title: '', cat: 'privat', dur: 25, rrule: '', alarm: 5 });
$('#rrule').append(...REPEATS.map(([v, l]) => h('option', { value: v }, l)));
$('#catpick').append(...Object.entries(CATS).map(([k, c]) => h('label', { style: catVars(k) }, h('input', { type: 'radio', name: 'cat', value: k }), h('span', {}, c.name))));

let editing = null;
function openEdit(t) {
  editing = t.id ? t : { ...t, id: uid(), start: t.start || nextSlot() };
  const f = $('#editForm');
  $('#editH').textContent = t.id ? 'Ändra' : 'Ny syssla';
  f.title.value = editing.title; f.start.value = editing.start; f.dur.value = editing.dur ?? 0;
  f.rrule.value = editing.rrule || ''; f.alarm.value = editing.alarm ?? ''; f.note.value = editing.note || '';
  f.querySelector(`[name=cat][value=${editing.cat}]`).checked = true;
  $('#editDel').hidden = !t.id;
  $('#edit').showModal();
}
$('#edit').addEventListener('close', () => {
  if ($('#edit').returnValue !== 'ok' || !editing) return;
  const f = $('#editForm');
  op({ type: 'upsert', task: { ...editing, title: f.title.value.trim(), cat: f.cat.value, start: f.start.value, dur: +f.dur.value || 0,
    rrule: f.rrule.value, alarm: f.alarm.value === '' ? null : +f.alarm.value, note: f.note.value } });
  toast('Sparat');
});
$('#editDel').onclick = () => { op({ type: 'remove', id: editing.id }); editing = null; $('#edit').close(); toast('Borttaget'); };

// ---------- timer (Time Timer-style shrinking wedge)
let timer = ls.get('ac.timer', { total: 25 * 60e3, left: 25 * 60e3, end: 0, title: '', cat: '' });
let wake = null;
$('#mins').append(...[5, 10, 15, 25, 45, 60, 90].map(m => h('button', { type: 'button', onclick: () => setTimer(m, '', '') }, m)));
function setTimer(m, title, cat) { timer = { total: m * 60e3, left: m * 60e3, end: 0, title, cat }; ls.set('ac.timer', timer); tick(); }
function startTimer(m, title, cat) { setTimer(m, title, cat); toggleTimer(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function toggleTimer() {
  unlockAudio();
  if (timer.end) { timer.left = Math.max(0, timer.end - Date.now()); timer.end = 0; wake?.release?.(); }
  else { if (timer.left <= 0) timer.left = timer.total; timer.end = Date.now() + timer.left; try { wake = await navigator.wakeLock?.request('screen'); } catch {} }
  ls.set('ac.timer', timer); tick();
}
$('#tGo').onclick = toggleTimer;
$('#tReset').onclick = () => setTimer(timer.total / 60e3, timer.title, timer.cat);
function tick() {
  const left = timer.end ? Math.max(0, timer.end - Date.now()) : timer.left;
  const s = Math.ceil(left / 1000);
  $('#tLeft').textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
  $('#tLabel').textContent = timer.title || '';
  const dial = $('#dial');
  dial.style.setProperty('--p', Math.min(1, left / Math.max(timer.total, 1)));
  const tc = timer.cat || 'jobb';
  dial.style.setProperty('--tc', `color-mix(in srgb, var(--${tc}-i) 40%, var(--${tc}))`);
  dial.style.opacity = timer.cat ? 1 : 1;
  $('#tGo').textContent = timer.end ? 'Paus' : left < timer.total && left > 0 ? 'Fortsätt' : 'Starta';
  $('#tGo').style.cssText = timer.cat ? catVars(timer.cat) + ';background:var(--c);color:var(--ci)' : '';
  document.title = timer.end ? `${$('#tLeft').textContent} · ${timer.title || 'Timer'}` : 'Alarmclock';
  if (timer.end && left <= 0) {
    timer.end = 0; timer.left = 0; ls.set('ac.timer', timer); wake?.release?.();
    ring({ title: (timer.title || 'Timer') + ' klar', cat: timer.cat || 'jobb', when: 'Tiden är ute' });
  }
}

// ---------- alarms
let actx = null, beeper = null, ringing = null;
function unlockAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  actx?.state === 'suspended' && actx.resume();
}
addEventListener('pointerdown', unlockAudio, { once: true });
function chime() {
  if (!actx) return;
  const t0 = actx.currentTime;
  [659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + i * .18); g.gain.linearRampToValueAtTime(.25, t0 + i * .18 + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + i * .18 + .9);
    o.connect(g).connect(actx.destination); o.start(t0 + i * .18); o.stop(t0 + i * .18 + 1);
  });
}
function ring(a) {
  ringing = a;
  const el = $('#alarm');
  el.style.cssText = catVars(a.cat); el.classList.add('on');
  $('#alarmTitle').textContent = a.title; $('#alarmWhen').textContent = a.when; $('#alarmCat').textContent = CATS[a.cat]?.name || '';
  chime(); clearInterval(beeper); beeper = setInterval(chime, 2200);
  navigator.vibrate?.([300, 150, 300, 150, 600]);
  if (window.Notification?.permission === 'granted' && document.hidden) new Notification('⏰ ' + a.title, { body: a.when, tag: a.key });
  $('#stop').focus();
}
function stopRing() { clearInterval(beeper); $('#alarm').classList.remove('on'); }
$('#stop').onclick = () => { if (ringing?.id && ringing.date) op({ type: 'done', id: ringing.id, date: ringing.date }); stopRing(); ringing = null; };
$('#snooze').onclick = () => { const s = ls.get('ac.snooze', []); s.push({ ...ringing, at: Date.now() + 5 * 60e3 }); ls.set('ac.snooze', s); stopRing(); toast('Snooze 5 min'); };

function checkAlarms() {
  const now = Date.now(), fired = ls.get('ac.fired', {});
  const due = occurrences(state.tasks, new Date(now - 864e5), new Date(now + 864e5)).filter(o => o.t.alarm !== null && !o.t.done?.includes(o.key));
  for (const o of due) {
    const at = o.at.getTime() - o.t.alarm * 60e3, k = o.t.id + '|' + localISO(o.at);
    if (at <= now && at > now - 3 * 60e3 && !fired[k]) {
      fired[k] = now;
      if (!$('#alarm').classList.contains('on')) ring({ key: k, id: o.t.id, date: o.key, title: o.t.title, cat: o.t.cat, when: o.t.alarm ? `Om ${o.t.alarm} min · ${fmtT(o.at)}` : fmtT(o.at) });
    }
  }
  const s = ls.get('ac.snooze', []), keep = [];
  for (const a of s) a.at <= now && !$('#alarm').classList.contains('on') ? ring({ ...a, when: 'Snooze' }) : keep.push(a);
  if (keep.length !== s.length) ls.set('ac.snooze', keep);
  for (const k in fired) if (fired[k] < now - 2 * 864e5) delete fired[k];
  ls.set('ac.fired', fired);
}

// ---------- calendar: download / share / subscribe / merge
const visible = () => filterTasks(state.tasks, activeCats(), null);
const calName = () => ['Alarmclock', ...(activeCats() || []).map(c => CATS[c].name)].join(' · ');
const qs = () => activeCats() ? '?cat=' + activeCats().join(',') : '';
function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
$('#dlIcs').onclick = () => download('alarmclock.ics', toICS(visible(), calName()), 'text/calendar');
$('#dlJson').onclick = () => download('alarmclock.json', JSON.stringify({ name: calName(), exported: new Date().toISOString(), tasks: visible() }, null, 1), 'application/json');

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pack(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (!window.CompressionStream) return 'j' + b64u(raw);
  return 'z' + b64u(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}
async function unpack(s) {
  const bytes = unb64u(s.slice(1));
  const text = s[0] === 'z' ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(bytes);
  return JSON.parse(text);
}
async function shareURL() {
  const base = location.origin + location.pathname;
  if (server) return base + qs();
  const tasks = Object.values(visible()).map(({ done, created, ...t }) => t);
  return base + '#d=' + await pack({ n: calName(), by: me(), tasks });
}
$('#share').onclick = async () => {
  const url = await shareURL();
  if (navigator.share) { try { await navigator.share({ title: calName(), url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  await copy(url, 'Länk kopierad');
};
$('#sub').onclick = async () => {
  if (!server) return toast('Prenumeration kräver servern — kör just run på datorn');
  const url = location.origin.replace(/^https?:/, 'webcal:') + location.pathname.replace(/[^/]*$/, '') + 'cal.ics' + qs();
  await copy(url.replace(/^webcal:/, 'http:'), 'Prenumerationslänk kopierad');
  location.href = url;
};
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { prompt('Kopiera:', text); }
}

$('#merge').onclick = () => { $('#mergeForm').reset(); $('#mergeD').showModal(); };
$('#mergeD').addEventListener('close', async () => {
  if ($('#mergeD').returnValue !== 'ok') return;
  const f = $('#mergeForm');
  try {
    if (f.file.files[0]) {
      const text = await f.file.files[0].text();
      await mergeTasks(parseAny(text), f.file.files[0].name, text);
    } else if (f.url.value.trim()) {
      const u = f.url.value.trim(), m = u.match(/#d=([\w-]+)/);
      if (m) { const d = await unpack(m[1]); await mergeTasks(d.tasks, `delad länk från ${d.by || 'okänd'}`); }
      else if (server) await serverMerge({ url: u });
      else { const text = await (await fetch(u.replace(/^webcal:/, 'https:'))).text(); await mergeTasks(parseAny(text), u); }
    }
  } catch (e) { toast('Kunde inte slå ihop: ' + e.message); }
});
async function serverMerge(body) {
  const r = await fetch('api/merge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, by: me() }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error); state = j; render(); toast(state.log[0]?.detail || 'Ihopslaget');
}
async function mergeTasks(tasks, source) {
  if (server) return serverMerge({ json: JSON.stringify(tasks), source });
  await op({ type: 'merge', tasks, source }); toast(state.log[0]?.detail || 'Ihopslaget');
}

async function checkShared() {
  const m = location.hash.match(/#d=([\w-]+)/);
  if (!m) return;
  try {
    const d = await unpack(m[1]);
    $('#sharedText').textContent = `${d.by || 'Någon'} delade ”${d.n || 'kalender'}” med ${d.tasks.length} händelser.`;
    $('#sharedBanner').classList.add('on');
    $('#sharedYes').onclick = async () => { await mergeTasks(d.tasks, `delad länk från ${d.by || 'okänd'}`); clearShared(); };
    $('#sharedNo').onclick = clearShared;
  } catch { toast('Den delade länken gick inte att läsa'); }
}
function clearShared() { $('#sharedBanner').classList.remove('on'); history.replaceState(null, '', location.pathname + location.search); }

// ---------- misc
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
$('#range').onclick = () => { days = days === 7 ? 30 : days === 30 ? 1 : 7; $('#range').textContent = days === 1 ? 'Idag' : days + ' dagar'; renderAgenda(); };
$('#me').value = ls.get('ac.me', '');
$('#me').addEventListener('change', () => { ls.set('ac.me', $('#me').value.trim()); toast('Hej ' + me() + '!'); });
$('#me').addEventListener('focus', () => { if (window.Notification?.permission === 'default') Notification.requestPermission(); }, { once: true });

function clock() {
  const d = new Date();
  $('#clock').textContent = fmtT(d);
  $('#date').textContent = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
}

await load();
render(); clock(); tick(); checkShared();
addEventListener('hashchange', checkShared);
setInterval(tick, 250);
setInterval(() => { clock(); checkAlarms(); }, 5000);
setInterval(() => { renderNext(); renderClaude(); }, 60e3);
setInterval(async () => { if (server && !document.hidden && !document.querySelector('dialog[open]')) { await load(); render(); } }, 20e3);
document.addEventListener('visibilitychange', async () => { if (!document.hidden) { await load(); render(); checkAlarms(); } });
