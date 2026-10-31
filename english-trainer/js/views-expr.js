const EXPR_GRADES = [
  ['forgot', 'Забула · Forgot', 'r1'],
  ['partly', 'Частково · Partly', 'r2'],
  ['got', 'Згадала · Got it', 'r3'],
];
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const MIC_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';

const DOMAINS = { work: 'робота', life: 'життя' };
const domainBadge = d => `<span class="badge dom-${d === 'life' ? 'life' : 'work'}">${DOMAINS[d] || DOMAINS.work}</span>`;

// Вирази завжди читаються через upgrade, тож записи зі старих версій і старих копій мають нові поля.
const loadExpressions = async () => (await DB.all('expressions')).map(ExprCore.upgrade);

async function upgradeStoredExpressions() {
  const all = await DB.all('expressions');
  const changed = all.map(ExprCore.upgrade).filter((c, i) => c !== all[i]);
  if (changed.length) await DB.putMany('expressions', changed);
  return changed.length;
}

async function exprLimits() {
  const s = await getSettings();
  return {
    reviewsPerDay: s.exprReviewsPerDay, newPerDay: s.exprNewPerDay, activeMax: s.exprActiveMax,
    lifeShare: Math.min(100, Math.max(0, s.exprLifeShare)) / 100,
  };
}

async function promoteQueue() {
  const [all, lim] = await Promise.all([loadExpressions(), exprLimits()]);
  const promoted = ExprCore.promote(all, lim.activeMax, ExprCore.dayKey(), lim.lifeShare);
  if (promoted.length) await DB.putMany('expressions', promoted);
  return promoted.length;
}

async function exprPlan() {
  await promoteQueue();
  const [all, lim, logs] = await Promise.all([loadExpressions(), exprLimits(), DB.since('log', 'ts', startOfDay())]);
  const today = ExprCore.dayKey();
  return { all, lim, today, ...ExprCore.planDay(all, today, ExprCore.countDone(logs, today), lim) };
}

async function copyDialog(domain) {
  const [all, logs] = await Promise.all([loadExpressions(), DB.since('log', 'ts', startOfDay())]);
  const list = ExprCore.rolePlayPick(logs, Object.fromEntries(all.map(c => [c.id, c])), ExprCore.dayKey(), 5, domain);
  if (!list.length) { toast(`Немає активних виразів у сфері «${DOMAINS[domain]}»`); return; }
  await copyText(list.join(', '));
  toast(`Скопійовано (${DOMAINS[domain]}): ${list.join(', ')}`);
}

// Сцена буде або робочою, або побутовою, тому спершу вибір сфери.
function chooseDialog() {
  const m = modal(`<h3>Скопіювати для діалогу</h3>
    <p class="muted">Яка буде сцена? Скопіюється до 5 виразів цієї сфери: спершу ті, що сьогодні були «Забула» і «Частково».</p>
    <div class="btns">
      <button class="btn primary" data-dom="work">Робота</button>
      <button class="btn primary" data-dom="life">Життя</button>
      <button class="btn ghost" data-m="close">Скасувати</button>
    </div>`);
  $$('[data-dom]', m.el).forEach(b => { b.onclick = async () => { m.close(); await copyDialog(b.dataset.dom); }; });
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
      ${domainBadge(c.domain)} <b>${esc(c.expression)}</b> <span class="muted">${esc(c.meaning_uk)}</span>
      ${c.image_note ? '' : '<span class="muted small" title="Образу ще немає">· без образу</span>'}
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
      <div><h1>Вирази</h1><p class="muted">Активних ${active.length} з ${lim.activeMax} (робота ${active.filter(c => c.domain !== 'life').length}, життя ${active.filter(c => c.domain === 'life').length})${queued.length ? ` · у черзі ${queued.length}` : ''} · засвоєно ${mastered.length}</p></div>
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

const MAX_CUES = 3;

function exprModal(c) {
  const m = modal(`<h3>Вираз</h3>
    <form id="xef" class="stack">
      <label>Вираз (expression)<input name="expression" value="${esc(c.expression)}" required></label>
      <label>Значення (meaning_uk)<input name="meaning_uk" value="${esc(c.meaning_uk)}" required></label>
      <label>Сфера<select name="domain">
        <option value="work" ${c.domain !== 'life' ? 'selected' : ''}>робота</option>
        <option value="life" ${c.domain === 'life' ? 'selected' : ''}>життя</option>
      </select></label>
      <div class="cues-edit">
        <span class="field-label">Ситуації українською (до ${MAX_CUES}), щоразу показується інша</span>
        <div id="cueRows"></div>
        <button type="button" class="btn small" id="cueAdd">+ Додати ситуацію</button>
      </div>
      <label>Образ або асоціація<textarea name="image_note" rows="2" placeholder="Напр.: push back on — відштовхнути документ назад через стіл">${esc(c.image_note)}</textarea></label>
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
  const cueValues = () => $$('[name=cue]', m.el).map(i => i.value);
  const drawCues = values => {
    $('#cueRows', m.el).innerHTML = values.map((v, i) => `<div class="cue-row">
        <textarea name="cue" rows="2" placeholder="Ситуація ${i + 1}">${esc(v)}</textarea>
        <button type="button" class="btn small ghost danger" data-del-cue="${i}" aria-label="Видалити ситуацію ${i + 1}">Видалити</button>
      </div>`).join('') || '<p class="muted small">Ситуацій немає: на картці буде лише значення.</p>';
    $('#cueAdd', m.el).hidden = values.length >= MAX_CUES;
    $$('[data-del-cue]', m.el).forEach(b => {
      b.onclick = () => { const v = cueValues(); v.splice(+b.dataset.delCue, 1); drawCues(v); };
    });
  };
  drawCues(c.cues_uk.length ? c.cues_uk : ['']);
  $('#cueAdd', m.el).onclick = () => { drawCues([...cueValues(), '']); $$('[name=cue]', m.el).pop().focus(); };

  $('#xef', m.el).onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const cues = cueValues().map(s => s.trim()).filter(Boolean).slice(0, MAX_CUES);
    const upd = ExprCore.checkMastered({
      ...c,
      expression: f.expression.trim(), meaning_uk: f.meaning_uk.trim(),
      domain: f.domain === 'life' ? 'life' : 'work',
      cues_uk: cues, cue_uk: cues[0] || '',
      last_cue_index: c.last_cue_index != null && c.last_cue_index < cues.length ? c.last_cue_index : null,
      image_note: f.image_note.trim(),
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
  runExprSession(plan);
};

const STAGE_LABEL = {
  intro: 'Крок 1 з 3 · знайомство',
  choice: 'Крок 2 з 3 · у ситуаціях',
  write: 'Крок 3 з 3 · пишемо з підказкою',
  review: 'Повторення',
};

// Нові вирази проходять три кроки (знайомство → вибір у ситуаціях → написання з підказкою),
// оцінка й розклад починаються з третього кроку. Знайомі вирази одразу йдуть на повторення.
function runExprSession(plan) {
  const byId = Object.fromEntries([...plan.fresh, ...plan.reviews].map(c => [c.id, c]));
  const pool = plan.all;
  const queue = ExprCore.sessionSteps(plan.fresh, plan.reviews, {
    canChoose: c => ExprCore.choiceOptions(c, pool).length >= 2,
  }).map(s => ({ ...s, practice: false }));
  const total = queue.length;
  const results = new Map();
  const askedImage = new Set();
  let done = 0;

  const step = () => {
    document.onkeydown = null;
    app().onchange = null;
    if (!queue.length) return finish();
    const t = queue.shift();
    const c = byId[t.id];
    app().innerHTML = `<div class="session">
      <div class="session-head">
        <button class="btn ghost small" data-act="quit">Завершити</button>
        <div class="bar"><div style="width:${Math.round(done / total * 100)}%"></div></div>
        <span class="muted">${done} / ${total}</span>
      </div>
      <div class="stage-label">${STAGE_LABEL[t.kind]}</div>
      <div id="ex"></div></div>`;
    actions.quit = finish;

    if (t.kind === 'intro') {
      introCard(c, $('#ex'), () => { done++; step(); });
      return;
    }
    if (t.kind === 'choice') {
      choiceCard(c, t.cueIndex, pool, $('#ex'), correct => {
        if (correct) done++;
        else {
          // Помилкова ситуація повертається ще раз, до кроку написання.
          const at = queue.findIndex(s => s.kind === 'write' || s.kind === 'review');
          queue.splice(at < 0 ? queue.length : at, 0, t);
        }
        step();
      });
      return;
    }

    let graded = false;
    exprCard({ c, practice: t.practice, hint: t.kind === 'write' }, $('#ex'), async (grade, cueIndex) => {
      if (graded) return;
      graded = true;
      let cur = c;
      if (!t.practice) {
        const wasNew = ExprCore.isNew(c);
        cur = ExprCore.schedule(c, grade, ExprCore.dayKey(), cueIndex);
        await DB.put('expressions', cur);
        await DB.put('log', { ts: Date.now(), type: 'expr', itemId: cur.id, grade, first: wasNew });
        results.set(cur.id, { c: cur, grade });
      } else {
        cur = { ...c, last_cue_index: cueIndex };
      }
      byId[cur.id] = cur;
      const next = () => {
        // «Забула» ще раз у кінці сесії лише для практики; на розклад це не впливає.
        if (grade === 'forgot' && !t.practice) queue.push({ ...t, practice: true });
        else done++;
        step();
      };
      if (grade !== 'got' && !cur.image_note && !askedImage.has(cur.id)) {
        askedImage.add(cur.id);
        imagePrompt(cur, $('#ex'), saved => {
          byId[saved.id] = saved;
          if (results.has(saved.id)) results.get(saved.id).c = saved;
        }, next);
      } else next();
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
        <button class="btn primary" data-act="dialog">Скопіювати для діалогу</button>
        <a class="btn" href="#/expr">Усі вирази</a>
        <a class="btn" href="#/">На головну</a>
      </div></div>`;
    actions.dialog = chooseDialog;
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

// Після «Забула» чи «Частково», якщо образу немає. Заповнювати не обов'язково.
function imagePrompt(c, el, onSaved, done) {
  document.onkeydown = null;
  const box = document.createElement('div');
  box.className = 'panel stack image-prompt';
  box.innerHTML = `<label for="imgIn" class="field-label">Придумай свій образ <span class="muted small">(не обов'язково)</span></label>
    <textarea id="imgIn" rows="2" placeholder="Напр.: push back on — відштовхнути документ назад через стіл"></textarea>
    <div class="btns">
      <button type="button" class="btn primary" id="imgSave">Зберегти</button>
      <button type="button" class="btn" id="imgSkip">Далі без образу</button>
    </div>`;
  $('.rate', el).replaceWith(box);
  $('#imgIn').focus();
  $('#imgSkip').onclick = done;
  $('#imgSave').onclick = async () => {
    const text = $('#imgIn').value.trim();
    if (!text) { $('#imgIn').focus(); return; }
    const saved = { ...ExprCore.upgrade(await DB.get('expressions', c.id)), image_note: text };
    await DB.put('expressions', saved);
    onSaved(saved);
    toast('Образ збережено');
    done();
  };
}

function introCard(c, el, next) {
  const cues = c.cues_uk.filter(Boolean);
  el.innerHTML = `<div class="ex-card intro">
      <div class="ex-label">${domainBadge(c.domain)} Новий вираз</div>
      <div class="ex-word">${esc(c.expression)} ${sayBtn(c.expression)}</div>
      <div class="ex-meaning big">${esc(c.meaning_uk)}</div>
      ${c.image_note ? `<div class="ex-image"><span class="muted small">Образ</span>${esc(c.image_note)}</div>` : ''}
      ${c.example_en ? `<div class="ex-example">${esc(c.example_en)}</div>` : ''}
      ${cues.length ? `<div class="intro-cues"><div class="muted small">Коли це кажуть</div><ul>${cues.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      ${c.note ? `<div class="ex-note">З уроку: «${esc(c.note)}»</div>` : ''}
    </div>
    <p class="instruction">Прочитайте вираз уголос кілька разів і уявіть образ. Нічого вводити не треба.</p>
    <div class="ex-actions"><button class="btn primary big" id="next">Зрозуміло, далі <kbd>Enter</kbd></button></div>`;
  bindSay(el);
  $('#next').onclick = next;
  $('#next').focus();
  document.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
}

function choiceCard(c, cueIndex, pool, el, onDone) {
  const opts = ExprCore.choiceOptions(c, pool);
  el.innerHTML = `<div class="ex-card">
      <div class="ex-label">${domainBadge(c.domain)} Який вираз підходить до ситуації?</div>
      <div class="ex-sentence">${esc(c.cues_uk[cueIndex])}</div>
    </div>
    <div class="options">${opts.map((o, i) => `<button class="btn option" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`).join('')}</div>
    <div id="after"></div>`;
  let correct = null;
  const pick = i => {
    if (correct !== null) return;
    correct = opts[i] === c.expression;
    $$('.option', el).forEach((b, j) => {
      b.disabled = true;
      if (opts[j] === c.expression) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
    });
    $('#after').innerHTML = `${feedback(correct ? 'ok' : 'bad', `<b>${esc(c.expression)}</b> ${sayBtn(c.expression)} — ${esc(c.meaning_uk)}`)}
      ${c.image_note ? `<div class="ex-image"><span class="muted small">Образ</span>${esc(c.image_note)}</div>` : ''}
      <div class="ex-actions"><button class="btn primary" id="next">Далі <kbd>Enter</kbd></button></div>`;
    bindSay($('#after'));
    $('#next').onclick = () => onDone(correct);
    $('#next').focus();
  };
  $$('.option', el).forEach((b, i) => { b.onclick = () => pick(i); });
  document.onkeydown = e => {
    if (correct === null && e.key >= '1' && e.key <= String(opts.length)) pick(+e.key - 1);
    else if (correct !== null && e.key === 'Enter') { e.preventDefault(); onDone(correct); }
  };
}

function exprCard(t, el, onGrade) {
  const c = t.c;
  const cue = ExprCore.pickCue(c);
  const label = t.practice ? 'Ще раз' : t.hint ? 'Напишіть вираз за підказкою' : 'Згадайте вираз англійською';
  el.innerHTML = `<div class="ex-card">
      <div class="ex-label">${domainBadge(c.domain)} ${label}</div>
      ${cue.text ? `<div class="ex-sentence">${esc(cue.text)}</div>` : ''}
      <div class="ex-meaning">${esc(c.meaning_uk)}</div>
      ${t.hint ? `<div class="hint-pattern" title="Перші літери слів">${esc(ExprCore.hintPattern(c.expression))}</div>` : ''}
    </div>
    <p class="instruction">Спершу скажіть вираз уголос, потім надрукуйте його.</p>
    <form id="ef" class="type-form expr-form">
      <input id="ei" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Вираз англійською">
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
        ${c.image_note ? `<div class="ex-image"><span class="muted small">Образ</span>${esc(c.image_note)}</div>` : ''}
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
    $$('[data-g]', el).forEach(b => { b.onclick = () => onGrade(b.dataset.g, cue.index); });
    $(`[data-g="${r.suggestion}"]`, el).focus();
    document.onkeydown = ev => {
      if (['1', '2', '3'].includes(ev.key)) onGrade(EXPR_GRADES[+ev.key - 1][0], cue.index);
    };
  };
}

// ---------- імпорт ----------

Views['expr-import'] = async () => {
  const all = await loadExpressions();
  app().innerHTML = `
    <div class="page-head"><div><a href="#/expr" class="crumb">Вирази</a><h1>Імпорт виразів</h1></div></div>
    <div class="panel stack">
      <p class="muted">Один вираз на рядок:<br>
        <code>вираз | значення | сфера (робота/життя) | ситуація 1 | ситуація 2 | ситуація 3 | образ | приклад англійською | цитата з уроку</code><br>
        Ситуації 2 і 3, образ і цитата не обов'язкові, але їхні місця між знаками | треба лишити. Старий формат <code>вираз | значення | ситуація | приклад | цитата</code> теж підходить, сфера тоді «робота».</p>
      <textarea id="imp" rows="9" placeholder="push back on something | заперечити, не погодитися | робота | Розробники вважають дедлайн нереальним | Керівник додає функцію в повний спринт | | відштовхнути документ назад через стіл | The team pushed back on the deadline."></textarea>
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
        <thead><tr><th>#</th><th>Вираз</th><th>Значення і ситуації</th><th>Образ</th><th>Приклад</th><th>Стан</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.errors.length ? 'row-bad' : r.duplicate ? 'dup' : ''}">
          <td class="muted">${r.line}</td>
          <td>${domainBadge(r.data.domain)}<div><b>${esc(r.data.expression)}</b></div></td>
          <td>${esc(r.data.meaning_uk)}${r.data.cues_uk.map((cue, i) => `<div class="ex">${i + 1}. ${esc(cue)}</div>`).join('')}</td>
          <td class="small">${esc(r.data.image_note) || '<span class="muted">—</span>'}</td>
          <td>${esc(r.data.example_en)}${r.data.note ? `<div class="ex">«${esc(r.data.note)}»</div>` : ''}</td>
          <td>${r.errors.length ? `<span class="warn">${r.errors.map(esc).join('<br>')}</span>` : r.duplicate ? '<span class="muted">дубль, пропущено</span>' : 'гаразд'}
            ${r.format === 'old' && !r.errors.length ? '<div class="muted small">старий формат</div>' : ''}
            ${r.warnings.length ? `<div class="warn small">${r.warnings.map(esc).join('<br>')}</div>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">Немає рядків</td></tr>'}</tbody>
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
    const nowActive = (await loadExpressions()).filter(c => ids.has(c.id) && c.status === 'active').length;
    toast(`Додано ${fresh.length}: активних ${nowActive}, у черзі ${fresh.length - nowActive}`);
    location.hash = '#/expr';
  };
};

// ---------- прогрес ----------

Views['expr-progress'] = async () => {
  const [all, logs] = await Promise.all([loadExpressions(), DB.all('log')]);
  const today = ExprCore.dayKey();
  const total = ExprCore.weeklyProgress(all, logs, today, 8);
  const domainPanel = d => {
    const p = ExprCore.weeklyProgress(all, logs, today, 8, d);
    const cards = all.filter(c => (c.domain === 'life') === (d === 'life'));
    const max = Math.max(1, ...p.weeks.map(w => w.unprompted));
    const share = p.earlier.total ? Math.round(p.earlier.used / p.earlier.total * 100) : null;
    return `<section class="panel" data-domain="${d}">
      <h2>${domainBadge(d)} ${d === 'life' ? 'Життя' : 'Робота'}</h2>
      <div class="stats compact">
        <div class="stat"><b>${p.weeks[p.weeks.length - 1].unprompted}</b><span>без підказки цього тижня</span></div>
        <div class="stat"><b>${share === null ? '—' : share + '%'}</b><span>з попередніх тижнів вжито${p.earlier.total ? ` (${p.earlier.used} з ${p.earlier.total})` : ''}</span></div>
        <div class="stat"><b>${cards.filter(c => c.status === 'active').length} / ${cards.filter(c => c.status === 'mastered').length}</b><span>активних / засвоєно</span></div>
      </div>
      <h3>Вжиті без підказки, по тижнях</h3>
      <div class="week-bars">${p.weeks.map(w => `<div class="week">
        <span class="week-label">${fmtDay(w.start)}–${fmtDay(w.end)}</span>
        <span class="week-bar"><span style="width:${w.unprompted / max * 100}%"></span></span>
        <span class="week-num">${w.unprompted}${w.hint ? ` <span class="muted small">(+${w.hint} з підказкою)</span>` : ''}</span>
      </div>`).join('')}</div>
      <h3>Ще не вжиті в мовленні (${p.never.length})</h3>
      ${p.never.length ? `<ul class="plain-list">${p.never.map(c => `<li><b>${esc(c.expression)}</b> <span class="muted">${esc(c.meaning_uk)}</span></li>`).join('')}</ul>` : '<p class="muted">Усі вирази цієї сфери вже звучали в розмові.</p>'}
    </section>`;
  };
  app().innerHTML = `
    <div class="page-head"><div><a href="#/expr" class="crumb">Вирази</a><h1>Прогрес</h1></div></div>
    <p class="muted">Разом цього тижня вжито без підказки: ${total.weeks[total.weeks.length - 1].unprompted}; засвоєно: ${all.filter(c => c.status === 'mastered').length}.</p>
    <div class="domain-grid">${domainPanel('work')}${domainPanel('life')}</div>`;
};
