const Views = {};
let actions = {};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const app = () => $('#app');
const DAY = 86400000;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const natCmp = (a, b) => String(a).localeCompare(String(b), 'uk', { numeric: true, sensitivity: 'base' });
const startOfDay = () => new Date().setHours(0, 0, 0, 0);

function norm(s) {
  return String(s ?? '').toLowerCase()
    .replace(/[’‘`ʼ]/g, "'")
    .replace(/won't/g, 'will not').replace(/can't/g, 'cannot').replace(/n't\b/g, ' not')
    .replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will').replace(/'re\b/g, ' are').replace(/'m\b/g, ' am')
    .replace(/[.,!?;:"«»“”()\[\]]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// "look up (sth) / search" -> ["look up search", "look up", "search"]
function variants(s) {
  const clean = String(s ?? '').replace(/\([^)]*\)/g, ' ');
  const all = [clean, ...clean.split(/[\/;,]/)].map(v => norm(v).replace(/^to /, '')).filter(Boolean);
  return [...new Set(all)];
}

function lev(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Мінімальний markdown: заголовки #, списки -, **жирний**, `код`.
function md(src) {
  let out = '', list = false, para = [];
  const flush = () => { if (para.length) { out += '<p>' + para.join('<br>') + '</p>'; para = []; } };
  const endList = () => { if (list) { out += '</ul>'; list = false; } };
  for (const raw of esc(src).split('\n')) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { flush(); endList(); const n = m[1].length + 2; out += `<h${n}>${m[2]}</h${n}>`; }
    else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { flush(); if (!list) { out += '<ul>'; list = true; } out += `<li>${m[1]}</li>`; }
    else if (!l.trim()) { flush(); endList(); }
    else { endList(); para.push(l); }
  }
  flush(); endList();
  return out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\([^)]*\)/g, ''));
  u.lang = 'en-US';
  const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
const sayBtn = text => window.speechSynthesis
  ? `<button type="button" class="say" data-say="${esc(text)}" title="Озвучити" aria-label="Озвучити"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg></button>`
  : '';

function modal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('[data-m="close"]')) close();
  });
  const first = wrap.querySelector('input, textarea');
  if (first) first.focus();
  return { el: wrap, close };
}

async function metaGet(key, fallback = null) {
  const r = await DB.get('meta', key);
  return r ? r.value : fallback;
}
const metaSet = (key, value) => DB.put('meta', { key, value });

const DEFAULT_SETTINGS = { newPerDay: 20, newGrammarPerDay: 10, reviewLimit: 200, retention: 0.9, level: 'B1' };
async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await metaGet('settings', {})) };
}
const saveSettings = s => metaSet('settings', s);

async function introducedToday(type, dir) {
  const logs = await DB.since('log', 'ts', startOfDay());
  return logs.filter(l => l.first && l.type === type && (!dir || l.dir === dir)).length;
}
const logReview = (type, itemId, dir, rating, first) =>
  DB.put('log', { ts: Date.now(), type, itemId, dir, rating, first });

function allTags(cards) {
  return [...new Set(cards.flatMap(c => c.tags || []))].sort(natCmp);
}
const parseTags = s => [...new Set(String(s || '').split(',').map(t => t.trim()).filter(Boolean))];

function newDeck(name, folder = '') {
  return { id: uid(), name: String(name).trim(), folder: String(folder || '').trim(), source: '', createdAt: Date.now() };
}
function newCard(f, deckId) {
  return {
    id: uid(), deckId,
    en: String(f.en || '').trim(), ua: String(f.ua || '').trim(),
    example: String(f.example || '').trim(), note: String(f.note || '').trim(),
    tags: Array.isArray(f.tags) ? f.tags : parseTags(f.tags),
    createdAt: Date.now(), srs: { rec: null, prod: null },
  };
}
function newTopic(name, folder = '', content = '') {
  return { id: uid(), name: String(name).trim(), folder: String(folder || '').trim(), content: String(content || ''), createdAt: Date.now() };
}
function newExercise(r, topicId) {
  const list = v => (Array.isArray(v) ? v : String(v ?? '').split('|')).map(x => String(x).trim()).filter(Boolean);
  const answers = list(r.answers ?? r.answer);
  const options = list(r.options);
  if (!r.prompt || !answers.length) return null;
  if (options.length && !options.some(o => norm(o) === norm(answers[0]))) options.push(answers[0]);
  return {
    id: uid(), topicId,
    kind: r.kind === 'translate' ? 'translate' : 'gap',
    prompt: String(r.prompt).trim(), answers, options,
    explanation: String(r.explanation || '').trim(),
    createdAt: Date.now(), srs: null,
  };
}

// Дістає JSON з відповіді Claude, навіть якщо навколо є текст або ```json.
function parseClaudeJson(text) {
  const t = String(text || '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t;
  const o = body.indexOf('{'), a = body.indexOf('[');
  const useObj = o >= 0 && (a < 0 || o < a);
  const slice = useObj ? body.slice(o, body.lastIndexOf('}') + 1) : body.slice(a, body.lastIndexOf(']') + 1);
  const data = JSON.parse(slice);
  if (Array.isArray(data)) {
    return data[0]?.prompt ? { words: [], grammar: [], exercises: data } : { words: data, grammar: [], exercises: [] };
  }
  return { words: data.words || [], grammar: data.grammar || [], exercises: data.exercises || [], rule: data.rule || '' };
}
