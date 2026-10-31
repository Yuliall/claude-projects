Views[''] = async () => {
  const [decks, cards, exercises, topics, lastExport, ctx, xp] = await Promise.all([
    DB.all('decks'), DB.all('cards'), DB.all('exercises'), DB.all('topics'), metaGet('lastExport'), wordContext(), exprPlan(),
  ]);
  const xToday = xp.reviews.length + xp.fresh.length;
  const xActive = xp.all.filter(c => c.status === 'active').length;
  const xQueued = xp.all.filter(c => c.status === 'queued').length;
  const { s, now } = ctx;
  const sched = wordTasks(cards, { ...ctx, set: 'scheduled', mode: 'mix' });
  const schedNew = sched.filter(t => t.dir === 'rec' && !t.c.srs?.rec).length;
  const schedWrite = sched.filter(t => t.dir === 'prod' && !t.c.srs?.prod).length;
  const schedReview = sched.length - schedNew - schedWrite;
  const todayN = cards.filter(c => isToday(c, ctx.todayIds)).length;
  const learningN = cards.filter(c => c.srs?.rec?.learning || c.srs?.prod?.learning).length;
  const freshN = cards.filter(isFresh).length;
  const known = cards.filter(c => c.srs?.rec && !c.srs.rec.learning && c.srs.rec.s >= 21).length;
  const gTotal = grammarTasks(exercises, { set: 'scheduled', s, now, introG: await introducedToday('grammar') }).length;
  const doneToday = (await DB.since('log', 'ts', startOfDay())).length;
  const staleBackup = cards.length >= 10 && (!lastExport || now - lastExport > 7 * DAY);

  app().innerHTML = `
    <section class="hero panel">
      <div>
        <h1>Сьогодні</h1>
        <p class="muted">${cards.length
          ? `За розкладом: повторень ${schedReview}, нових слів ${schedNew}, перше написання ${schedWrite}.${learningN ? ` На етапі «вчу»: ${learningN} сл.` : ''}`
          : 'Почніть з нового уроку або створіть словник.'}</p>
      </div>
      <div class="btns">
        <button class="btn primary big" data-act="words" ${sched.length ? '' : 'disabled'}>Слова: ${sched.length}</button>
        <button class="btn big" data-act="grammar" ${gTotal ? '' : 'disabled'}>Граматика: ${gTotal}</button>
      </div>
    </section>
    <div class="panel">
      <div class="toolbar"><h3>Вирази · Expressions</h3></div>
      <p class="muted">${xp.all.length
        ? `На сьогодні: ${xToday}. Активних ${xActive} з ${xp.lim.activeMax}${xQueued ? `, у черзі ${xQueued}` : ''}.`
        : 'Вставте вирази з уроку через імпорт і тренуйте їх згадування.'}</p>
      <div class="btns">
        ${xp.all.length ? `<a class="btn primary" href="#/expr-review">Повторити вирази: ${xToday}</a>` : '<a class="btn primary" href="#/expr-import">Імпорт виразів</a>'}
        <button class="btn" data-act="dialog">Скопіювати для діалогу</button>
        <a class="btn ghost" href="#/expr">Усі вирази</a>
      </div>
    </div>
    ${todayN || freshN ? `<div class="panel">
      <div class="toolbar">
        <h3>Сьогоднішні слова</h3>
      </div>
      <p class="muted">Слова, які почала вчити сьогодні або ще вчиш. Їх можна проходити скільки завгодно разів: картками, вибором, написанням.</p>
      <div class="btns">
        <button class="btn" data-act="today" ${todayN ? '' : 'disabled'}>Повторити сьогоднішні: ${todayN}</button>
        <a class="btn" href="#/study">Вибрати спосіб</a>
        ${freshN ? `<button class="btn" data-act="next">Взяти наступні ${Math.min(freshN, s.newPerDay)} нових</button>` : ''}
      </div></div>` : ''}
    ${staleBackup ? `<div class="panel warn-panel">Резервну копію ${lastExport ? 'не робили понад тиждень' : 'ще не робили'}. Дані зберігаються лише в цьому браузері. <a href="#/settings">Зберегти копію</a></div>` : ''}
    <div class="stats">
      <div class="stat"><b>${cards.length}</b><span>слів у ${decks.length} словниках</span></div>
      <div class="stat"><b>${known}</b><span>слів знаю добре</span></div>
      <div class="stat"><b>${topics.length}</b><span>граматичних тем</span></div>
      <div class="stat"><b>${doneToday}</b><span>відповідей сьогодні</span></div>
    </div>
    ${!cards.length ? `<div class="panel">
      <h2>Як користуватися</h2>
      <ol class="howto">
        <li>Після уроку відкрийте <a href="#/lesson">Новий урок</a>, вставте текст і скопіюйте запит для Claude.</li>
        <li>Вставте відповідь Claude назад, позначте потрібні слова й дайте словнику назву.</li>
        <li>Щодня натискайте «Слова». Програма сама вирішує, які слова пора повторити.</li>
        <li>Граматику ведіть у розділі <a href="#/grammar">Граматика</a>: правила й вправи до них.</li>
      </ol></div>` : ''}
    <div class="btns"><a class="btn" href="#/lesson">Новий урок</a><a class="btn" href="#/study">Вибрати словники для тренування</a></div>`;

  const deckIds = decks.map(d => d.id);
  actions.words = () => Study.words({ deckIds, set: 'scheduled', mode: 'mix' });
  actions.today = () => Study.words({ deckIds, set: 'today', mode: 'mix' });
  actions.next = () => Study.words({ deckIds, set: 'next', mode: 'mix' });
  actions.grammar = () => Study.grammar({ topicIds: topics.map(t => t.id), set: 'scheduled' });
  actions.dialog = chooseDialog;
};

function folderDatalist(items, id = 'folders') {
  const folders = [...new Set(items.map(d => d.folder).filter(Boolean))].sort(natCmp);
  return `<datalist id="${id}">${folders.map(f => `<option value="${esc(f)}">`).join('')}</datalist>`;
}

function groupByFolder(items) {
  const folders = [...new Set(items.map(d => d.folder || ''))].sort((a, b) => (a === '') - (b === '') || natCmp(a, b));
  return folders.map(f => [f, items.filter(d => (d.folder || '') === f).sort((a, b) => natCmp(a.name, b.name))]);
}

Views.decks = async () => {
  const [decks, cards] = await Promise.all([DB.all('decks'), DB.all('cards')]);
  const now = Date.now();
  const per = {};
  for (const c of cards) {
    const p = per[c.deckId] ||= { n: 0, due: 0, fresh: 0 };
    p.n++;
    if (!c.srs?.rec) p.fresh++;
    else if (SRS.isDue(c.srs.rec, now) || SRS.isDue(c.srs.prod, now)) p.due++;
  }
  const byId = Object.fromEntries(decks.map(d => [d.id, d]));
  app().innerHTML = `
    <div class="page-head"><h1>Словники</h1></div>
    <form class="panel row-form" id="newDeck">
      <input name="name" placeholder="Назва, напр. «Урок 5: подорожі»" required>
      <input name="folder" placeholder="Папка (необов'язково)" list="folders">
      ${folderDatalist(decks)}
      <button class="btn primary">Створити словник</button>
    </form>
    <div class="panel">
      <input id="search" type="search" placeholder="Пошук слова в усіх словниках">
      <div id="results"></div>
    </div>
    ${decks.length ? groupByFolder(decks).map(([f, list]) => `
      <section class="folder"><h2>${esc(f || 'Без папки')}</h2>
        <div class="deck-list">${list.map(d => {
          const p = per[d.id] || { n: 0, due: 0, fresh: 0 };
          return `<a class="deck" href="#/deck/${d.id}"><span class="deck-name">${esc(d.name)}</span>
            <span class="deck-meta">${p.n} сл.${p.due ? ` · <b>${p.due}</b> повторити` : ''}${p.fresh ? ` · ${p.fresh} нових` : ''}</span></a>`;
        }).join('')}</div></section>`).join('') : '<p class="muted">Словників ще немає.</p>'}`;

  $('#newDeck').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const d = newDeck(f.get('name'), f.get('folder'));
    await DB.put('decks', d);
    location.hash = '#/deck/' + d.id;
  };
  $('#search').oninput = e => {
    const q = norm(e.target.value);
    if (q.length < 2) { $('#results').innerHTML = ''; return; }
    const res = cards.filter(c => norm(c.en).includes(q) || norm(c.ua).includes(q)).slice(0, 50);
    $('#results').innerHTML = res.length
      ? `<table class="cards">${res.map(c => `<tr><td><b>${esc(c.en)}</b></td><td>${esc(c.ua)}</td><td class="right"><a href="#/deck/${c.deckId}">${esc(byId[c.deckId]?.name || '?')}</a></td></tr>`).join('')}</table>`
      : '<p class="muted">Нічого не знайдено.</p>';
  };
};

function cardModal(card, { onSave, onDelete }) {
  const m = modal(`<h3>Слово</h3>
    <form id="cf" class="stack">
      <label>Англійською<input name="en" value="${esc(card.en)}" required></label>
      <label>Переклад<input name="ua" value="${esc(card.ua)}" required></label>
      <label>Приклад<input name="example" value="${esc(card.example)}"></label>
      <label>Нотатка<input name="note" value="${esc(card.note)}"></label>
      <label>Теги через кому<input name="tags" value="${esc((card.tags || []).join(', '))}"></label>
      <div class="btns">
        <button class="btn primary">Зберегти</button>
        <button type="button" class="btn danger" id="cdel">Видалити</button>
        <button type="button" class="btn ghost" data-m="close">Скасувати</button>
      </div>
    </form>`);
  $('#cf', m.el).onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    Object.assign(card, { en: f.en.trim(), ua: f.ua.trim(), example: f.example.trim(), note: f.note.trim(), tags: parseTags(f.tags) });
    await DB.put('cards', card);
    m.close();
    onSave();
  };
  $('#cdel', m.el).onclick = async () => {
    if (!confirm(`Видалити «${card.en}»?`)) return;
    await DB.del('cards', card.id);
    m.close();
    onDelete();
  };
}

function parseBulk(text) {
  return String(text).split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    let parts;
    if (l.includes('\t')) parts = l.split('\t');
    else if (l.includes(';')) parts = l.split(';');
    else if (/ [-–—] /.test(l)) parts = l.split(/ [-–—] /);
    else if (l.includes('=')) parts = l.split('=');
    else parts = [l];
    const [en = '', ua = '', example = '', ...rest] = parts.map(s => s.trim());
    return { en, ua, example, note: rest.join('; ') };
  }).filter(r => r.en);
}

function dupIndex(cards, decks) {
  const names = Object.fromEntries(decks.map(d => [d.id, d.name]));
  const map = new Map();
  for (const c of cards) {
    const k = norm(c.en);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ deck: names[c.deckId] || '?', deckId: c.deckId, ua: c.ua });
  }
  return map;
}

Views.deck = async id => {
  const deck = await DB.get('decks', id);
  if (!deck) { app().innerHTML = '<div class="panel">Словник не знайдено. <a href="#/decks">До списку</a></div>'; return; }
  const [allCards, decks] = await Promise.all([DB.all('cards'), DB.all('decks')]);
  let cards = allCards.filter(c => c.deckId === id).sort((a, b) => a.createdAt - b.createdAt);
  const dups = dupIndex(allCards, decks);
  const tags = allTags(cards);
  const others = decks.filter(d => d.id !== id).sort((a, b) => natCmp(a.name, b.name));

  app().innerHTML = `
    <div class="page-head">
      <div><a href="#/decks" class="crumb">Словники${deck.folder ? ' / ' + esc(deck.folder) : ''}</a><h1>${esc(deck.name)}</h1></div>
      <div class="btns">
        <a class="btn primary" href="#/study/${id}">Вчити</a>
        <button class="btn" data-act="practiceAll">Пройти всі слова</button>
        <button class="btn ghost" data-act="editDeck">Назва і папка</button>
      </div>
    </div>
    <form class="panel stack" id="addCard">
      <h3>Додати слово</h3>
      <div class="grid2">
        <input name="en" placeholder="Слово або фраза англійською" required autocomplete="off">
        <input name="ua" placeholder="Переклад" required autocomplete="off">
      </div>
      <input name="example" placeholder="Приклад речення (необов'язково)" autocomplete="off">
      <div class="grid2">
        <input name="note" placeholder="Нотатка (необов'язково)" autocomplete="off">
        <input name="tags" placeholder="Теги через кому" autocomplete="off">
      </div>
      <p id="dupWarn" class="warn" hidden></p>
      <div class="btns">
        <button class="btn primary">Додати</button>
        <button type="button" class="btn ghost" data-act="toggleBulk">Додати списком</button>
      </div>
    </form>
    <div class="panel stack" id="bulk" hidden>
      <h3>Додати списком</h3>
      <p class="muted">Один рядок, одне слово: <code>слово ; переклад ; приклад</code>. Також підходить копія двох колонок з Excel чи Google Sheets, або <code>слово - переклад</code>.</p>
      <textarea id="bulkText" rows="8" placeholder="get along ; ладнати ; We get along well.&#10;reliable ; надійний"></textarea>
      <div class="btns"><button class="btn primary" data-act="bulkAdd">Додати всі рядки</button></div>
    </div>
    <div class="panel">
      <div class="toolbar">
        <input type="search" id="filter" placeholder="Фільтр">
        ${tags.length ? `<select id="tagFilter"><option value="">Усі теги</option>${tags.map(t => `<option>${esc(t)}</option>`).join('')}</select>` : ''}
        <span class="muted" id="count"></span>
      </div>
      <div class="toolbar sel-bar" id="selBar" hidden>
        <span id="selCount"></span>
        ${others.length ? `<select id="moveTo"><option value="">Перемістити в…</option>${others.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>` : ''}
        <button class="btn small" data-act="toExpr" title="Копіює слова у вирази; у словнику вони лишаються">До виразів</button>
        <button class="btn small" data-act="resetSel">Скинути прогрес</button>
        <button class="btn small danger" data-act="deleteSel">Видалити</button>
      </div>
      <div class="table-wrap"><table class="cards">
        <thead><tr><th class="cb"><input type="checkbox" id="selAll" aria-label="Вибрати всі"></th><th>Слово</th><th>Переклад</th><th>Стан</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
    </div>
    <details class="panel">
      <summary>Текст уроку</summary>
      <textarea id="source" rows="10" placeholder="Тут можна зберегти текст уроку">${esc(deck.source || '')}</textarea>
      <div class="btns"><button class="btn" data-act="saveSource">Зберегти текст</button></div>
    </details>`;

  const sel = new Set();
  const updSel = () => {
    $('#selBar').hidden = !sel.size;
    $('#selCount').textContent = `Вибрано: ${sel.size}`;
  };
  const drawRows = () => {
    const q = norm($('#filter').value);
    const t = $('#tagFilter')?.value || '';
    const list = cards.filter(c => (!q || norm(c.en).includes(q) || norm(c.ua).includes(q)) && (!t || (c.tags || []).includes(t)));
    $('#count').textContent = `${list.length} з ${cards.length}`;
    $('#rows').innerHTML = list.map(c => {
      const rec = SRS.label(c.srs?.rec), prod = SRS.label(c.srs?.prod);
      return `<tr>
        <td class="cb"><input type="checkbox" data-sel="${c.id}" ${sel.has(c.id) ? 'checked' : ''}></td>
        <td><b>${esc(c.en)}</b>${c.example ? `<div class="ex">${esc(c.example)}</div>` : ''}</td>
        <td>${esc(c.ua)}${c.note ? `<div class="ex">${esc(c.note)}</div>` : ''}${c.tags?.length ? `<div class="tags">${c.tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}</td>
        <td class="state"><span class="badge ${rec.cls}" title="Впізнаю слово">переклад: ${rec.text}</span><span class="badge ${prod.cls}" title="Пишу слово сама">написання: ${prod.text}</span></td>
        <td class="right"><button class="btn small ghost" data-act="edit" data-id="${c.id}">Змінити</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Слів поки немає.</td></tr>';
    $('#selAll').checked = false;
    updSel();
  };
  drawRows();

  $('#filter').oninput = drawRows;
  if ($('#tagFilter')) $('#tagFilter').onchange = drawRows;
  $('#rows').onchange = e => {
    const cid = e.target.dataset.sel;
    if (!cid) return;
    e.target.checked ? sel.add(cid) : sel.delete(cid);
    updSel();
  };
  $('#selAll').onchange = e => {
    $$('[data-sel]').forEach(cb => {
      cb.checked = e.target.checked;
      e.target.checked ? sel.add(cb.dataset.sel) : sel.delete(cb.dataset.sel);
    });
    updSel();
  };
  if ($('#moveTo')) $('#moveTo').onchange = async e => {
    const to = e.target.value;
    if (!to) return;
    const moved = cards.filter(c => sel.has(c.id));
    moved.forEach(c => { c.deckId = to; });
    await DB.putMany('cards', moved);
    toast(`Переміщено: ${moved.length}`);
    render();
  };

  const form = $('#addCard');
  form.en.oninput = () => {
    const found = dups.get(norm(form.en.value));
    $('#dupWarn').hidden = !found;
    if (found) $('#dupWarn').textContent = 'Уже є: ' + found.map(f => `«${f.deck}» (${f.ua})`).join(', ');
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const c = newCard(Object.fromEntries(new FormData(form)), id);
    await DB.put('cards', c);
    cards.push(c);
    const k = norm(c.en);
    if (!dups.has(k)) dups.set(k, []);
    dups.get(k).push({ deck: deck.name, deckId: id, ua: c.ua });
    form.reset();
    $('#dupWarn').hidden = true;
    form.en.focus();
    drawRows();
    toast(`Додано: ${c.en}`);
  };

  actions.toggleBulk = () => { $('#bulk').hidden = !$('#bulk').hidden; if (!$('#bulk').hidden) $('#bulkText').focus(); };
  actions.bulkAdd = async () => {
    const rows = parseBulk($('#bulkText').value);
    const inDeck = new Set(cards.map(c => norm(c.en)));
    const fresh = rows.filter(r => !inDeck.has(norm(r.en))).map(r => newCard(r, id));
    await DB.putMany('cards', fresh);
    const skipped = rows.length - fresh.length;
    toast(`Додано: ${fresh.length}${skipped ? `, пропущено повторів: ${skipped}` : ''}`);
    render();
  };
  actions.edit = el => {
    const card = cards.find(c => c.id === el.dataset.id);
    cardModal(card, {
      onSave: drawRows,
      onDelete: () => { cards = cards.filter(c => c.id !== card.id); sel.delete(card.id); drawRows(); },
    });
  };
  actions.toExpr = async () => {
    const existing = await DB.all('expressions');
    const known = new Set(existing.map(x => ExprCore.expressionKey(x.expression)));
    const now = Date.now();
    const fresh = [];
    for (const c of cards.filter(c => sel.has(c.id))) {
      const key = ExprCore.expressionKey(c.en);
      if (!key || known.has(key)) continue;
      known.add(key);
      fresh.push(ExprCore.makeExpression({ expression: c.en, meaning_uk: c.ua, cue_uk: '', example_en: c.example, note: c.note }, deck.name, now + fresh.length));
    }
    await DB.putMany('expressions', fresh);
    await promoteQueue();
    const skipped = sel.size - fresh.length;
    toast(`До виразів додано: ${fresh.length}${skipped ? `, уже були: ${skipped}` : ''}. Ситуацію-підказку можна дописати у «Вирази».`);
  };
  actions.deleteSel = async () => {
    if (!confirm(`Видалити вибрані слова (${sel.size})?`)) return;
    await DB.delMany('cards', [...sel]);
    render();
  };
  actions.resetSel = async () => {
    if (!confirm(`Скинути прогрес для ${sel.size} слів? Вони знову стануть новими.`)) return;
    const list = cards.filter(c => sel.has(c.id));
    list.forEach(c => { c.srs = { rec: null, prod: null }; });
    await DB.putMany('cards', list);
    render();
  };
  actions.practiceAll = () => Study.words({ deckIds: [id], set: 'all', mode: 'mix' });
  actions.saveSource = async () => { deck.source = $('#source').value; await DB.put('decks', deck); toast('Збережено'); };
  actions.editDeck = () => {
    const m = modal(`<h3>Словник</h3>
      <form id="df" class="stack">
        <label>Назва<input name="name" value="${esc(deck.name)}" required></label>
        <label>Папка<input name="folder" value="${esc(deck.folder)}" list="folders2"></label>
        ${folderDatalist(decks, 'folders2')}
        <div class="btns">
          <button class="btn primary">Зберегти</button>
          <button type="button" class="btn danger" id="ddel">Видалити словник</button>
          <button type="button" class="btn ghost" data-m="close">Скасувати</button>
        </div>
      </form>`);
    $('#df', m.el).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      deck.name = f.get('name').trim();
      deck.folder = f.get('folder').trim();
      await DB.put('decks', deck);
      m.close();
      render();
    };
    $('#ddel', m.el).onclick = async () => {
      if (!confirm(`Видалити словник «${deck.name}» і всі його слова (${cards.length})?`)) return;
      await DB.delMany('cards', cards.map(c => c.id));
      await DB.del('decks', id);
      m.close();
      location.hash = '#/decks';
    };
  };
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DRAFT_KEY = 'et-lesson-draft';
function loadDraft(level) {
  try { return { text: '', response: '', grammar: true, level, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') }; }
  catch { return { text: '', response: '', grammar: true, level }; }
}
function saveDraft(d) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
}

function lessonPrompt(text, level, withGrammar) {
  return `Я вивчаю англійську, мій рівень ${level}. Нижче текст мого уроку.

Завдання:
1. Вибери з тексту слова, фразові дієслова, сталі вирази й колокації, які варто вивчити на моєму рівні. Пропусти найпростіші слова, які на цьому рівні вже відомі.
2. Для кожного дай: англійську форму (дієслова без "to", фразові дієслова повністю), переклад українською в значенні з цього тексту, речення-приклад з уроку (якщо в уроці немає повного речення, склади коротке), частину мови.
${withGrammar ? `3. Визнач граматичні теми, які є в уроці. Для кожної дай коротке правило українською у форматі markdown (коли вживається, як утворюється, слова-маркери, приклади) і 6-8 вправ двох типів:
   - "gap": речення з пропуском ___, у дужках дієслово в початковій формі, 2-3 варіанти в "options";
   - "translate": речення українською для перекладу англійською, кілька прийнятних перекладів у "answers".
   До кожної вправи одне речення пояснення українською.
` : ''}
Відповідь дай лише одним блоком JSON без пояснень, за схемою:
{
  "words": [
    {"en": "get along", "ua": "ладнати, мати добрі стосунки", "example": "We get along really well.", "pos": "phrasal verb", "note": ""}
  ]${withGrammar ? `,
  "grammar": [
    {"topic": "Present Perfect vs Past Simple", "rule": "## Present Perfect\\n...", "exercises": [
      {"kind": "gap", "prompt": "I ___ (see) this film yesterday.", "answers": ["saw"], "options": ["saw", "have seen"], "explanation": "Є точний час у минулому (yesterday), тому Past Simple."},
      {"kind": "translate", "prompt": "Я вже прочитала цю книгу.", "answers": ["I have already read this book.", "I've already read this book."], "explanation": "already і результат зараз: Present Perfect."}
    ]}
  ]` : ''}
}

Текст уроку:
"""
${text.trim()}
"""`;
}

Views.lesson = async () => {
  const [decks, topics, allCards, s] = await Promise.all([DB.all('decks'), DB.all('topics'), DB.all('cards'), getSettings()]);
  const draft = loadDraft(s.level);
  app().innerHTML = `
    <div class="page-head"><h1>Новий урок</h1></div>
    <div class="panel stack">
      <h3>1. Текст уроку</h3>
      <textarea id="lt" rows="10" placeholder="Вставте сюди текст уроку">${esc(draft.text)}</textarea>
      <div class="toolbar">
        <label>Мій рівень <select id="lvl">${LEVELS.map(l => `<option ${l === draft.level ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="wg" ${draft.grammar ? 'checked' : ''}> також граматика з вправами</label>
      </div>
      <div class="btns">
        <button class="btn primary" data-act="copyPrompt">Скопіювати запит для Claude</button>
        <a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">Відкрити Claude</a>
      </div>
      <p class="muted">Вставте скопійований запит у новий чат із Claude, а його відповідь скопіюйте в поле нижче.</p>
    </div>
    <div class="panel stack">
      <h3>2. Відповідь Claude</h3>
      <textarea id="resp" rows="6" placeholder="Вставте сюди відповідь Claude повністю">${esc(draft.response)}</textarea>
      <div class="btns"><button class="btn primary" data-act="parse">Показати слова</button></div>
    </div>
    <div class="panel stack" id="pick" hidden></div>`;

  const persist = () => saveDraft({ text: $('#lt').value, response: $('#resp').value, level: $('#lvl').value, grammar: $('#wg').checked });
  ['#lt', '#resp'].forEach(sel => { $(sel).oninput = persist; });
  ['#lvl', '#wg'].forEach(sel => { $(sel).onchange = persist; });

  actions.copyPrompt = async () => {
    const text = $('#lt').value;
    if (!text.trim()) { toast('Спочатку вставте текст уроку'); return; }
    await copyText(lessonPrompt(text, $('#lvl').value, $('#wg').checked));
    s.level = $('#lvl').value;
    await saveSettings(s);
    toast('Запит скопійовано. Вставте його в чат із Claude.');
  };
  actions.parse = () => {
    let data;
    try { data = parseClaudeJson($('#resp').value); }
    catch { toast('Не вдалося прочитати відповідь. Скопіюйте її повністю, разом з дужками { }.'); return; }
    renderPick(data, { decks, topics, allCards });
  };
  if (draft.response.trim()) { try { renderPick(parseClaudeJson(draft.response), { decks, topics, allCards }); } catch {} }
};

function renderPick(data, { decks, topics, allCards }) {
  const dups = dupIndex(allCards, decks);
  const words = data.words.filter(w => w && w.en).map(w => ({ ...w, dup: dups.get(norm(w.en)) }));
  const topicByName = new Map(topics.map(t => [norm(t.name), t]));
  const grammar = (data.grammar || []).filter(g => g && g.topic);
  const today = new Date().toLocaleDateString('uk-UA');
  const pick = $('#pick');
  pick.hidden = false;
  pick.innerHTML = `
    <h3>3. Виберіть потрібне</h3>
    ${words.length ? `
      <div class="toolbar">
        <button class="btn small" data-act="all">Вибрати всі</button>
        <button class="btn small" data-act="none">Зняти всі</button>
        <span class="muted" id="pc"></span>
      </div>
      <p class="muted">Переклад і приклад можна виправити прямо тут. Слова, які вже є у ваших словниках, не позначені.</p>
      <div class="table-wrap"><table class="cards pick">
        <thead><tr><th class="cb"></th><th>Слово</th><th>Переклад</th><th>Приклад</th></tr></thead>
        <tbody>${words.map((w, i) => `<tr data-i="${i}" class="${w.dup ? 'dup' : ''}">
          <td class="cb"><input type="checkbox" class="pw" ${w.dup ? '' : 'checked'}></td>
          <td><input class="cell" data-f="en" value="${esc(w.en)}">${w.pos ? `<div class="ex">${esc(w.pos)}</div>` : ''}${w.dup ? `<div class="warn small">уже є: ${esc(w.dup.map(d => d.deck).join(', '))}</div>` : ''}</td>
          <td><input class="cell" data-f="ua" value="${esc(w.ua)}"></td>
          <td><textarea class="cell" data-f="example" rows="2">${esc(w.example)}</textarea></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <h4>Куди додати слова</h4>
      <div class="toolbar">
        <select id="target">
          <option value="__new">Новий словник</option>
          ${decks.sort((a, b) => natCmp(a.name, b.name)).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
        </select>
        <input id="newName" placeholder="Назва словника" value="Урок ${today}">
        <input id="newFolder" placeholder="Папка (необов'язково)" list="lfolders">
        ${folderDatalist(decks, 'lfolders')}
      </div>
      <label class="check"><input type="checkbox" id="saveText" checked> зберегти текст уроку в словнику</label>` : '<p class="muted">У відповіді немає слів.</p>'}
    ${grammar.length ? `<h4>Граматика</h4>${grammar.map((g, gi) => {
      const existing = topicByName.get(norm(g.topic));
      return `<div class="g-pick" data-g="${gi}">
        <label class="check"><input type="checkbox" class="pg" checked> <b>${esc(g.topic)}</b> <span class="muted">${existing ? 'додати до наявної теми' : 'нова тема'}, вправ: ${(g.exercises || []).length}</span></label>
        <details><summary>Переглянути</summary>${g.rule ? `<div class="md">${md(g.rule)}</div>` : ''}<ul>${(g.exercises || []).map(x => `<li>${esc(x.prompt)} → <b>${esc([].concat(x.answers ?? x.answer ?? []).join(' / '))}</b></li>`).join('')}</ul></details>
      </div>`;
    }).join('')}` : ''}
    <div class="btns"><button class="btn primary big" data-act="importPicked">Додати вибране</button></div>`;

  const count = () => { if ($('#pc')) $('#pc').textContent = `Вибрано: ${$$('.pw:checked').length} з ${words.length}`; };
  count();
  pick.onchange = e => { if (e.target.classList.contains('pw')) count(); if (e.target.id === 'target') $('#newName').hidden = $('#newFolder').hidden = e.target.value !== '__new'; };
  actions.all = () => { $$('.pw').forEach(cb => { cb.checked = true; }); count(); };
  actions.none = () => { $$('.pw').forEach(cb => { cb.checked = false; }); count(); };

  actions.importPicked = async () => {
    const chosen = $$('#pick tr[data-i]').filter(tr => $('.pw', tr).checked).map(tr => {
      const w = words[+tr.dataset.i];
      const f = Object.fromEntries($$('.cell', tr).map(el => [el.dataset.f, el.value]));
      return { ...f, note: w.note || '', tags: w.pos ? [String(w.pos).toLowerCase()] : [] };
    }).filter(w => w.en.trim());
    const chosenG = $$('.g-pick').filter(el => $('.pg', el).checked).map(el => grammar[+el.dataset.g]);
    if (!chosen.length && !chosenG.length) { toast('Нічого не вибрано'); return; }

    let deckId = null;
    if (chosen.length) {
      const target = $('#target').value;
      let deck;
      if (target === '__new') {
        const name = $('#newName').value.trim();
        if (!name) { toast('Вкажіть назву словника'); $('#newName').focus(); return; }
        deck = newDeck(name, $('#newFolder').value);
      } else deck = decks.find(d => d.id === target);
      if ($('#saveText').checked) {
        const text = $('#lt').value.trim();
        deck.source = deck.source ? deck.source + '\n\n---\n\n' + text : text;
      }
      await DB.put('decks', deck);
      await DB.putMany('cards', chosen.map(w => newCard(w, deck.id)));
      deckId = deck.id;
    }
    let exCount = 0;
    for (const g of chosenG) {
      let topic = topicByName.get(norm(g.topic));
      if (!topic) { topic = newTopic(g.topic, '', g.rule || ''); topicByName.set(norm(topic.name), topic); }
      else if (!topic.content && g.rule) topic.content = g.rule;
      await DB.put('topics', topic);
      const exs = (g.exercises || []).map(x => newExercise(x, topic.id)).filter(Boolean);
      exCount += exs.length;
      await DB.putMany('exercises', exs);
    }
    saveDraft({ text: '', response: '', level: $('#lvl').value, grammar: $('#wg').checked });
    toast(`Додано слів: ${chosen.length}${chosenG.length ? `, граматичних вправ: ${exCount}` : ''}`);
    location.hash = deckId ? '#/deck/' + deckId : '#/grammar';
  };
}

Views.study = async preId => {
  const [decks, cards, ctx] = await Promise.all([DB.all('decks'), DB.all('cards'), wordContext()]);
  if (!decks.length) { app().innerHTML = '<div class="panel">Спочатку створіть словник. <a href="#/lesson">Новий урок</a></div>'; return; }
  const count = Object.fromEntries(decks.map(d => [d.id, 0]));
  cards.forEach(c => { if (count[c.deckId] !== undefined) count[c.deckId]++; });
  const tags = allTags(cards);
  app().innerHTML = `
    <div class="page-head"><h1>Тренування</h1></div>
    <div class="panel stack">
      <h3>Словники</h3>
      <div class="toolbar"><button class="btn small" data-act="all">Усі</button><button class="btn small" data-act="none">Жодного</button></div>
      ${groupByFolder(decks).map(([f, list]) => `<fieldset class="deck-pick"><legend>${esc(f || 'Без папки')}</legend>
        ${list.map(d => `<label class="check"><input type="checkbox" class="sd" value="${d.id}" ${!preId || preId === d.id ? 'checked' : ''}> ${esc(d.name)} <span class="muted">(${count[d.id]})</span></label>`).join('')}
      </fieldset>`).join('')}
      ${tags.length ? `<label>Лише з тегом <select id="tag"><option value="">будь-який</option>${tags.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="panel stack">
      <h3>Які слова</h3>
      ${Object.entries(WORD_SETS).map(([k, v], i) => `<label class="check"><input type="radio" name="set" value="${k}" ${i === 0 ? 'checked' : ''}> ${v}${k === 'next' ? ` <input type="number" id="nextCount" min="1" max="500" value="${ctx.s.newPerDay}" class="num">` : ''} <span class="muted" data-count="${k}"></span></label>`).join('')}
      <h3>Як вчити</h3>
      ${Object.entries(MODES).map(([k, v], i) => `<label class="check"><input type="radio" name="mode" value="${k}" ${i === 0 ? 'checked' : ''}> ${v}</label>`).join('')}
      <p class="muted">Картки і вибір перекладу тренують впізнавання слова, вибір англійського слова і написання тренують уміння згадати його. Прогрес для цих двох умінь рахується окремо, мікс тренує обидва.</p>
    </div>
    <div class="btns"><button class="btn primary big" data-act="start">Почати</button></div>`;

  const params = () => ({
    deckIds: $$('.sd:checked').map(cb => cb.value),
    tag: $('#tag')?.value || '',
    mode: $('input[name=mode]:checked').value,
    set: $('input[name=set]:checked').value,
    count: Math.max(1, +$('#nextCount').value || ctx.s.newPerDay),
  });
  const updateCounts = () => {
    // Сесія тренування малює себе в тому самому #app, тож поза сторінкою вибору нічого не рахуємо.
    if (!$('#nextCount')) { app().onchange = null; return; }
    const p = params();
    const chosen = cards.filter(c => p.deckIds.includes(c.deckId) && (!p.tag || (c.tags || []).includes(p.tag)));
    for (const set of Object.keys(WORD_SETS)) {
      const n = wordTasks(chosen, { ...ctx, set, mode: p.mode, count: p.count }).length;
      $(`[data-count="${set}"]`).textContent = `(${n} ${n === 1 ? 'завдання' : 'завдань'})`;
    }
  };
  app().onchange = updateCounts;
  $('#nextCount').oninput = updateCounts;
  updateCounts();

  actions.all = () => { $$('.sd').forEach(cb => { cb.checked = true; }); updateCounts(); };
  actions.none = () => { $$('.sd').forEach(cb => { cb.checked = false; }); updateCounts(); };
  actions.start = () => {
    const p = params();
    if (!p.deckIds.length) { toast('Виберіть хоча б один словник'); return; }
    Study.words(p);
  };
};
