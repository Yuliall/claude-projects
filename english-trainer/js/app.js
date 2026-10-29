const STORES = ['decks', 'cards', 'topics', 'exercises', 'log'];

Views.settings = async () => {
  const [s, lastExport, counts] = await Promise.all([
    getSettings(), metaGet('lastExport'),
    Promise.all(STORES.map(n => DB.all(n).then(a => a.length))),
  ]);
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  app().innerHTML = `
    <div class="page-head"><h1>Налаштування</h1></div>
    <form class="panel stack" id="sf">
      <h3>Навчання</h3>
      <label>Нових слів на день<input type="number" name="newPerDay" min="0" max="500" value="${s.newPerDay}"></label>
      <label>Нових граматичних вправ на день<input type="number" name="newGrammarPerDay" min="0" max="200" value="${s.newGrammarPerDay}"></label>
      <label>Максимум повторень за раз<input type="number" name="reviewLimit" min="10" max="2000" value="${s.reviewLimit}"></label>
      <label>Скільки слів хочу пам'ятати на момент повторення
        <select name="retention">${[0.8, 0.85, 0.9, 0.95].map(r => `<option value="${r}" ${r === s.retention ? 'selected' : ''}>${Math.round(r * 100)}%${r === 0.9 ? ' (рекомендовано)' : ''}</option>`).join('')}</select>
      </label>
      <p class="muted">Вищий відсоток означає частіші повторення.</p>
      <div class="btns"><button class="btn primary">Зберегти</button></div>
    </form>
    <div class="panel stack">
      <h3>Резервна копія</h3>
      <p>У базі: словників ${counts[0]}, слів ${counts[1]}, граматичних тем ${counts[2]}, вправ ${counts[3]}.</p>
      <p class="muted">Дані зберігаються в цьому браузері. ${persisted ? 'Браузер позначив їх як постійні.' : 'Браузер може видалити їх, якщо закінчиться місце на диску.'} Остання копія: ${lastExport ? new Date(lastExport).toLocaleString('uk-UA') : 'ще не робили'}.</p>
      <div class="btns">
        <button class="btn primary" data-act="export">Зберегти копію у файл</button>
        <label class="btn">Відновити з файлу<input type="file" id="importFile" accept=".json,application/json" hidden></label>
      </div>
      <p class="muted">Файл копії також переносить усе на інший комп'ютер або в інший браузер.</p>
    </div>
    <div class="panel stack">
      <h3>Видалення</h3>
      <div class="btns"><button class="btn danger" data-act="wipe">Видалити всі дані</button></div>
    </div>`;

  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await saveSettings({ ...s, newPerDay: +f.newPerDay, newGrammarPerDay: +f.newGrammarPerDay, reviewLimit: +f.reviewLimit, retention: +f.retention });
    toast('Збережено');
  };
  actions.export = async () => {
    const data = { app: 'english-trainer', version: 1, exportedAt: new Date().toISOString(), settings: s };
    for (const n of STORES) data[n] = await DB.all(n);
    download(`english-trainer-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
    await metaSet('lastExport', Date.now());
    toast('Копію збережено');
  };
  $('#importFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('Файл пошкоджений або не JSON'); return; }
    if (data.app !== 'english-trainer') { toast('Це не файл копії English Trainer'); return; }
    const replace = confirm('Замінити всі поточні дані даними з файлу?\n\nOK: замінити.\nСкасувати: об\'єднати (дані з файлу додадуться до наявних).');
    for (const n of STORES) {
      if (replace) await DB.clear(n);
      if (Array.isArray(data[n])) await DB.putMany(n, n === 'log' && !replace ? data[n].map(({ id, ...rest }) => rest) : data[n]);
    }
    if (data.settings) await saveSettings({ ...s, ...data.settings });
    toast('Дані відновлено');
    render();
  };
  actions.wipe = async () => {
    if (!confirm('Видалити всі словники, слова, граматику та історію? Це не можна скасувати.')) return;
    if (prompt('Щоб підтвердити, напишіть: видалити') !== 'видалити') return;
    for (const n of [...STORES, 'meta']) await DB.clear(n);
    toast('Усе видалено');
    location.hash = '#/';
  };
};

async function render() {
  document.onkeydown = null;
  app().onchange = null;
  actions = {};
  $$('.modal-wrap').forEach(m => m.remove());
  const [path = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const arg = decodeURIComponent(rest.join('/'));
  const navKey = { deck: 'decks', topic: 'grammar' }[path] ?? path;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));
  try {
    await (Views[path] || Views[''])(arg);
  } catch (err) {
    console.error(err);
    app().innerHTML = `<div class="panel">Сталася помилка: ${esc(err.message)}</div>`;
  }
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const link = e.target.closest('a[href^="#"]');
  if (link && link.getAttribute('href') === (location.hash || '#/')) { e.preventDefault(); render(); return; }
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); }
});
window.addEventListener('hashchange', render);

async function upgradeLearningStates() {
  if (await metaGet('learningStates')) return;
  const now = Date.now();
  const cards = await DB.all('cards');
  cards.forEach(c => { if (c.srs) c.srs = { rec: SRS.upgrade(c.srs.rec, now), prod: SRS.upgrade(c.srs.prod, now) }; });
  await DB.putMany('cards', cards);
  const exs = await DB.all('exercises');
  exs.forEach(x => { x.srs = SRS.upgrade(x.srs, now); });
  await DB.putMany('exercises', exs);
  await metaSet('learningStates', 1);
}

DB.open().then(upgradeLearningStates).then(() => {
  navigator.storage?.persist?.().catch(() => {});
  render();
}).catch(err => {
  app().innerHTML = `<div class="panel">Браузер не дає доступу до сховища (IndexedDB): ${esc(err?.message || err)}. Спробуйте відкрити сторінку не в приватному вікні.</div>`;
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
