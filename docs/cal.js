// Shared calendar logic — runs in the browser and in Bun (server.ts).

export const CATS = {
  hem:       { name: 'Hem',       color: '#bfe3cb', ink: '#2f6b47' },
  arenden:   { name: 'Ärenden',   color: '#ffd5bd', ink: '#9a4f22' },
  manniskor: { name: 'Människor', color: '#f7cfe0', ink: '#93365f' },
  skola:     { name: 'Skola',     color: '#c9def8', ink: '#2c5d8f' },
  jobb:      { name: 'Jobb',      color: '#dcd2f6', ink: '#5a4597' },
  privat:    { name: 'Privat',    color: '#f8e8a8', ink: '#7d6210' },
};

const W = 'FREQ=WEEKLY', W2 = 'FREQ=WEEKLY;INTERVAL=2', D = 'FREQ=DAILY';
export const PRESETS = [
  { title: 'Gym',             cat: 'privat',  dur: 60, rrule: '' },
  { title: 'Handla',          cat: 'arenden', dur: 45, rrule: W },
  { title: 'Sophantering',    cat: 'hem',     dur: 10, rrule: W },
  { title: 'Städ',            cat: 'hem',     dur: 45, rrule: W },
  { title: 'Disk',            cat: 'hem',     dur: 15, rrule: D },
  { title: 'Organisering',    cat: 'hem',     dur: 25, rrule: W },
  { title: 'Tvätt',           cat: 'hem',     dur: 90, rrule: W },
  { title: 'Dammsugning',     cat: 'hem',     dur: 30, rrule: W },
  { title: 'Moppa golv',      cat: 'hem',     dur: 30, rrule: W2 },
  { title: 'Torka ytor',      cat: 'hem',     dur: 15, rrule: W },
  { title: 'Städa badrum',    cat: 'hem',     dur: 30, rrule: W },
  { title: 'Byta sängkläder', cat: 'hem',     dur: 20, rrule: W2 },
  { title: 'Väckning',        cat: 'privat',  dur: 0,  rrule: '' },
];

export const REPEATS = [
  ['', 'Ingen'], [D, 'Varje dag'], [W, 'Varje vecka'], [W2, 'Varannan vecka'], ['FREQ=MONTHLY', 'Varje månad'],
];

export const CLAUDE = {
  h5: { label: '5 timmar', ms: 5 * 3600e3, steps: [25, 50, 75, 100] },
  d7: { label: '7 dagar',  ms: 7 * 864e5,  steps: [50, 100] },
};

export const emptyState = () => ({ tasks: {}, claude: {}, log: [] });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- reducer: every change goes through here, on server and client alike
export function apply(state, op) {
  const at = op.at || new Date().toISOString();
  const by = (op.by || 'okänd').slice(0, 40);
  const log = (type, title, detail = '') => state.log.unshift({ at, by, type, title, detail });

  if (op.type === 'upsert') {
    const prev = state.tasks[op.task.id];
    const t = clean({ ...prev, ...op.task, by, updated: at, created: prev?.created || at });
    state.tasks[t.id] = t;
    log(prev ? 'ändrade' : 'skapade', t.title, diff(prev, t));
  } else if (op.type === 'remove') {
    const t = state.tasks[op.id];
    if (t) { delete state.tasks[op.id]; log('tog bort', t.title); }
  } else if (op.type === 'done') {
    const t = state.tasks[op.id];
    if (t) {
      const set = new Set(t.done || []);
      set.has(op.date) ? set.delete(op.date) : set.add(op.date);
      t.done = [...set].sort().slice(-60);
      log(set.has(op.date) ? 'klarmarkerade' : 'ångrade klar', t.title, op.date);
    }
  } else if (op.type === 'merge') {
    let added = 0, changed = 0;
    for (const raw of op.tasks || []) {
      if (!raw?.title || !raw?.start) continue;
      const t = clean({ ...raw, id: raw.id || uid() });
      const prev = state.tasks[t.id];
      if (prev && (prev.updated || '') >= (t.updated || '')) continue;
      prev ? changed++ : added++;
      state.tasks[t.id] = { ...t, by: t.by || by, created: prev?.created || t.created || at, updated: t.updated || at };
    }
    log('slog ihop', op.source || 'kalender', `+${added} nya, ${changed} uppdaterade`);
  } else if (op.type === 'claude') {
    const w = CLAUDE[op.win];
    if (!w) return state;
    const cur = state.claude[op.win];
    const now = Date.parse(at);
    // keep the running window unless the user moved its start or it has expired
    const start = op.start || (cur && Date.parse(cur.start) + w.ms > now ? cur.start : at);
    state.claude[op.win] = { pct: op.pct, start, at, by };
    const reset = new Date(Date.parse(start) + w.ms);
    state.tasks['claude-' + op.win] = clean({
      id: 'claude-' + op.win, title: `Claude ${w.label} återställs`, cat: 'jobb',
      start: localISO(reset), dur: 0, rrule: '', alarm: 0, by, created: at, updated: at,
      note: `${op.pct}% använt av ${w.label}-gränsen (noterat ${localISO(new Date(at)).replace('T', ' ')} av ${by})`,
    });
    log('Claude-gräns', `${w.label}: ${op.pct}%`, 'återställs ' + localISO(reset).replace('T', ' '));
  }
  state.log = state.log.slice(0, 500);
  return state;
}

function clean(t) {
  return {
    id: String(t.id || uid()).slice(0, 80),
    title: String(t.title || '').slice(0, 120),
    cat: CATS[t.cat] ? t.cat : 'privat',
    start: String(t.start || '').slice(0, 16),
    dur: Math.max(0, Math.min(1440, +t.dur || 0)),
    rrule: String(t.rrule || ''),
    alarm: t.alarm === null || t.alarm === '' || t.alarm === undefined ? null : +t.alarm,
    note: String(t.note || '').slice(0, 500),
    done: Array.isArray(t.done) ? t.done : [],
    by: t.by, created: t.created, updated: t.updated,
  };
}

function diff(a, b) {
  if (!a) return '';
  return ['title', 'cat', 'start', 'dur', 'rrule', 'alarm']
    .filter(k => String(a[k]) !== String(b[k])).map(k => `${k}: ${a[k] ?? '–'} → ${b[k] ?? '–'}`).join(', ');
}

// ---------- time helpers (tasks store local "floating" time: YYYY-MM-DDTHH:MM)
export const pad = n => String(n).padStart(2, '0');
export const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dayKey = d => localISO(d).slice(0, 10);
export const parseLocal = s => { const [a, b = '00:00'] = s.split('T'); const [y, m, d] = a.split('-'); const [h, mi] = b.split(':'); return new Date(+y, m - 1, +d, +h, +mi); };

const rr = s => Object.fromEntries((s || '').split(';').filter(Boolean).map(p => p.split('=')));

// Occurrences of every task between from and to (Dates), sorted.
export function occurrences(tasks, from, to, cats) {
  const out = [];
  for (const t of Object.values(tasks)) {
    if (cats && !cats.includes(t.cat)) continue;
    const base = parseLocal(t.start);
    const r = rr(t.rrule), n = +(r.INTERVAL || 1);
    const until = r.UNTIL ? parseICSDate(r.UNTIL) : null;
    let d = new Date(base), i = 0;
    const step = () => {
      i++;
      if (r.FREQ === 'DAILY') d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * n, base.getHours(), base.getMinutes());
      else if (r.FREQ === 'WEEKLY') d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * 7 * n, base.getHours(), base.getMinutes());
      else if (r.FREQ === 'MONTHLY') d = new Date(base.getFullYear(), base.getMonth() + i * n, base.getDate(), base.getHours(), base.getMinutes());
      else d = null;
    };
    // fast-forward recurring tasks near the window
    if (r.FREQ && d < from) {
      const span = { DAILY: 864e5, WEEKLY: 6048e5, MONTHLY: 28 * 864e5 }[r.FREQ] * n;
      if (span) { i = Math.max(0, Math.floor((from - base) / span) - 2); i--; step(); }
    }
    while (d && d < to && i < 5000) {
      if (until && d > until) break;
      const end = new Date(d.getTime() + t.dur * 60e3);
      if (end >= from || d >= from) out.push({ t, at: new Date(d), key: dayKey(d) });
      step();
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function filterTasks(tasks, cats, by) {
  return Object.fromEntries(Object.entries(tasks).filter(([, t]) =>
    (!cats || cats.includes(t.cat)) && (!by || t.by === by)));
}

// ---------- ICS
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const icsLocal = s => s.replace(/[-:]/g, '') + '00';
const icsUTC = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const fold = l => { let o = ''; while (l.length > 74) { o += l.slice(0, 74) + '\r\n '; l = l.slice(74); } return o + l; };

export function toICS(tasks, name = 'Alarmclock') {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//alarmclock//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(name), 'X-WR-TIMEZONE:Europe/Stockholm', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'];
  for (const t of Object.values(tasks)) {
    const end = localISO(new Date(parseLocal(t.start).getTime() + Math.max(t.dur, 5) * 60e3));
    L.push('BEGIN:VEVENT', 'UID:' + t.id + '@alarmclock', 'DTSTAMP:' + icsUTC(t.updated || Date.now()),
      'LAST-MODIFIED:' + icsUTC(t.updated || Date.now()),
      'DTSTART:' + icsLocal(t.start), 'DTEND:' + icsLocal(end), 'SUMMARY:' + esc(t.title),
      'CATEGORIES:' + esc(CATS[t.cat].name), 'COLOR:' + CATS[t.cat].color,
      'X-ALARMCLOCK-CAT:' + t.cat, 'X-ALARMCLOCK-BY:' + esc(t.by || ''));
    if (t.rrule) L.push('RRULE:' + t.rrule);
    if (t.note) L.push('DESCRIPTION:' + esc(t.note));
    if (t.alarm !== null && t.alarm !== undefined)
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(t.title), `TRIGGER:-PT${t.alarm}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

function parseICSDate(v) {
  const m = v.match(/(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', , z] = m;
  return z ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi)) : new Date(+y, mo - 1, +d, +h, +mi);
}

const NAME2CAT = Object.fromEntries(Object.entries(CATS).map(([k, c]) => [c.name.toLowerCase(), k]));

export function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let ev = null, inAlarm = false;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { alarm: null }; continue; }
    if (line === 'END:VEVENT') { if (ev?.title && ev.start) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (line === 'END:VALARM') { inAlarm = false; continue; }
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase(), val = line.slice(i + 1);
    if (inAlarm) { if (key === 'TRIGGER') { const m = val.match(/-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/); if (m) ev.alarm = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)); } continue; }
    if (key === 'UID') ev.id = val.replace(/@alarmclock$/, '').replace(/[^\w.@-]/g, '').slice(0, 80);
    else if (key === 'SUMMARY') ev.title = unesc(val);
    else if (key === 'DESCRIPTION') ev.note = unesc(val);
    else if (key === 'DTSTART') { const d = parseICSDate(val); if (d) ev.start = localISO(d); }
    else if (key === 'DTEND') ev._end = parseICSDate(val);
    else if (key === 'RRULE') ev.rrule = val.split(';').filter(p => /^(FREQ|INTERVAL|UNTIL)=/.test(p)).join(';');
    else if (key === 'X-ALARMCLOCK-CAT') ev.cat = val;
    else if (key === 'CATEGORIES' && !ev.cat) ev.cat = NAME2CAT[unesc(val).split(',')[0].toLowerCase()];
    else if (key === 'X-ALARMCLOCK-BY') ev.by = unesc(val);
    else if (key === 'LAST-MODIFIED') ev.updated = parseICSDate(val)?.toISOString();
  }
  for (const e of out) { if (e._end) e.dur = Math.round((e._end - parseLocal(e.start)) / 60e3); delete e._end; }
  return out;
}

// Accepts ICS text, a JSON export, or a bare task array.
export function parseAny(text) {
  const s = text.trim();
  if (s.startsWith('BEGIN:VCALENDAR')) return parseICS(s);
  const j = JSON.parse(s);
  return Array.isArray(j) ? j : Object.values(j.tasks || {});
}

// ---------- function index (served as /index.json)
export const INDEX = {
  name: 'alarmclock',
  about: 'ADHD-timer och väckarklocka med färgkodade sysslor, delbar/prenumererbar kalender.',
  categories: Object.fromEntries(Object.entries(CATS).map(([k, c]) => [k, c.name])),
  presets: PRESETS.map(p => p.title).concat('Claude-gräns 5h (25/50/75/100 %)', 'Claude-gräns 7 dagar (50/100 %)'),
  functions: {
    visual_timer: 'Krympande pastellcirkel; starta från en syssla eller fri tid (5–90 min).',
    alarm_clock: 'Stor klocka, larm per händelse (minuter innan), ljud + vibration + notis, snooze 5 min.',
    presets: 'Snabbval med standardlängd och upprepning per syssla.',
    categories: 'Sex fasta kategorier med fasta färger — kan inte väljas om.',
    claude_limit: 'Notera Claude-förbrukning; appen håller starttid, visar återställning och lägger in larm.',
    filter: 'Kategorichips filtrerar agenda, nedladdning, delning och prenumeration (?cat=, ?by=).',
    download: 'Ladda ner filtrerad kalender som .ics eller .json.',
    share: 'Dela länk — servern: live-länk; statisk: data i länken (#d=).',
    subscribe: 'webcal://…/cal.ics prenumeration med VALARM (kräver lokal server).',
    merge: 'Slå ihop .ics/.json-fil, delad länk eller URL; dubbletter avgörs av UID + senast ändrad.',
    history: 'Varje ändring loggas med namn och tid.',
    users: 'Endast namn — ingen inloggning.',
    access: 'Servern svarar bara på loopback, LAN (RFC1918), link-local, ULA och Tailscale (100.64/10).',
  },
  endpoints: {
    'GET /': 'Appen',
    'GET /index.json': 'Detta index',
    'GET /api/state': 'Hela tillståndet {tasks, claude, log}',
    'POST /api/op': 'Applicera ändring {type: upsert|remove|done|merge|claude, by, …}',
    'POST /api/merge': 'Slå ihop {ics|json|url, by}',
    'GET /api/log': 'Ändringslogg (namn + tid)',
    'GET /cal.ics?cat=hem,jobb&by=Namn': 'Prenumererbar ICS, filtrerbar',
    'GET /cal.json?cat=…&by=…': 'Samma som JSON',
  },
};
