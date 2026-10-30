const MODES = {
  mix: 'Мікс (рекомендовано)',
  flip: 'Картки: слово, потім переклад',
  choice: 'Вибір перекладу',
  choiceEn: 'Вибір англійського слова',
  type: 'Написання англійською',
};
// rec: впізнати англійське слово; prod: згадати його з перекладу
const MODE_DIR = { flip: 'rec', choice: 'rec', choiceEn: 'prod', type: 'prod' };

// Набори слів для тренування:
// scheduled — ті, що пора повторити, плюс нові в межах денного ліміту;
// today — почала вчити сьогодні або ще на етапі «вчу»: їх можна проходити скільки завгодно разів і різними способами;
// next — наступні нові слова понад денний ліміт;
// all — усі підряд, без зміни розкладу.
const WORD_SETS = {
  scheduled: 'За розкладом: повторення і нові',
  today: 'Сьогоднішні слова і ті, що ще вчу',
  next: 'Наступні нові слова',
  all: 'Усі слова підряд (розклад не змінюється)',
};

async function wordContext() {
  const s = await getSettings();
  const logs = await DB.since('log', 'ts', startOfDay());
  const first = logs.filter(l => l.type === 'word' && l.first);
  return {
    s, now: Date.now(),
    todayIds: new Set(first.map(l => l.itemId)),
    intro: { rec: first.filter(l => l.dir === 'rec').length, prod: first.filter(l => l.dir === 'prod').length },
  };
}

const isToday = (c, todayIds) => todayIds.has(c.id) || c.srs?.rec?.learning || c.srs?.prod?.learning;
const isFresh = c => !c.srs?.rec && !c.srs?.prod;

function wordTasks(cards, { set, mode, s, now, todayIds, intro, count }) {
  const dirs = mode === 'mix' ? ['rec', 'prod'] : [MODE_DIR[mode]];
  const expand = list => list.flatMap(c => dirs.map(dir => ({ c, dir })));
  // У міксі спершу впізнавання, потім написання, щоб не писати слово, якого ще не бачила.
  const order = list => mode === 'mix'
    ? [...shuffle(list.filter(t => t.dir === 'rec')), ...shuffle(list.filter(t => t.dir === 'prod'))]
    : shuffle(list);
  if (set === 'all') return order(expand(cards));
  if (set === 'today') return order(expand(cards.filter(c => isToday(c, todayIds))));
  if (set === 'next') {
    return order(expand(cards.filter(isFresh).sort((a, b) => a.createdAt - b.createdAt).slice(0, count || s.newPerDay)));
  }
  const due = [], fresh = [], prodNew = [];
  for (const c of cards) {
    for (const dir of dirs) {
      const st = c.srs?.[dir];
      if (st) { if (SRS.isDue(st, now)) due.push({ c, dir }); }
      else if (dir === 'prod' && mode === 'mix') { if (c.srs?.rec && !c.srs.rec.learning) prodNew.push({ c, dir }); }
      else fresh.push({ c, dir });
    }
  }
  const newLeft = Math.max(0, s.newPerDay - intro[dirs.length === 1 ? dirs[0] : 'rec']);
  due.sort((a, b) => a.c.srs[a.dir].due - b.c.srs[b.dir].due);
  fresh.sort((a, b) => a.c.createdAt - b.c.createdAt);
  return order([...due.slice(0, s.reviewLimit), ...prodNew.slice(0, s.reviewLimit), ...fresh.slice(0, newLeft)]);
}

const GRAMMAR_SETS = {
  scheduled: 'За розкладом',
  next: 'Наступні нові вправи',
  all: 'Усі вправи підряд (розклад не змінюється)',
};

function grammarTasks(list, { set, s, now, introG }) {
  if (set === 'all') return shuffle(list);
  const fresh = list.filter(x => !x.srs).sort((a, b) => a.createdAt - b.createdAt);
  if (set === 'next') return shuffle(fresh.slice(0, s.newGrammarPerDay));
  const due = list.filter(x => SRS.isDue(x.srs, now)).sort((a, b) => a.srs.due - b.srs.due);
  return shuffle([...due.slice(0, s.reviewLimit), ...fresh.slice(0, Math.max(0, s.newGrammarPerDay - introG))]);
}

const Study = {
  async words({ deckIds, tag = '', set = 'scheduled', mode = 'mix', count }) {
    const ctx = await wordContext();
    const all = await DB.all('cards');
    const cards = all.filter(c => deckIds.includes(c.deckId) && (!tag || (c.tags || []).includes(tag)));
    const tasks = wordTasks(cards, { ...ctx, set, mode, count });
    if (!tasks.length) {
      const msg = {
        scheduled: 'За розкладом на сьогодні слів немає: повторення зроблено, а денний ліміт нових слів вичерпано.',
        today: 'Сьогодні ще не було нових слів.',
        next: 'Нових слів у вибраних словниках не лишилося.',
        all: 'У вибраних словниках немає слів.',
      }[set];
      const left = cards.filter(isFresh).length;
      const todayN = cards.filter(c => isToday(c, ctx.todayIds)).length;
      return emptySession(msg, [
        set !== 'today' && todayN && ['today', `Сьогоднішні слова (${todayN})`],
        set !== 'next' && left && ['next', `Наступні ${Math.min(left, ctx.s.newPerDay)} нових слів`],
      ].filter(Boolean), next => Study.words({ deckIds, tag, set: next, mode }));
    }
    const pool = cards.length >= 4 ? cards : all;
    runSession({
      tasks, updates: set !== 'all',
      key: t => t.c.id + t.dir,
      learning: t => t.c.srs?.[t.dir]?.learning,
      label: t => `<b>${esc(t.c.en)}</b> — ${esc(t.c.ua)}`,
      render: (t, el, answer) => WordEx[pickWordKind(t, mode)](t, el, answer, pool),
      apply: async (t, rating) => {
        const prev = t.c.srs?.[t.dir] || null;
        t.c.srs = { ...(t.c.srs || {}), [t.dir]: SRS.review(prev, rating, Date.now(), ctx.s.retention) };
        await DB.put('cards', t.c);
        await logReview('word', t.c.id, t.dir, rating, !prev);
      },
    });
  },

  async grammar({ topicIds, set = 'scheduled' }) {
    const s = await getSettings();
    const [exs, topics] = await Promise.all([DB.all('exercises'), DB.all('topics')]);
    const tmap = Object.fromEntries(topics.map(t => [t.id, t]));
    const list = exs.filter(x => topicIds.includes(x.topicId));
    const chosen = grammarTasks(list, { set, s, now: Date.now(), introG: await introducedToday('grammar') });
    if (!chosen.length) {
      const msg = {
        scheduled: 'За розкладом вправ на сьогодні немає.',
        next: 'Нових вправ не лишилося.',
        all: 'У вибраних темах ще немає вправ.',
      }[set];
      const left = list.filter(x => !x.srs).length;
      return emptySession(msg, [
        set !== 'next' && left && ['next', `Наступні ${Math.min(left, s.newGrammarPerDay)} нових вправ`],
        set !== 'all' && list.length && ['all', `Усі вправи підряд (${list.length})`],
      ].filter(Boolean), next => Study.grammar({ topicIds, set: next }));
    }
    runSession({
      tasks: chosen.map(x => ({ x, topic: tmap[x.topicId] })),
      updates: set !== 'all',
      key: t => t.x.id,
      learning: t => t.x.srs?.learning,
      label: t => `${esc(t.x.prompt)} → <b>${esc(t.x.answers[0])}</b>`,
      render: grammarEx,
      apply: async (t, rating) => {
        const prev = t.x.srs;
        t.x.srs = SRS.review(prev, rating, Date.now(), s.retention);
        await DB.put('exercises', t.x);
        await logReview('grammar', t.x.id, null, rating, !prev);
      },
    });
  },
};

function emptySession(msg, options = [], start) {
  app().innerHTML = `<div class="panel center"><h2>За цим вибором вправ немає</h2><p>${esc(msg)}</p>
    <div class="btns center">
      ${options.map(([set, text]) => `<button class="btn primary" data-act="emptyStart" data-set="${set}">${esc(text)}</button>`).join('')}
      <a class="btn" href="#/">На головну</a>
    </div></div>`;
  actions.emptyStart = el => start(el.dataset.set);
}

function runSession(cfg) {
  const queue = [...cfg.tasks];
  const total = queue.length;
  const firstTry = new Map();
  const wrong = new Map();
  let done = 0;

  const step = () => {
    document.onkeydown = null;
    if (!queue.length) return finish();
    const t = queue.shift();
    app().innerHTML = `<div class="session">
      <div class="session-head">
        <button class="btn ghost small" data-act="quit">Завершити</button>
        <div class="bar"><div style="width:${Math.round(done / total * 100)}%"></div></div>
        <span class="muted">${done} / ${total}${cfg.updates ? '' : ' · без розкладу'}</span>
      </div>
      <div id="ex"></div></div>`;
    actions.quit = finish;
    let answered = false;
    cfg.render(t, $('#ex'), async rating => {
      if (answered) return;
      answered = true;
      const k = cfg.key(t);
      if (!firstTry.has(k)) firstTry.set(k, rating > 1);
      if (cfg.updates) await cfg.apply(t, rating);
      if (rating <= 2) wrong.set(k, t);
      // Слово лишається в сесії, поки не пройде етап «вчу»; без розкладу — поки не буде «Знаю».
      const repeat = cfg.updates ? cfg.learning(t) : rating <= 2;
      if (repeat) {
        const gap = rating === 1 ? 3 + Math.floor(Math.random() * 3) : 6 + Math.floor(Math.random() * 5);
        queue.splice(Math.min(queue.length, gap), 0, t);
      } else done++;
      step();
    });
  };

  const finish = () => {
    document.onkeydown = null;
    const n = firstTry.size;
    if (!n) { location.hash = '#/'; render(); return; }
    const ok = [...firstTry.values()].filter(Boolean).length;
    app().innerHTML = `<div class="panel center">
      <h2>Готово</h2>
      <p>З першої спроби правильно: <b>${ok}</b> з ${n}.</p>
      ${wrong.size ? `<h3>Варто повторити («Не знаю», «Важко», помилки)</h3><ul class="wrong-list">${[...wrong.values()].map(t => `<li>${cfg.label(t)}</li>`).join('')}</ul>` : ''}
      <div class="btns center">
        ${wrong.size ? '<button class="btn primary" data-act="retry">Ще раз ці слова</button>' : ''}
        <a class="btn" href="#/study">Інший спосіб</a>
        <a class="btn" href="#/">На головну</a>
      </div></div>`;
    actions.retry = () => runSession({ ...cfg, tasks: shuffle([...wrong.values()]), updates: false });
  };

  step();
}

function pickWordKind(t, mode) {
  if (mode !== 'mix') return mode;
  if (t.dir === 'rec') return !t.c.srs?.rec || Math.random() < 0.5 ? 'flip' : 'choice';
  return !t.c.srs?.prod || Math.random() < 0.4 ? 'choiceEn' : 'type';
}

const rateButtons = () => `<div class="rate">
  <button class="btn r1" data-r="1">Не знаю <kbd>1</kbd></button>
  <button class="btn r2" data-r="2">Важко <kbd>2</kbd></button>
  <button class="btn r3" data-r="3">Знаю <kbd>3</kbd></button>
  <button class="btn r4" data-r="4">Легко <kbd>4</kbd></button></div>`;

const feedback = (state, html) => {
  const title = { ok: 'Правильно', close: 'Майже', bad: 'Неправильно' }[state];
  return `<div class="feedback ${state}"><b>${title}.</b> ${html}</div>`;
};

function distractors(c, pool, field) {
  const seen = new Set([norm(c[field])]);
  const out = [];
  const same = shuffle(pool.filter(x => x.deckId === c.deckId));
  const other = shuffle(pool.filter(x => x.deckId !== c.deckId));
  for (const x of [...same, ...other]) {
    const k = norm(x[field]);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x[field]);
    if (out.length === 3) break;
  }
  return out;
}

// Ховає саме слово в прикладі, щоб приклад був підказкою, а не відповіддю.
function blankOut(example, en) {
  if (!example) return '';
  const words = String(en).replace(/\([^)]*\)/g, ' ').split(/[\s\/,;]+/)
    .filter(w => w.length > 2 && !/^(to|the|and|sth|smb|someone|something)$/i.test(w));
  let out = example;
  for (const w of words) {
    const root = w.length > 4 ? w.slice(0, w.length - 2) : w.slice(0, 3);
    out = out.replace(new RegExp('\\b' + escRe(root) + "[\\w']*", 'gi'), '____');
  }
  return out;
}

function checkWord(given, en) {
  const a = norm(given).replace(/^to /, '');
  const vs = variants(en);
  if (vs.includes(a)) return 'ok';
  if (a.length >= 3 && vs.some(v => v.length >= 4 && lev(a, v) <= (v.length >= 8 ? 2 : 1))) return 'close';
  return 'wrong';
}

function bindSay(el) {
  $$('[data-say]', el).forEach(b => { b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); }; });
}

function choiceEx(t, el, answer, pool, from, to, label) {
  const c = t.c;
  const correct = c[to];
  const opts = shuffle([correct, ...distractors(c, pool, to)]);
  if (opts.length < 2) return WordEx.flip(t, el, answer);
  el.innerHTML = `<div class="ex-card">
      <div class="ex-label">${label}</div>
      <div class="ex-word">${esc(c[from])} ${from === 'en' ? sayBtn(c.en) : ''}</div>
      ${from === 'en' && c.example ? `<div class="ex-example">${esc(c.example)}</div>` : ''}
    </div>
    <div class="options">${opts.map((o, i) => `<button class="btn option" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`).join('')}</div>
    <div id="after"></div>`;
  bindSay(el);
  let rating = null;
  const pick = i => {
    if (rating !== null) return;
    const ok = norm(opts[i]) === norm(correct);
    rating = ok ? 3 : 1;
    $$('.option', el).forEach((b, j) => {
      b.disabled = true;
      if (norm(opts[j]) === norm(correct)) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
    });
    $('#after').innerHTML = `${feedback(ok ? 'ok' : 'bad', `${esc(c.en)} — ${esc(c.ua)} ${sayBtn(c.en)}`)}
      ${c.example && from !== 'en' ? `<div class="ex-example">${esc(c.example)}</div>` : ''}
      <div class="ex-actions"><button class="btn primary" id="next">Далі <kbd>Enter</kbd></button></div>`;
    bindSay($('#after'));
    $('#next').onclick = () => answer(rating);
    $('#next').focus();
  };
  $$('.option', el).forEach((b, i) => { b.onclick = () => pick(i); });
  document.onkeydown = e => {
    if (rating === null && e.key >= '1' && e.key <= String(opts.length)) pick(+e.key - 1);
    else if (rating !== null && e.key === 'Enter') { e.preventDefault(); answer(rating); }
  };
}

const WordEx = {
  flip(t, el, answer) {
    const c = t.c;
    el.innerHTML = `<div class="ex-card">
        <div class="ex-label">Що означає?</div>
        <div class="ex-word">${esc(c.en)} ${sayBtn(c.en)}</div>
        ${c.example ? `<div class="ex-example">${esc(c.example)}</div>` : ''}
        <div id="back" hidden>
          <div class="ex-answer">${esc(c.ua)}</div>
          ${c.note ? `<div class="ex-note">${esc(c.note)}</div>` : ''}
        </div>
      </div>
      <div class="ex-actions" id="acts"><button class="btn primary big" id="show">Показати переклад <kbd>Пробіл</kbd></button></div>`;
    bindSay(el);
    const revealed = () => !$('#back').hidden;
    const reveal = () => {
      $('#back').hidden = false;
      $('#acts').innerHTML = rateButtons();
      $$('[data-r]', el).forEach(b => { b.onclick = () => answer(+b.dataset.r); });
    };
    $('#show').onclick = reveal;
    document.onkeydown = e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!revealed()) reveal(); }
      else if (revealed() && '1234'.includes(e.key)) answer(+e.key);
    };
  },

  choice(t, el, answer, pool) { choiceEx(t, el, answer, pool, 'en', 'ua', 'Виберіть переклад'); },
  choiceEn(t, el, answer, pool) { choiceEx(t, el, answer, pool, 'ua', 'en', 'Виберіть англійське слово'); },

  type(t, el, answer) {
    const c = t.c;
    const hint = blankOut(c.example, c.en);
    el.innerHTML = `<div class="ex-card">
        <div class="ex-label">Напишіть англійською</div>
        <div class="ex-word">${esc(c.ua)}</div>
        ${hint ? `<div class="ex-example">${esc(hint)}</div>` : ''}
      </div>
      <form id="tf" class="type-form">
        <input id="ti" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Відповідь">
        <button class="btn primary">Перевірити</button>
      </form>
      <div class="ex-actions" id="giveupWrap"><button type="button" class="btn ghost small" id="giveup">Не пам'ятаю</button></div>
      <div id="after"></div>`;
    $('#ti').focus();
    let result = null;
    const check = given => {
      const r = given === null ? 'wrong' : checkWord(given, c.en);
      result = r === 'ok' ? 3 : r === 'close' ? 2 : 1;
      $('#ti').disabled = true;
      $('#tf button').disabled = true;
      $('#giveupWrap').remove();
      const msg = r === 'ok' ? `${esc(c.en)} ${sayBtn(c.en)}` : `Правильно: <b>${esc(c.en)}</b> ${sayBtn(c.en)}`;
      $('#after').innerHTML = `${feedback(r === 'ok' ? 'ok' : r === 'close' ? 'close' : 'bad', msg)}
        ${c.example ? `<div class="ex-example">${esc(c.example)}</div>` : ''}
        <div class="ex-actions">
          ${r !== 'ok' && given ? '<button class="btn ghost" id="accept">Зарахувати як правильну</button>' : ''}
          <button class="btn primary" id="next">Далі <kbd>Enter</kbd></button>
        </div>`;
      bindSay($('#after'));
      $('#next').onclick = () => answer(result);
      if ($('#accept')) $('#accept').onclick = () => answer(3);
      setTimeout(() => $('#next')?.focus());
    };
    $('#tf').onsubmit = e => {
      e.preventDefault();
      const v = $('#ti').value;
      if (result === null && v.trim()) check(v);
    };
    $('#giveup').onclick = () => { if (result === null) check(null); };
    document.onkeydown = e => {
      if (result !== null && e.key === 'Enter') { e.preventDefault(); answer(result); }
    };
  },
};

// Порівнює слова відповіді з правильним варіантом: пропущені слова підсвічує, зайві закреслює.
function wordDiff(given, correct) {
  // Скорочення розгортаються («We're» → we are), тож повна форма не вважається помилкою.
  const units = s => s.trim().split(/\s+/).flatMap(tok => {
    const parts = norm(tok).split(' ').filter(Boolean);
    return parts.map((p, k) => ({ show: k === 0 ? tok : '', key: p }));
  });
  const ua = units(given), ub = units(correct);
  const na = ua.map(u => u.key), nb = ub.map(u => u.key);
  // Збіги показуються так, як написала користувачка; частина скорочення без власного тексту — як розгорнуте слово.
  const a = ua.map(u => u.show), b = ub.map(u => u.show || u.key);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      L[i][j] = na[i] === nb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && na[i] === nb[j]) { if (a[i]) out.push(esc(a[i])); i++; j++; }
    else if (j < b.length && (i >= a.length || L[i][j + 1] >= L[i + 1][j])) { out.push(`<mark class="ins" title="пропущено">${esc(b[j])}</mark>`); j++; }
    else { out.push(`<s class="del" title="зайве">${esc(a[i] || na[i])}</s>`); i++; }
  }
  return out.join(' ');
}

function grammarEx(t, el, answer) {
  const x = t.x, topic = t.topic;
  const sentence = esc(x.prompt).replace(/_{2,}/g, '<span class="gap">____</span>');
  const isChoice = x.kind === 'gap' && x.options.length >= 2;
  const opts = isChoice ? shuffle(x.options) : [];
  const task = x.kind === 'translate' ? 'Перекладіть англійською' : isChoice ? 'Виберіть правильний варіант' : 'Заповніть пропуск';
  el.innerHTML = `<div class="ex-card">
      <div class="ex-label">${esc(topic?.name || '')} · ${task}</div>
      <div class="ex-sentence">${sentence}</div>
    </div>
    ${isChoice
      ? `<div class="options">${opts.map((o, i) => `<button class="btn option" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`).join('')}</div>`
      : `<form id="tf" class="type-form"><input id="ti" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Відповідь"><button class="btn primary">Перевірити</button></form>`}
    <div id="after"></div>
    ${topic?.content ? `<details class="rule"><summary>Правило: ${esc(topic.name)}</summary><div class="md">${md(topic.content)}</div></details>` : ''}`;
  const accepted = x.answers.map(norm);
  let result = null;
  const show = (ok, given) => {
    result = ok ? 3 : 1;
    const ref = x.answers.map(esc).join(' / ');
    const info = ok ? (x.kind === 'translate' && x.answers.length > 1 ? `Варіанти: ${ref}` : '') : `Правильно: <b>${ref}</b>`;
    let diff = '';
    if (!ok && given) {
      const closest = x.answers.reduce((best, a) => lev(norm(given), norm(a)) < lev(norm(given), norm(best)) ? a : best);
      diff = `<div class="diff"><span class="muted">Різниця з найближчою правильною:</span><br>${wordDiff(given, closest)}</div>`;
    }
    $('#after').innerHTML = `${feedback(ok ? 'ok' : 'bad', info)}${diff}
      ${x.explanation ? `<div class="ex-note">${esc(x.explanation)}</div>` : ''}
      <div class="ex-actions">
        ${!ok && !isChoice ? '<button class="btn ghost" id="accept">Моя відповідь теж правильна</button>' : ''}
        <button class="btn primary" id="next">Далі <kbd>Enter</kbd></button>
      </div>`;
    $('#next').onclick = () => answer(result);
    if ($('#accept')) $('#accept').onclick = () => answer(3);
    setTimeout(() => $('#next')?.focus());
  };
  if (isChoice) {
    const pick = i => {
      if (result !== null) return;
      const ok = accepted.includes(norm(opts[i]));
      $$('.option', el).forEach((b, j) => {
        b.disabled = true;
        if (accepted.includes(norm(opts[j]))) b.classList.add('correct');
        else if (j === i) b.classList.add('wrong');
      });
      show(ok);
    };
    $$('.option', el).forEach((b, i) => { b.onclick = () => pick(i); });
    document.onkeydown = e => {
      if (result === null && e.key >= '1' && e.key <= String(opts.length)) pick(+e.key - 1);
      else if (result !== null && e.key === 'Enter') { e.preventDefault(); answer(result); }
    };
  } else {
    $('#ti').focus();
    $('#tf').onsubmit = e => {
      e.preventDefault();
      const v = $('#ti').value;
      if (result !== null || !v.trim()) return;
      $('#ti').disabled = true;
      $('#tf button').disabled = true;
      show(accepted.includes(norm(v)), v);
    };
    document.onkeydown = e => {
      if (result !== null && e.key === 'Enter') { e.preventDefault(); answer(result); }
    };
  }
}
