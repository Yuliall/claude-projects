const EXPR_GRADES = [
  ['forgot', 'Забула · Forgot', 'r1'],
  ['partly', 'Частково · Partly', 'r2'],
  ['got', 'Згадала · Got it', 'r3'],
];
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const MIC_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';

async function exprLimits() {
  const s = await getSettings();
  return { reviewsPerDay: s.exprReviewsPerDay, newPerDay: s.exprNewPerDay, activeMax: s.exprActiveMax };
}

async function promoteQueue() {
  const [all, lim] = await Promise.all([DB.all('expressions'), exprLimits()]);
  const promoted = ExprCore.promote(all, lim.activeMax, ExprCore.dayKey());
  if (promoted.length) await DB.putMany('expressions', promoted);
  return promoted.length;
}

async function exprPlan() {
  await promoteQueue();
  const [all, lim, logs] = await Promise.all([DB.all('expressions'), exprLimits(), DB.since('log', 'ts', startOfDay())]);
  const today = ExprCore.dayKey();
  return { all, lim, today, ...ExprCore.planDay(all, today, ExprCore.countDone(logs, today), lim) };
}

async function copyRolePlay() {
  const [all, logs] = await Promise.all([DB.all('expressions'), DB.since('log', 'ts', startOfDay())]);
  const list = ExprCore.rolePlayPick(logs, Object.fromEntries(all.map(c => [c.id, c])), ExprCore.dayKey());
  if (!list.length) { toast('Сьогодні ще не було повторення виразів'); return; }
  await copyText(list.join(', '));
  toast('Скопійовано: ' + list.join(', '));
}

const fmtDay = key => key ? key.split('-').reverse().slice(0, 2).join('.') : '';

function exprDueText(c, today) {
  if (c.status === 'queued') return 'у черзі';
  if (ExprCore.isNew(c)) return 'нове';
  if (c.due_date <= today) return 'повторити сьогодні';
  return `наступне ${fmtDay(c.due_date)} · інтервал ${c.interval_days} дн`;
}

function exprRow(c, today) {
  return `<div class="expr-row" data-row="${c.id}">
    <div class="expr-main">
      <b>${esc(c.expression)}</b> <span class="muted">${esc(c.meaning_uk)}</span>
      <div class="ex">без підказки: ${c.used_unprompted_count || 0} · з підказкою: ${c.used_with_hint_count || 0} · ${exprDueText(c, today)}</div>
    </div>
    <div class="btns expr-use">
      ${c.status === 'active' ? `
        <button class="btn small" data-act="useFree" data-id="${c.id}">+ без підказки · used without hint</button>
        <button class="btn small" data-act="useHint" data-id="${c.id}">+ з підказкою · with hint</button>` : ''}
      <button class="btn small ghost" data-act="editExpr" data-id="${c.id}">Змінити</button>
    </div>
  </div>`;
}

Views.expr = async () => {
  const plan = await exprPlan();
  const { all, lim, today } = plan;
  const byStatus = st => all.filter(c => c.status === st);
  const active = byStatus('active').sort((a, b) => String(a.activated_at).localeCompare(String(b.activated_at)) || a.created_at.localeCompare(b.created_at));
  const queued = byStatus('queued').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const mastered = byStatus('mastered').sort((a, b) => String(b.mastered_at).localeCompare(String(a.mastered_at)));
  const n = plan.reviews.length + plan.fresh.length;

  app().innerHTML = `
    <div class="page-head">
      <div><h1>Вирази</h1><p class="muted">Активних ${active.length} з ${lim.activeMax}${queued.length ? ` · у черзі ${queued.length}` : ''} · засвоєно ${mastered.length}</p></div>
      <div class="btns">
        <a class="btn primary" href="#/expr-review" ${n ? '' : 'aria-disabled="true"'}>Повторити: ${n}</a>
        <a class="btn" href="#/expr-import">Імпорт</a>
        <a class="btn" href="#/expr-progress">Прогрес</a>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar"><h3>Активні</h3></div>
      <p class="muted small">Після уроку або рольової гри з Claude позначте, які вирази ви вжили в мовленні. Два вживання без підказки роблять вираз засвоєним, і з черги приходить наступний.</p>
      <div id="activeList">${active.length ? active.map(c => exprRow(c, today)).join('') : '<p class="muted">Активних виразів немає. Додайте їх через <a href="#/expr-import">Імпорт</a>.</p>'}</div>
    </div>
    ${queued.length ? `<details class="panel"><summary>Черга (${queued.length})</summary>
      <p class="muted small">Вирази з черги стають активними автоматично, коли звільняється місце.</p>
      ${queued.map(c => exprRow(c, today)).join('')}</details>` : ''}
    ${mastered.length ? `<details class="panel"><summary>Засвоєні (${mastered.length})</summary>
      <p class="muted small">Повторюються раз на 30 днів.</p>
      ${mastered.map(c => exprRow(c, today)).join('')}</details>` : ''}`;

  const byId = Object.fromEntries(all.map(c => [c.id, c]));
  const use = kind => async el => {
    const before = byId[el.dataset.id];
    const ts = Date.now();
    const upd = ExprCore.applyUsage(before, kind, ts);
    await DB.put('expressions', upd);
    await DB.put('log', { ts, type: 'usage', itemId: upd.id, kind });
    byId[upd.id] = upd;
    if (upd.status === 'mastered') {
      const p = await promoteQueue();
      toast(`«${upd.expression}» засвоєно${p ? '. З черги додано новий вираз' : ''}`);
      render();
      return;
    }
    $(`[data-row="${upd.id}"]`).outerHTML = exprRow(upd, today);
    toast(kind === 'unprompted' ? `+1 без підказки: ${upd.expression}` : `+1 з підказкою: ${upd.expression}`);
  };
  actions.useFree = use('unprompted');
  actions.useHint = use('hint');
  actions.editExpr = el => exprModal(byId[el.dataset.id]);
};

function exprModal(c) {
  const m = modal(`<h3>Вираз</h3>
    <form id="xef" class="stack">
      <label>Вираз (expression)<input name="expression" value="${esc(c.expression)}" required></label>
      <label>Значення (meaning_uk)<input name="meaning_uk" value="${esc(c.meaning_uk)}" required></label>
      <label>Ситуація-підказка (cue_uk)<textarea name="cue_uk" rows="2">${esc(c.cue_uk)}</textarea></label>
      <label>Приклад (example_en)<textarea name="example_en" rows="2">${esc(c.example_en)}</textarea></label>
      <label>Цитата з уроку<input name="note" value="${esc(c.note)}"></label>
      <label>Джерело<input name="source" value="${esc(c.source)}"></label>
      <div class="grid2">
        <label>Без підказки<input type="number" min="0" name="used_unprompted_count" value="${c.used_unprompted_count || 0}"></label>
        <label>З підказкою<input type="number" min="0" name="used_with_hint_count" value="${c.used_with_hint_count || 0}"></label>
      </div>
      <p class="muted small">Статус: ${{ active: 'активний', queued: 'у черзі', mastered: 'засвоєний' }[c.status]}${c.created_at ? ` · додано ${new Date(c.created_at).toLocaleDateString('uk-UA')}` : ''}</p>
      <div class="btns">
        <button class="btn primary">Зберегти</button>
        <button type="button" class="btn danger" id="xdel">Видалити</button>
        <button type="button" class="btn ghost" data-m="close">Скасувати</button>
      </div>
    </form>`);
  $('#xef', m.el).onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const upd = ExprCore.checkMastered({
      ...c,
      expression: f.expression.trim(), meaning_uk: f.meaning_uk.trim(), cue_uk: f.cue_uk.trim(),
      example_en: f.example_en.trim(), note: f.note.trim(), source: f.source.trim(),
      used_unprompted_count: Math.max(0, +f.used_unprompted_count || 0),
      used_with_hint_count: Math.max(0, +f.used_with_hint_count || 0),
    }, ExprCore.dayKey());
    await DB.put('expressions', upd);
    await promoteQueue();
    m.close();
    render();
  };
  $('#xdel', m.el).onclick = async () => {
    if (!confirm(`Видалити вираз «${c.expression}»?`)) return;
    await DB.del('expressions', c.id);
    await promoteQueue();
    m.close();
    render();
  };
}

// ---------- повторення ----------

Views['expr-review'] = async () => {
  const plan = await exprPlan();
  const tasks = [...plan.reviews, ...plan.fresh];
  if (!tasks.length) {
    const queued = plan.all.filter(c => c.status === 'queued').length;
    app().innerHTML = `<div class="panel center"><h2>На сьогодні все</h2>
      <p>${plan.all.length ? 'Повторення виразів на сьогодні зроблено або вичерпано денний ліміт. Решта перейде на завтра.' : 'Виразів ще немає.'}${queued ? ` У черзі ${queued}: вони стануть активними, коли звільниться місце.` : ''}</p>
      <div class="btns center"><a class="btn" href="#/expr-import">Імпорт</a><a class="btn" href="#/expr">Усі вирази</a><a class="btn" href="#/">На головну</a></div></div>`;
    return;
  }
  runExprSession(tasks);
};

function runExprSession(tasks) {
  const queue = tasks.map(c => ({ c, practice: false }));
  const total = tasks.length;
  const results = new Map();
  let done = 0;

  const step = () => {
    document.onkeydown = null;
    app().onchange = null;
    if (!queue.length) return finish();
    const t = queue.shift();
    app().innerHTML = `<div class="session">
      <div class="session-head">
        <button class="btn ghost small" data-act="quit">Завершити</button>
        <div class="bar"><div style="width:${Math.round(done / total * 100)}%"></div></div>
        <span class="muted">${done} / ${total}</span>
      </div>
      <div id="ex"></div></div>`;
    actions.quit = finish;
    let graded = false;
    exprCard(t, $('#ex'), async grade => {
      if (graded) return;
      graded = true;
      if (!t.practice) {
        const wasNew = ExprCore.isNew(t.c);
        const upd = ExprCore.schedule(t.c, grade, ExprCore.dayKey());
        await DB.put('expressions', upd);
        await DB.put('log', { ts: Date.now(), type: 'expr', itemId: upd.id, grade, first: wasNew });
        results.set(upd.id, { c: upd, grade });
        t.c = upd;
      }
      // «Забула» ще раз у кінці сесії лише для практики; на розклад це не впливає.
      if (grade === 'forgot' && !t.practice) queue.push({ c: t.c, practice: true });
      else done++;
      step();
    });
  };

  const finish = () => {
    document.onkeydown = null;
    if (!results.size) { location.hash = '#/expr'; render(); return; }
    const list = [...results.values()];
    const count = g => list.filter(r => r.grade === g).length;
    const weak = list.filter(r => r.grade !== 'got');
    app().innerHTML = `<div class="panel center">
      <h2>Готово</h2>
      <p>Згадала: <b>${count('got')}</b> · частково: <b>${count('partly')}</b> · забула: <b>${count('forgot')}</b></p>
      ${weak.length ? `<h3>Варто вжити в розмові</h3><ul class="wrong-list">${weak.map(r => `<li><b>${esc(r.c.expression)}</b> — ${esc(r.c.meaning_uk)}</li>`).join('')}</ul>` : ''}
      <div class="btns center">
        <button class="btn primary" data-act="rolePlay">Скопіювати для рольової гри · Copy for role-play</button>
        <a class="btn" href="#/expr">Усі вирази</a>
        <a class="btn" href="#/">На головну</a>
      </div></div>`;
    actions.rolePlay = copyRolePlay;
  };

  step();
}

function tokensHtml(tokens) {
  return tokens.map(t => {
    const text = esc(t.text);
    if (t.state === 'extra') return `<s class="del" title="зайве">${text}</s>`;
    if (t.state === 'missing') return `<mark class="ins" title="пропущено">${text}</mark>`;
    if (t.state === 'missing-opt') return `<mark class="ins opt" title="пропущено (необов'язкова частина)">${text}</mark>`;
    if (t.state === 'neutral') return `<span class="muted">${text}</span>`;
    return text;
  }).join(' ');
}

function exprCard(t, el, onGrade) {
  const c = t.c;
  el.innerHTML = `<div class="ex-card">
      <div class="ex-label">${t.practice ? 'Ще раз · Once more' : 'Згадайте вираз англійською · Recall the expression'}</div>
      ${c.cue_uk ? `<div class="ex-sentence">${esc(c.cue_uk)}</div>` : ''}
      <div class="ex-meaning">${esc(c.meaning_uk)}</div>
      <div class="say-first">Спершу скажіть вголос · Say it aloud first</div>
    </div>
    <form id="ef" class="type-form expr-form">
      <input id="ei" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Вираз англійською · Type the expression">
      ${SpeechRec ? `<button type="button" class="btn mic" id="mic" title="Продиктувати · Dictate" aria-label="Продиктувати">${MIC_ICON}</button>` : ''}
      <button class="btn primary">Перевірити · Check</button>
    </form>
    <div id="after"></div>`;
  $('#ei').focus();

  if (SpeechRec) {
    $('#mic').onclick = () => {
      const btn = $('#mic');
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      btn.classList.add('listening');
      btn.disabled = true;
      rec.onresult = e => { const input = $('#ei'); if (input && !input.disabled) input.value = e.results[0][0].transcript; };
      rec.onerror = e => toast(e.error === 'not-allowed' ? 'Немає дозволу на мікрофон' : 'Не вдалося розпізнати мову');
      rec.onend = () => { btn.classList.remove('listening'); btn.disabled = false; };
      try { rec.start(); } catch { rec.onend(); }
    };
  }

  let revealed = false;
  $('#ef').onsubmit = e => {
    e.preventDefault();
    if (revealed) return;
    revealed = true;
    const answer = $('#ei').value;
    $('#ei').disabled = true;
    $$('#ef button').forEach(b => { b.disabled = true; });
    const r = ExprCore.compare(answer, c.expression);
    const verdict = { got: 'Збігається', partly: 'Збігається частково', forgot: 'Не збігається' }[r.suggestion];
    $('#after').innerHTML = `<div class="ex-card reveal">
        <div class="ex-word">${esc(c.expression)} ${sayBtn(c.expression)}</div>
        ${c.example_en ? `<div class="ex-example">${esc(c.example_en)}</div>` : ''}
        ${c.note ? `<div class="ex-note">З уроку: «${esc(c.note)}»</div>` : ''}
        <div class="diff">
          ${answer.trim() ? `<div><span class="muted">Ваша відповідь:</span> ${tokensHtml(r.answer)}</div>` : '<div class="muted">Без відповіді</div>'}
          <div><span class="muted">Вираз:</span> ${tokensHtml(r.expression)}</div>
          <div class="muted small">${verdict}. Регістр, розділові знаки й артиклі не враховуються.</div>
        </div>
      </div>
      <div class="rate rate3">${EXPR_GRADES.map(([g, label, cls], i) =>
        `<button class="btn ${cls}${g === r.suggestion ? ' suggested' : ''}" data-g="${g}">${label} <kbd>${i + 1}</kbd></button>`).join('')}</div>`;
    bindSay($('#after'));
    $$('[data-g]', el).forEach(b => { b.onclick = () => onGrade(b.dataset.g); });
    $(`[data-g="${r.suggestion}"]`, el).focus();
    document.onkeydown = ev => {
      if (['1', '2', '3'].includes(ev.key)) onGrade(EXPR_GRADES[+ev.key - 1][0]);
    };
  };
}

// ---------- імпорт ----------

Views['expr-import'] = async () => {
  const all = await DB.all('expressions');
  app().innerHTML = `
    <div class="page-head"><div><a href="#/expr" class="crumb">Вирази</a><h1>Імпорт виразів</h1></div></div>
    <div class="panel stack">
      <p class="muted">Один вираз на рядок: <code>expression | meaning_uk | cue_uk | example_en | quote</code>. Поле quote не обов'язкове і зберігається як цитата з уроку. Рядок заголовків і таблиця markdown теж підходять.</p>
      <textarea id="imp" rows="9" placeholder="push back on something | заперечувати, не погоджуватися | Клієнт вимагає нереальний термін, і ти не погоджуєшся. | I had to push back on the deadline. | we need to push back"></textarea>
      <label>Джерело: дата уроку або test<input id="src" value="${ExprCore.dayKey()}"></label>
      <div class="btns"><button class="btn primary" data-act="preview">Перевірити</button></div>
    </div>
    <div class="panel" id="prev" hidden></div>`;

  let rows = [];
  actions.preview = () => {
    rows = ExprCore.parseImport($('#imp').value, all.map(c => c.expression));
    const ok = rows.filter(r => !r.errors.length && !r.duplicate);
    const dup = rows.filter(r => r.duplicate).length;
    const bad = rows.filter(r => r.errors.length).length;
    $('#prev').hidden = false;
    $('#prev').innerHTML = `
      <h3>Попередній перегляд</h3>
      <p>Буде додано: <b>${ok.length}</b>${dup ? ` · пропущено дублів: ${dup}` : ''}${bad ? ` · рядків з помилками: <b class="warn">${bad}</b> (їх не буде збережено)` : ''}</p>
      <div class="table-wrap"><table class="cards">
        <thead><tr><th>#</th><th>Вираз</th><th>Значення і ситуація</th><th>Приклад</th><th>Стан</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.errors.length ? 'row-bad' : r.duplicate ? 'dup' : ''}">
          <td class="muted">${r.line}</td>
          <td><b>${esc(r.data.expression)}</b></td>
          <td>${esc(r.data.meaning_uk)}<div class="ex">${esc(r.data.cue_uk)}</div></td>
          <td>${esc(r.data.example_en)}${r.data.note ? `<div class="ex">«${esc(r.data.note)}»</div>` : ''}</td>
          <td>${r.errors.length ? `<span class="warn">${r.errors.map(esc).join('<br>')}</span>` : r.duplicate ? '<span class="muted">дубль, пропущено</span>' : 'гаразд'}
            ${r.warnings.length ? `<div class="warn small">${r.warnings.map(esc).join('<br>')}</div>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted">Немає рядків</td></tr>'}</tbody>
      </table></div>
      <div class="btns"><button class="btn primary" data-act="save" ${ok.length ? '' : 'disabled'}>Зберегти ${ok.length}</button></div>`;
  };
  actions.save = async () => {
    const source = $('#src').value.trim();
    if (!source) { toast('Вкажіть джерело: дату уроку або test'); $('#src').focus(); return; }
    const now = Date.now();
    const fresh = rows.filter(r => !r.errors.length && !r.duplicate).map((r, i) => ExprCore.makeExpression(r.data, source, now + i));
    await DB.putMany('expressions', fresh);
    await promoteQueue();
    const ids = new Set(fresh.map(c => c.id));
    const nowActive = (await DB.all('expressions')).filter(c => ids.has(c.id) && c.status === 'active').length;
    toast(`Додано ${fresh.length}: активних ${nowActive}, у черзі ${fresh.length - nowActive}`);
    location.hash = '#/expr';
  };
};

// ---------- прогрес ----------

Views['expr-progress'] = async () => {
  const [all, logs] = await Promise.all([DB.all('expressions'), DB.all('log')]);
  const today = ExprCore.dayKey();
  const p = ExprCore.weeklyProgress(all, logs, today, 8);
  const max = Math.max(1, ...p.weeks.map(w => w.unprompted));
  const share = p.earlier.total ? Math.round(p.earlier.used / p.earlier.total * 100) : null;
  app().innerHTML = `
    <div class="page-head"><div><a href="#/expr" class="crumb">Вирази</a><h1>Прогрес</h1></div></div>
    <div class="stats">
      <div class="stat"><b>${p.weeks[p.weeks.length - 1].unprompted}</b><span>виразів без підказки цього тижня</span></div>
      <div class="stat"><b>${share === null ? '—' : share + '%'}</b><span>виразів з попередніх тижнів вжито без підказки${p.earlier.total ? ` (${p.earlier.used} з ${p.earlier.total})` : ''}</span></div>
      <div class="stat"><b>${all.filter(c => c.status === 'mastered').length}</b><span>засвоєно</span></div>
    </div>
    <div class="panel">
      <h3>Вирази, вжиті без підказки, по тижнях</h3>
      <div class="week-bars">${p.weeks.map(w => `<div class="week">
        <span class="week-label">${fmtDay(w.start)}–${fmtDay(w.end)}</span>
        <span class="week-bar"><span style="width:${w.unprompted / max * 100}%"></span></span>
        <span class="week-num">${w.unprompted}${w.hint ? ` <span class="muted small">(+${w.hint} з підказкою)</span>` : ''}</span>
      </div>`).join('')}</div>
    </div>
    <div class="panel">
      <h3>Ще не вжиті в мовленні (${p.never.length})</h3>
      ${p.never.length ? `<ul class="plain-list">${p.never.map(c => `<li><b>${esc(c.expression)}</b> <span class="muted">${esc(c.meaning_uk)}</span></li>`).join('')}</ul>` : '<p class="muted">Усі вирази вже звучали в розмові.</p>'}
    </div>`;
};
