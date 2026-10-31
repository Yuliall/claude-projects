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

  // grade: 'forgot' | 'partly' | 'got'; cueIndex — номер показаної ситуації. Повертає нову копію картки.
  function schedule(card, grade, today, cueIndex) {
    if (!GRADES.includes(grade)) throw new Error('Unknown grade: ' + grade);
    const c = { ...card };
    if (cueIndex !== undefined) c.last_cue_index = cueIndex;
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

  const DEFAULT_LIFE_SHARE = 0.4;
  const isLife = c => c.domain === 'life';

  // Бере з упорядкованого списку не більше limit карток так, щоб «життя» мало приблизно lifeShare місць.
  // Якщо в одній сфері карток бракує, вільні місця дістаються іншій.
  function takeByShare(list, limit, lifeShare) {
    if (limit <= 0) return [];
    if (list.length <= limit) return list;
    const life = list.filter(isLife), work = list.filter(c => !isLife(c));
    let nLife = Math.min(life.length, Math.round(limit * lifeShare));
    const nWork = Math.min(work.length, limit - nLife);
    nLife = Math.min(life.length, limit - nWork);
    const chosen = new Set([...life.slice(0, nLife), ...work.slice(0, nWork)]);
    return list.filter(c => chosen.has(c));
  }

  // Чергує сфери, зберігаючи порядок усередині кожної.
  function interleave(list) {
    const life = list.filter(isLife), work = list.filter(c => !isLife(c));
    const out = [];
    while (life.length || work.length) {
      if (work.length) out.push(work.shift());
      if (life.length) out.push(life.shift());
    }
    return out;
  }

  // План на день. Прострочені понад ліміт просто лишаються простроченими й ідуть першими завтра:
  // окремого лічильника боргу немає.
  function planDay(cards, today, done, settings) {
    const share = settings.lifeShare ?? DEFAULT_LIFE_SHARE;
    const due = cards
      .filter(c => (c.status === 'active' || c.status === 'mastered') && !isNew(c) && c.due_date && c.due_date <= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || String(a.created_at).localeCompare(String(b.created_at)));
    const fresh = cards
      .filter(c => c.status === 'active' && isNew(c))
      .sort((a, b) => String(a.activated_at || '').localeCompare(String(b.activated_at || '')) || String(a.created_at).localeCompare(String(b.created_at)));
    return {
      reviews: interleave(takeByShare(due, Math.max(0, settings.reviewsPerDay - done.reviews), share)),
      fresh: interleave(takeByShare(fresh, Math.max(0, settings.newPerDay - done.fresh), share)),
    };
  }

  // Переводить вирази з черги в активні, поки є вільні місця, з урахуванням частки «життя»
  // серед усіх активних. Повертає змінені копії.
  function promote(cards, activeMax, today, lifeShare = DEFAULT_LIFE_SHARE) {
    const active = cards.filter(c => c.status === 'active');
    const free = Math.max(0, activeMax - active.length);
    const queued = cards
      .filter(c => c.status === 'queued')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const qLife = queued.filter(isLife), qWork = queued.filter(c => !isLife(c));
    let picked;
    if (!qLife.length || !qWork.length) picked = queued.slice(0, free);
    else {
      const lifeWanted = Math.max(0, Math.round(activeMax * lifeShare) - active.filter(isLife).length);
      let nLife = Math.min(qLife.length, lifeWanted, free);
      const nWork = Math.min(qWork.length, free - nLife);
      nLife = Math.min(qLife.length, free - nWork);
      picked = [...qLife.slice(0, nLife), ...qWork.slice(0, nWork)];
    }
    return picked.map(c => ({ ...c, status: 'active', activated_at: today }));
  }

  // ---------- ситуації ----------
  // Ситуація, відмінна від показаної минулого разу; якщо вона одна, показується вона.
  function pickCue(card, rng = Math.random) {
    const cues = (card.cues_uk || []).map((text, index) => ({ text, index })).filter(c => c.text);
    if (!cues.length) return { index: null, text: '' };
    const others = cues.length > 1 ? cues.filter(c => c.index !== card.last_cue_index) : cues;
    return others[Math.min(others.length - 1, Math.floor(rng() * others.length))];
  }

  // Доповнює вирази зі старих версій новими полями. Старе cue_uk лишається в записі.
  function upgrade(c) {
    if (Array.isArray(c.cues_uk) && (c.domain === 'work' || c.domain === 'life') && typeof c.image_note === 'string' && c.last_cue_index !== undefined) return c;
    return {
      ...c,
      cues_uk: Array.isArray(c.cues_uk) ? c.cues_uk : c.cue_uk ? [c.cue_uk] : [],
      domain: c.domain === 'life' ? 'life' : 'work',
      image_note: typeof c.image_note === 'string' ? c.image_note : '',
      last_cue_index: c.last_cue_index ?? null,
    };
  }

  // ---------- етап вивчення нових виразів ----------
  // Підказка з перших літер: «have an impact on something» → «h___ an i_____ on something».
  // Артиклі й заповнювачі (something, someone) лишаються як є.
  function hintPattern(expression) {
    return String(expression ?? '').replace(/[A-Za-z][A-Za-z'’]*/g, w =>
      ARTICLES.has(w.toLowerCase()) || PLACEHOLDERS.has(w.toLowerCase()) ? w : w[0] + '_'.repeat(w.length - 1));
  }

  // Кроки сесії: для нових виразів знайомство → вибір виразу до кожної ситуації → написання з підказкою;
  // далі повторення вже знайомих. canChoose(card) каже, чи є з чого складати варіанти.
  function sessionSteps(fresh, reviews, { rng = Math.random, canChoose = () => true } = {}) {
    const steps = fresh.map(c => ({ kind: 'intro', id: c.id }));
    const choices = [];
    for (const c of fresh) {
      if (!canChoose(c)) continue;
      (c.cues_uk || []).forEach((cue, cueIndex) => { if (cue) choices.push({ kind: 'choice', id: c.id, cueIndex }); });
    }
    // Перемішуємо, але так, щоб дві ситуації одного виразу не йшли поспіль, коли цього можна уникнути.
    const shuffled = [];
    const pool = [...choices];
    while (pool.length) {
      const prev = shuffled[shuffled.length - 1];
      const allowed = pool.filter(s => !prev || s.id !== prev.id);
      const from = allowed.length ? allowed : pool;
      const pick = from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
      pool.splice(pool.indexOf(pick), 1);
      shuffled.push(pick);
    }
    steps.push(...shuffled);
    steps.push(...fresh.map(c => ({ kind: 'write', id: c.id })));
    steps.push(...reviews.map(c => ({ kind: 'review', id: c.id })));
    return steps;
  }

  // Правильний вираз і до n-1 інших для вибору: спершу з тієї самої сфери, без однакових за змістом.
  function choiceOptions(card, pool, n = 4, rng = Math.random) {
    const key = expressionKey(card.expression);
    const seen = new Set([key]);
    const shuffle = list => list.map(c => [rng(), c]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const others = pool.filter(c => c.id !== card.id && c.status !== 'queued');
    const same = shuffle(others.filter(c => (c.domain === 'life') === isLife(card)));
    const rest = shuffle(others.filter(c => (c.domain === 'life') !== isLife(card)));
    const picked = [];
    for (const c of [...same, ...rest]) {
      const k = expressionKey(c.expression);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      picked.push(c.expression);
      if (picked.length === n - 1) break;
    }
    return shuffle([card.expression, ...picked]);
  }

  function parseDomain(s) {
    const v = String(s ?? '').trim().toLowerCase();
    if (['робота', 'work'].includes(v)) return 'work';
    if (['життя', 'life'].includes(v)) return 'life';
    return null;
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
    const cues = (Array.isArray(f.cues_uk) ? f.cues_uk : [f.cue_uk]).map(s => String(s ?? '').trim()).filter(Boolean).slice(0, 3);
    return {
      id: 'x' + createdAt.toString(36) + Math.random().toString(36).slice(2, 8),
      expression: String(f.expression || '').trim(),
      meaning_uk: String(f.meaning_uk || '').trim(),
      cues_uk: cues,
      cue_uk: cues[0] || '',
      last_cue_index: null,
      image_note: String(f.image_note || '').trim(),
      domain: f.domain === 'life' ? 'life' : 'work',
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
  // Новий формат (8–9 полів):
  //   вираз | значення | сфера | ситуація 1 | ситуація 2 | ситуація 3 | образ | приклад | цитата
  // Старий формат (4–5 полів), сфера «робота»:
  //   вираз | значення | ситуація | приклад | цитата
  function parseImport(text, existingExpressions = []) {
    const known = new Set(existingExpressions.map(expressionKey));
    const rows = [];
    String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
      let line = raw.trim();
      if (!line || /^[|\s:-]+$/.test(line)) return; // порожній рядок або роздільник markdown-таблиці
      line = line.replace(/^\|/, '').replace(/\|$/, '');
      const parts = line.split('|').map(s => s.trim());
      if (['expression', 'вираз'].includes(parts[0].toLowerCase())) return; // рядок заголовків
      const row = { line: i + 1, format: null, data: null, errors: [], warnings: [], duplicate: false };
      let required;
      if (parts.length >= 8 && parts.length <= 9) {
        const [expression, meaning_uk, dom, c1, c2, c3, image_note, example_en, note = ''] = parts;
        const domain = parseDomain(dom);
        row.format = 'new';
        row.data = { expression, meaning_uk, domain: domain || 'work', cues_uk: [c1, c2, c3].filter(Boolean), image_note, example_en, note };
        if (!domain) row.errors.push(`Сфера має бути «робота» або «життя», а не «${dom}»`);
        required = [['вираз', expression], ['значення', meaning_uk], ['ситуація 1', c1], ['приклад', example_en]];
      } else {
        const [expression = '', meaning_uk = '', cue = '', example_en = '', note = ''] = parts;
        row.format = 'old';
        row.data = { expression, meaning_uk, domain: 'work', cues_uk: cue ? [cue] : [], image_note: '', example_en, note };
        required = [['вираз', expression], ['значення', meaning_uk], ['ситуація', cue], ['приклад', example_en]];
        if (parts.length < 4 || (parts.length > 5 && parts.length < 8)) {
          row.errors.push(`Полів ${parts.length}: потрібно 8–9 (новий формат) або 4–5 (старий)`);
        } else if (parts.length > 9) {
          row.errors.push('Забагато полів: можливо, знак | є всередині тексту');
        }
      }
      const countOk = row.format === 'new' || (parts.length >= 4 && parts.length <= 5);
      const missing = required.filter(([, v]) => !v).map(([k]) => k);
      if (countOk && missing.length) row.errors.push('Порожні поля: ' + missing.join(', '));
      const { expression, cues_uk } = row.data;
      if (expression && !expressionKey(expression)) row.errors.push('Вираз не містить слів');
      if (!row.errors.length) {
        if (tokenize(expression).length < 2) row.warnings.push('Одне слово, а не вираз');
        const req = analyse(expression).filter(it => it.kind === 'req').map(it => it.text);
        if (cues_uk.some(cue => req.some(w => tokenize(cue).includes(w)))) row.warnings.push('Ситуація містить англійські слова виразу');
        const key = expressionKey(expression);
        if (known.has(key)) row.duplicate = true;
        else known.add(key);
      }
      rows.push(row);
    });
    return rows;
  }

  // ---------- прогрес ----------
  // domain: 'work' | 'life' | null (усі сфери)
  function weeklyProgress(allCards, allLogs, today, weeks = 8, domain = null) {
    const cards = domain ? allCards.filter(c => (domain === 'life') === isLife(c)) : allCards;
    const ids = new Set(cards.map(c => c.id));
    const usageLogs = allLogs.filter(l => ids.has(l.itemId));
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

  // До max виразів однієї сфери для діалогу: спершу сьогоднішні «Забула», потім «Частково», потім решта
  // сьогоднішніх; якщо їх менше, доповнює активними виразами цієї сфери, які ще не вживались без підказки.
  function rolePlayPick(logs, cardsById, today, max = 5, domain = null) {
    const rank = { forgot: 0, partly: 1, got: 2 };
    const inDomain = c => c && (!domain || (domain === 'life') === isLife(c));
    const worst = new Map();
    logs.forEach((l, order) => {
      if (l.type !== 'expr' || dayKey(new Date(l.ts)) !== today || !inDomain(cardsById[l.itemId])) return;
      const prev = worst.get(l.itemId);
      if (!prev || rank[l.grade] < rank[prev.grade]) worst.set(l.itemId, { grade: l.grade, order });
    });
    const ids = [...worst.entries()]
      .sort((a, b) => rank[a[1].grade] - rank[b[1].grade] || a[1].order - b[1].order)
      .map(([id]) => id);
    if (ids.length < max) {
      const weak = c => (c.last_result == null ? 1.5 : rank[c.last_result]) * 10 + (c.consecutive_correct || 0);
      Object.values(cardsById)
        .filter(c => inDomain(c) && c.status === 'active' && !(c.used_unprompted_count || 0) && !worst.has(c.id))
        .sort((a, b) => weak(a) - weak(b) || String(a.created_at).localeCompare(String(b.created_at)))
        .forEach(c => ids.push(c.id));
    }
    return ids.slice(0, max).map(id => cardsById[id].expression);
  }

  return {
    INTERVALS, MASTERED_INTERVAL, MASTERED_AFTER, DEFAULT_LIFE_SHARE,
    dayKey, addDays, weekStart, tokenize, analyse, expressionKey, compare,
    schedule, isNew, countDone, planDay, promote, checkMastered, applyUsage, makeExpression,
    pickCue, upgrade, parseDomain, parseImport, weeklyProgress, rolePlayPick,
    hintPattern, sessionSteps, choiceOptions,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ExprCore;
