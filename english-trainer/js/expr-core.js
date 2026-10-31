// Логіка виразів без DOM та IndexedDB: розклад, ліміти, черга, порівняння відповіді, імпорт, прогрес.
// У браузері доступна як глобальна ExprCore, у Node — через require (для тестів).
const ExprCore = (() => {
  const INTERVALS = [1, 3, 7, 14, 30];
  const MASTERED_INTERVAL = 30;
  const MASTERED_AFTER = 2;
  const ARTICLES = new Set(['a', 'an', 'the']);
  const PLACEHOLDERS = new Set(['something', 'someone', 'somebody', 'sth', 'sb', 'smth', 'smb', "someone's", "somebody's", "one's", 'oneself']);
  const GRADES = ['forgot', 'partly', 'got'];

  // ---------- дати (місцевий час, формат YYYY-MM-DD) ----------
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (key, n) => { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); };
  const weekStart = key => { const d = parseDay(key); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dayKey(d); };

  // ---------- текст ----------
  function tokenize(s) {
    return String(s ?? '').toLowerCase()
      .replace(/[’‘`ʼ]/g, "'")
      .replace(/[-–—/]/g, ' ')
      .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
      .split(/\s+/)
      .map(t => t.replace(/^'+|'+$/g, ''))
      .filter(Boolean);
  }

  // Розбирає вираз на слова: обов'язкові, необов'язкові (у дужках), заповнювачі (something) і артиклі.
  function analyse(expression) {
    const items = [];
    let depth = 0;
    for (const piece of String(expression ?? '').split(/([()])/)) {
      if (piece === '(') { depth++; continue; }
      if (piece === ')') { depth = Math.max(0, depth - 1); continue; }
      for (const t of tokenize(piece)) {
        const kind = ARTICLES.has(t) ? 'art' : PLACEHOLDERS.has(t) ? 'ph' : depth ? 'opt' : 'req';
        items.push({ text: t, kind });
      }
    }
    return items;
  }

  const expressionKey = expression => analyse(expression).filter(i => i.kind === 'req').map(i => i.text).join(' ');

  // Найдовша спільна підпослідовність: повертає множини індексів збігів у a та b.
  function lcs(a, b) {
    const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
    const ia = new Set(), ib = new Set();
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { ia.add(i); ib.add(j); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++;
      else j++;
    }
    return { ia, ib };
  }

  // Порівнює відповідь з виразом без урахування регістру, розділових знаків і артиклів.
  // Заповнювачі (something, someone) не обов'язкові: «push back on the deadline» підходить до «push back on something».
  function compare(answer, expression) {
    const items = analyse(expression);
    const ans = tokenize(answer).map(text => ({ text, article: ARTICLES.has(text) }));
    const target = items.map((it, idx) => ({ ...it, idx })).filter(it => it.kind === 'req' || it.kind === 'opt');
    const ansWords = ans.map((t, idx) => ({ ...t, idx })).filter(t => !t.article);
    const { ia, ib } = lcs(ansWords.map(t => t.text), target.map(t => t.text));
    const matchedItems = new Set([...ib].map(j => target[j].idx));
    const matchedAns = new Set([...ia].map(i => ansWords[i].idx));

    const req = target.filter(t => t.kind === 'req');
    const reqMatched = req.filter(t => matchedItems.has(t.idx)).length;
    const optMissing = target.filter(t => t.kind === 'opt' && !matchedItems.has(t.idx)).length;
    const extras = ansWords.filter(t => !matchedAns.has(t.idx)).length;
    const hasPlaceholder = items.some(i => i.kind === 'ph');

    let suggestion;
    if (!ansWords.length) suggestion = 'forgot';
    else if (reqMatched === req.length && !optMissing && (hasPlaceholder || !extras)) suggestion = 'got';
    else if (reqMatched === req.length || reqMatched >= Math.ceil(req.length / 2)) suggestion = 'partly';
    else suggestion = 'forgot';

    return {
      suggestion,
      // Якщо у виразі є заповнювач, власні слова на його місці не позначаються як зайві.
      answer: ans.map((t, idx) => ({ text: t.text, state: t.article ? 'neutral' : matchedAns.has(idx) ? 'match' : hasPlaceholder ? 'neutral' : 'extra' })),
      expression: items.map((it, idx) => ({
        text: it.text,
        state: it.kind === 'art' || it.kind === 'ph' ? 'neutral' : matchedItems.has(idx) ? 'match' : it.kind === 'opt' ? 'missing-opt' : 'missing',
      })),
    };
  }

  // ---------- розклад ----------
  function level(days) {
    if (days == null) return -1;
    let idx = 0;
    INTERVALS.forEach((v, i) => { if (days >= v) idx = i; });
    return idx;
  }

  // grade: 'forgot' | 'partly' | 'got'. Повертає нову копію картки.
  function schedule(card, grade, today) {
    if (!GRADES.includes(grade)) throw new Error('Unknown grade: ' + grade);
    const c = { ...card };
    if (c.status === 'mastered') {
      c.interval_days = MASTERED_INTERVAL;
    } else {
      const lv = level(c.interval_days);
      if (grade === 'got') c.interval_days = lv < 0 ? INTERVALS[0] : INTERVALS[Math.min(lv + 1, INTERVALS.length - 1)];
      else if (grade === 'partly') c.interval_days = lv < 0 ? INTERVALS[0] : INTERVALS[lv];
      else c.interval_days = INTERVALS[0];
    }
    c.due_date = addDays(today, c.interval_days);
    c.consecutive_correct = grade === 'got' ? (c.consecutive_correct || 0) + 1 : 0;
    c.last_result = grade;
    c.last_reviewed = today;
    return c;
  }

  const isNew = c => c.last_result == null;

  // Що уже пройдено сьогодні: кожен вираз рахується один раз, нові окремо від повторень.
  function countDone(logs, today) {
    const fresh = new Set(), reviews = new Set();
    for (const l of logs) {
      if (l.type !== 'expr' || dayKey(new Date(l.ts)) !== today) continue;
      (l.first ? fresh : reviews).add(l.itemId);
    }
    return { fresh: fresh.size, reviews: reviews.size };
  }

  // План на день. Прострочені понад ліміт просто лишаються простроченими й ідуть першими завтра:
  // окремого лічильника боргу немає.
  function planDay(cards, today, done, settings) {
    const due = cards
      .filter(c => (c.status === 'active' || c.status === 'mastered') && !isNew(c) && c.due_date && c.due_date <= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || String(a.created_at).localeCompare(String(b.created_at)));
    const fresh = cards
      .filter(c => c.status === 'active' && isNew(c))
      .sort((a, b) => String(a.activated_at || '').localeCompare(String(b.activated_at || '')) || String(a.created_at).localeCompare(String(b.created_at)));
    return {
      reviews: due.slice(0, Math.max(0, settings.reviewsPerDay - done.reviews)),
      fresh: fresh.slice(0, Math.max(0, settings.newPerDay - done.fresh)),
    };
  }

  // Переводить вирази з черги в активні, поки є вільні місця. Повертає змінені копії.
  function promote(cards, activeMax, today) {
    const active = cards.filter(c => c.status === 'active').length;
    const free = Math.max(0, activeMax - active);
    return cards
      .filter(c => c.status === 'queued')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, free)
      .map(c => ({ ...c, status: 'active', activated_at: today }));
  }

  function checkMastered(card, today) {
    if (card.status !== 'active' || (card.used_unprompted_count || 0) < MASTERED_AFTER) return card;
    return { ...card, status: 'mastered', mastered_at: today, interval_days: MASTERED_INTERVAL, due_date: addDays(today, MASTERED_INTERVAL) };
  }

  // kind: 'unprompted' | 'hint'
  function applyUsage(card, kind, ts) {
    const c = { ...card };
    if (kind === 'unprompted') c.used_unprompted_count = (c.used_unprompted_count || 0) + 1;
    else c.used_with_hint_count = (c.used_with_hint_count || 0) + 1;
    c.last_used_at = new Date(ts).toISOString();
    return checkMastered(c, dayKey(new Date(ts)));
  }

  function makeExpression(f, source, createdAt) {
    return {
      id: 'x' + createdAt.toString(36) + Math.random().toString(36).slice(2, 8),
      expression: String(f.expression || '').trim(),
      meaning_uk: String(f.meaning_uk || '').trim(),
      cue_uk: String(f.cue_uk || '').trim(),
      example_en: String(f.example_en || '').trim(),
      note: String(f.note || '').trim(),
      source: String(source || '').trim(),
      created_at: new Date(createdAt).toISOString(),
      status: 'queued',
      activated_at: null,
      interval_days: null,
      due_date: null,
      consecutive_correct: 0,
      last_result: null,
      used_unprompted_count: 0,
      used_with_hint_count: 0,
      last_used_at: null,
    };
  }

  // ---------- імпорт ----------
  // Рядок: expression | meaning_uk | cue_uk | example_en | quote (quote не обов'язкове).
  function parseImport(text, existingExpressions = []) {
    const known = new Set(existingExpressions.map(expressionKey));
    const rows = [];
    String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
      let line = raw.trim();
      if (!line || /^[|\s:-]+$/.test(line)) return; // порожній рядок або роздільник markdown-таблиці
      line = line.replace(/^\|/, '').replace(/\|$/, '');
      const parts = line.split('|').map(s => s.trim());
      if (parts[0].toLowerCase() === 'expression') return; // рядок заголовків
      const [expression = '', meaning_uk = '', cue_uk = '', example_en = '', note = ''] = parts;
      const row = { line: i + 1, data: { expression, meaning_uk, cue_uk, example_en, note }, errors: [], warnings: [], duplicate: false };
      if (parts.length < 4) row.errors.push('Потрібно щонайменше 4 поля через |');
      if (parts.length > 5) row.errors.push('Забагато полів: можливо, знак | є всередині тексту');
      const missing = [['expression', expression], ['meaning_uk', meaning_uk], ['cue_uk', cue_uk], ['example_en', example_en]]
        .filter(([, v]) => !v).map(([k]) => k);
      if (parts.length >= 4 && missing.length) row.errors.push('Порожні поля: ' + missing.join(', '));
      if (expression && !expressionKey(expression)) row.errors.push('Вираз не містить слів');
      if (!row.errors.length) {
        if (tokenize(expression).length < 2) row.warnings.push('Одне слово, а не вираз');
        const req = analyse(expression).filter(it => it.kind === 'req').map(it => it.text);
        if (req.some(w => tokenize(cue_uk).includes(w))) row.warnings.push('Підказка cue_uk містить англійські слова виразу');
        const key = expressionKey(expression);
        if (known.has(key)) row.duplicate = true;
        else known.add(key);
      }
      rows.push(row);
    });
    return rows;
  }

  // ---------- прогрес ----------
  function weeklyProgress(cards, usageLogs, today, weeks = 8) {
    const current = weekStart(today);
    const list = [];
    for (let k = weeks - 1; k >= 0; k--) {
      const start = addDays(current, -7 * k);
      list.push({ start, end: addDays(start, 6), unprompted: new Set(), hint: new Set() });
    }
    const byStart = new Map(list.map(w => [w.start, w]));
    for (const l of usageLogs) {
      if (l.type !== 'usage') continue;
      const w = byStart.get(weekStart(dayKey(new Date(l.ts))));
      if (w) (l.kind === 'unprompted' ? w.unprompted : w.hint).add(l.itemId);
    }
    const learning = cards.filter(c => c.status !== 'queued');
    const earlier = learning.filter(c => (c.activated_at || dayKey(new Date(c.created_at))) < current);
    return {
      weeks: list.map(w => ({ start: w.start, end: w.end, unprompted: w.unprompted.size, hint: w.hint.size })),
      earlier: { total: earlier.length, used: earlier.filter(c => (c.used_unprompted_count || 0) > 0).length },
      never: learning.filter(c => !(c.used_unprompted_count || 0) && !(c.used_with_hint_count || 0)),
    };
  }

  // До 5 виразів із сьогоднішніх повторень: спершу «Забула», потім «Частково», потім решта.
  function rolePlayPick(logs, cardsById, today, max = 5) {
    const rank = { forgot: 0, partly: 1, got: 2 };
    const worst = new Map();
    logs.forEach((l, order) => {
      if (l.type !== 'expr' || dayKey(new Date(l.ts)) !== today || !cardsById[l.itemId]) return;
      const prev = worst.get(l.itemId);
      if (!prev || rank[l.grade] < rank[prev.grade]) worst.set(l.itemId, { grade: l.grade, order });
    });
    return [...worst.entries()]
      .sort((a, b) => rank[a[1].grade] - rank[b[1].grade] || a[1].order - b[1].order)
      .slice(0, max)
      .map(([id]) => cardsById[id].expression);
  }

  return {
    INTERVALS, MASTERED_INTERVAL, MASTERED_AFTER,
    dayKey, addDays, weekStart, tokenize, analyse, expressionKey, compare,
    schedule, isNew, countDone, planDay, promote, checkMastered, applyUsage, makeExpression,
    parseImport, weeklyProgress, rolePlayPick,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ExprCore;
