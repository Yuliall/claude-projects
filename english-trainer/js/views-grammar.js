const STARTER_TOPICS = [
  {
    name: 'Present Perfect vs Past Simple',
    folder: 'Часи',
    content: `## Past Simple
Дія завершилася в минулому, і відомо, коли саме (названо час або зрозуміло з контексту).
- Утворення: V2 (worked, saw). Заперечення і питання через did: I didn't see. Did you see?
- Маркери: yesterday, last week, last year, ... ago, in 2020, when I was a child.
- I **saw** this film yesterday.

## Present Perfect
Дія відбулася в минулому, але важливий її результат або досвід зараз. Час не названо, або період ще не закінчився.
- Утворення: have / has + V3 (have worked, has seen).
- Маркери: ever, never, already, yet, just, so far, recently, this week (поки тиждень триває).
- Зі станами і for / since: дія почалась у минулому і триває досі.
- I **have** already **seen** this film. (Я знаю, про що він.)
- She **has lived** here since 2019. (Досі тут живе.)

## Як вибрати
- Є конкретний момент у минулому (yesterday, ago, in May): Past Simple.
- Часу немає, важливий досвід чи результат: Present Perfect.
- Питання When...? завжди з Past Simple: When **did** you **arrive**?
- Розповідь про події в минулому одна за одною: Past Simple.`,
    exercises: [
      { kind: 'gap', prompt: "I ___ (lose) my keys. I can't open the door.", answers: ['have lost'], options: ['lost', 'have lost'], explanation: 'Важливий результат зараз (не можу відчинити), час не названо.' },
      { kind: 'gap', prompt: 'I ___ (lose) my keys yesterday, but I found them in the evening.', answers: ['lost'], options: ['lost', 'have lost'], explanation: 'Названо час у минулому (yesterday), ситуація завершилась.' },
      { kind: 'gap', prompt: 'Have you ever ___ to London?', answers: ['been'], options: ['been', 'went', 'was'], explanation: 'ever: питання про досвід, Present Perfect, have + V3 (been).' },
      { kind: 'gap', prompt: 'She ___ (move) to Kyiv in 2015.', answers: ['moved'], options: ['moved', 'has moved'], explanation: 'in 2015: конкретний час у минулому.' },
      { kind: 'gap', prompt: 'We ___ (know) each other for ten years.', answers: ['have known'], options: ['knew', 'have known'], explanation: 'for ten years і досі знайомі: Present Perfect.' },
      { kind: 'gap', prompt: 'When ___ (you / finish) the project?', answers: ['did you finish'], options: ['did you finish', 'have you finished'], explanation: 'Питання When...? стосується конкретного часу, тому Past Simple.' },
      { kind: 'gap', prompt: "I haven't finished the report ___.", answers: ['yet'], options: ['yet', 'ago', 'yesterday'], explanation: 'yet вживається в запереченнях і питаннях Present Perfect.' },
      { kind: 'gap', prompt: 'He ___ (just / call) me.', answers: ['has just called'], options: ['has just called', 'just called yesterday'], explanation: 'just: дія щойно відбулась, Present Perfect.' },
      { kind: 'translate', prompt: 'Я щойно прочитала твій лист.', answers: ['I have just read your letter.', 'I have just read your email.', 'I have just read your message.'], explanation: 'just: Present Perfect, have + V3.' },
      { kind: 'translate', prompt: 'Ми бачили його минулого тижня.', answers: ['We saw him last week.'], explanation: 'last week: Past Simple.' },
    ],
  },
  {
    name: 'Майбутній час: will, be going to, Future Continuous',
    folder: 'Часи',
    content: `## Future Simple (will)
- Утворення: will + V1. Заперечення: will not (won't). Питання: Will you help me?
- Рішення в момент мовлення: The phone is ringing. I**'ll** answer it.
- Прогноз, думка: I think it **will** rain. Маркери: I think, probably, I'm sure, maybe.
- Обіцянка, пропозиція, прохання: I**'ll** help you. **Will** you open the window?
- Факт у майбутньому: The meeting **will** end at 5.

## be going to
- Утворення: am / is / are going to + V1.
- План, рішення ухвалене раніше: I**'m going to** visit my parents this weekend.
- Прогноз за тим, що видно зараз: Look at those clouds! It**'s going to** rain.

## Present Continuous для майбутнього
- Домовленість на конкретний час (квитки, зустріч у календарі): I**'m meeting** Anna at 6.

## Future Continuous (will be + V-ing)
- Дія буде в процесі в певний момент у майбутньому: This time tomorrow I**'ll be flying** to Rome.
- Утворення: will be + V-ing. Заперечення: won't be working. Питання: Will you be working?
- Маркери: at 5 pm tomorrow, this time next week, all day tomorrow.
- Ввічливе питання про плани: **Will** you **be using** the car tonight?

## Як вибрати
- Вирішила щойно: will. Вирішила заздалегідь: be going to.
- Домовленість з іншими людьми на конкретний час: Present Continuous.
- Дія триватиме в певний момент: Future Continuous. Факт без процесу: Future Simple.`,
    exercises: [
      { kind: 'gap', prompt: "A: We've run out of milk. B: Oh, I ___ buy some.", answers: ['will'], options: ['will', 'am going to'], explanation: 'Рішення ухвалене в момент мовлення: will.' },
      { kind: 'gap', prompt: 'I ___ visit my grandmother on Sunday. I bought a cake for her yesterday.', answers: ['am going to'], options: ['will', 'am going to'], explanation: 'План, вирішений заздалегідь: be going to.' },
      { kind: 'gap', prompt: 'Look at the sky! It ___ rain.', answers: ['is going to'], options: ['is going to', 'will'], explanation: 'Прогноз за тим, що видно зараз: be going to.' },
      { kind: 'gap', prompt: 'This time tomorrow I ___ (lie) on the beach.', answers: ['will be lying'], options: ['will be lying', 'will lie'], explanation: 'Дія буде в процесі в певний момент (this time tomorrow): Future Continuous.' },
      { kind: 'gap', prompt: "Don't call me at 8, I ___ (have) dinner then.", answers: ['will be having'], options: ['will be having', 'will have'], explanation: 'О восьмій вечеря триватиме: Future Continuous.' },
      { kind: 'gap', prompt: 'I think she ___ (pass) the exam.', answers: ['will pass'], options: ['will pass', 'is passing'], explanation: 'Прогноз-думка з I think: will.' },
      { kind: 'gap', prompt: "I ___ (see) the dentist at 10 tomorrow. It's in my calendar.", answers: ['am seeing'], options: ['am seeing', 'will see'], explanation: 'Домовленість на конкретний час: Present Continuous.' },
      { kind: 'gap', prompt: 'I promise I ___ (not / tell) anyone.', answers: ['will not tell'], options: ["won't tell", "am not telling"], explanation: 'Обіцянка: will.' },
      { kind: 'translate', prompt: 'Я допоможу тобі з домашнім завданням.', answers: ['I will help you with your homework.', 'I will help you with the homework.'], explanation: 'Пропозиція допомоги: will.' },
      { kind: 'translate', prompt: 'Завтра о сьомій я працюватиму.', answers: ['I will be working at seven tomorrow.', 'Tomorrow at seven I will be working.', 'I will be working tomorrow at seven.', 'I will be working at 7 tomorrow.'], explanation: 'Дія в процесі в конкретний момент: Future Continuous.' },
    ],
  },
];

async function addStarterTopics() {
  const topics = await DB.all('topics');
  const names = new Set(topics.map(t => norm(t.name)));
  let added = 0;
  for (const s of STARTER_TOPICS) {
    if (names.has(norm(s.name))) continue;
    const t = newTopic(s.name, s.folder, s.content);
    await DB.put('topics', t);
    await DB.putMany('exercises', s.exercises.map(x => newExercise(x, t.id)).filter(Boolean));
    added++;
  }
  return added;
}

Views.grammar = async () => {
  const [topics, exercises] = await Promise.all([DB.all('topics'), DB.all('exercises')]);
  const now = Date.now();
  const per = {};
  for (const x of exercises) {
    const p = per[x.topicId] ||= { n: 0, due: 0, fresh: 0 };
    p.n++;
    if (!x.srs) p.fresh++;
    else if (x.srs.due <= now) p.due++;
  }
  const names = new Set(topics.map(t => norm(t.name)));
  const missingStarter = STARTER_TOPICS.some(s => !names.has(norm(s.name)));
  app().innerHTML = `
    <div class="page-head"><h1>Граматика</h1>
      <div class="btns"><button class="btn primary" data-act="review" ${exercises.length ? '' : 'disabled'}>Повторити за розкладом</button></div>
    </div>
    <form class="panel row-form" id="newTopic">
      <input name="name" placeholder="Нова тема, напр. «Present Simple vs Continuous»" required>
      <input name="folder" placeholder="Папка (необов'язково)" list="tfolders">
      ${folderDatalist(topics, 'tfolders')}
      <button class="btn primary">Створити тему</button>
    </form>
    ${missingStarter ? `<div class="panel"><p>Є готові теми з правилами й вправами: ${STARTER_TOPICS.map(s => esc(s.name)).join('; ')}.</p><button class="btn" data-act="starter">Додати готові теми</button></div>` : ''}
    ${topics.length ? groupByFolder(topics).map(([f, list]) => `
      <section class="folder"><h2>${esc(f || 'Без папки')}</h2>
        <div class="deck-list">${list.map(t => {
          const p = per[t.id] || { n: 0, due: 0, fresh: 0 };
          return `<a class="deck" href="#/topic/${t.id}"><span class="deck-name">${esc(t.name)}</span>
            <span class="deck-meta">вправ: ${p.n}${p.due ? ` · <b>${p.due}</b> повторити` : ''}${p.fresh ? ` · ${p.fresh} нових` : ''}</span></a>`;
        }).join('')}</div></section>`).join('') : '<p class="muted">Тем ще немає. Їх можна створити вручну, додати готові або отримати з уроку.</p>'}`;

  $('#newTopic').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const t = newTopic(f.get('name'), f.get('folder'));
    await DB.put('topics', t);
    location.hash = '#/topic/' + t.id;
  };
  actions.starter = async () => { const n = await addStarterTopics(); toast(`Додано тем: ${n}`); render(); };
  actions.review = () => Study.grammar({ topicIds: topics.map(t => t.id), scheduled: true });
};

function exercisesPrompt(topic, n, level) {
  return `Я вивчаю англійську, мій рівень ${level}. Склади ${n} вправ на граматичну тему "${topic.name}".
${topic.content ? `\nПравило, яке я вже записала:\n"""\n${topic.content}\n"""\n` : '\nДодай також коротке правило українською у форматі markdown у поле "rule": коли вживається, як утворюється, слова-маркери, приклади.\n'}
Типи вправ:
- "gap": речення з пропуском ___, у дужках дієслово в початковій формі, 2-3 варіанти в "options", правильна відповідь у "answers";
- "translate": речення українською для перекладу англійською, кілька прийнятних перекладів у "answers".
Приблизно дві третини вправ типу "gap". До кожної вправи одне речення пояснення українською в "explanation". Речення мають бути різними за лексикою і ситуаціями.

Відповідь дай лише одним блоком JSON без пояснень:
{${topic.content ? '' : '\n  "rule": "## ...",'}
  "exercises": [
    {"kind": "gap", "prompt": "She ___ (live) here since 2019.", "answers": ["has lived"], "options": ["lived", "has lived"], "explanation": "since і дія триває досі: Present Perfect."},
    {"kind": "translate", "prompt": "Ти коли-небудь був у Парижі?", "answers": ["Have you ever been to Paris?"], "explanation": "ever: досвід, Present Perfect."}
  ]
}`;
}

function exerciseModal(x, { onSave, onDelete }) {
  const m = modal(`<h3>Вправа</h3>
    <form id="xf" class="stack">
      <label>Тип <select name="kind">
        <option value="gap" ${x.kind === 'gap' ? 'selected' : ''}>Пропуск у реченні</option>
        <option value="translate" ${x.kind === 'translate' ? 'selected' : ''}>Переклад речення</option>
      </select></label>
      <label>Завдання (пропуск позначайте ___)<textarea name="prompt" rows="2" required>${esc(x.prompt)}</textarea></label>
      <label>Правильні відповіді через |<input name="answers" value="${esc(x.answers.join(' | '))}" required></label>
      <label>Варіанти для вибору через | (порожньо, якщо вписувати)<input name="options" value="${esc(x.options.join(' | '))}"></label>
      <label>Пояснення<textarea name="explanation" rows="2">${esc(x.explanation)}</textarea></label>
      <div class="btns">
        <button class="btn primary">Зберегти</button>
        ${onDelete ? '<button type="button" class="btn danger" id="xdel">Видалити</button>' : ''}
        <button type="button" class="btn ghost" data-m="close">Скасувати</button>
      </div>
    </form>`);
  $('#xf', m.el).onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const fresh = newExercise(f, x.topicId);
    if (!fresh) { toast('Заповніть завдання і відповідь'); return; }
    Object.assign(x, { kind: fresh.kind, prompt: fresh.prompt, answers: fresh.answers, options: fresh.options, explanation: fresh.explanation });
    await DB.put('exercises', x);
    m.close();
    onSave();
  };
  if (onDelete) $('#xdel', m.el).onclick = async () => {
    if (!confirm('Видалити вправу?')) return;
    await DB.del('exercises', x.id);
    m.close();
    onDelete();
  };
}

Views.topic = async id => {
  const topic = await DB.get('topics', id);
  if (!topic) { app().innerHTML = '<div class="panel">Тему не знайдено. <a href="#/grammar">До списку</a></div>'; return; }
  const [exercises, topics, s] = await Promise.all([DB.byIndex('exercises', 'topicId', id), DB.all('topics'), getSettings()]);
  exercises.sort((a, b) => a.createdAt - b.createdAt);
  app().innerHTML = `
    <div class="page-head">
      <div><a href="#/grammar" class="crumb">Граматика${topic.folder ? ' / ' + esc(topic.folder) : ''}</a><h1>${esc(topic.name)}</h1></div>
      <div class="btns">
        <button class="btn primary" data-act="review" ${exercises.length ? '' : 'disabled'}>Повторити</button>
        <button class="btn" data-act="practice" ${exercises.length ? '' : 'disabled'}>Пройти всі вправи</button>
        <button class="btn ghost" data-act="editTopic">Назва і папка</button>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar"><h3>Правило</h3><button class="btn small ghost" data-act="toggleRule">Редагувати</button></div>
      <div class="md" id="ruleView">${topic.content ? md(topic.content) : '<p class="muted">Правило ще не записане.</p>'}</div>
      <div id="ruleEdit" class="stack" hidden>
        <textarea id="ruleText" rows="14">${esc(topic.content)}</textarea>
        <p class="muted">Розмітка: <code>## Заголовок</code>, <code>- пункт списку</code>, <code>**жирний**</code>.</p>
        <div class="btns"><button class="btn primary" data-act="saveRule">Зберегти</button></div>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar"><h3>Вправи (${exercises.length})</h3><button class="btn small" data-act="addEx">Додати вправу</button></div>
      ${exercises.length ? `<ul class="ex-list">${exercises.map(x => {
        const l = SRS.label(x.srs);
        return `<li><div><span class="badge">${x.kind === 'translate' ? 'переклад' : x.options.length ? 'вибір' : 'вписати'}</span> ${esc(x.prompt)}
          <div class="ex">→ ${esc(x.answers.join(' / '))}</div></div>
          <div class="right"><span class="badge ${l.cls}">${l.text}</span> <button class="btn small ghost" data-act="editEx" data-id="${x.id}">Змінити</button></div></li>`;
      }).join('')}</ul>` : '<p class="muted">Вправ ще немає.</p>'}
    </div>
    <div class="panel stack">
      <h3>Більше вправ від Claude</h3>
      <div class="toolbar">
        <label>Кількість <select id="xn">${[10, 15, 20, 30].map(n => `<option>${n}</option>`).join('')}</select></label>
        <label>Рівень <select id="xl">${LEVELS.map(l => `<option ${l === s.level ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <button class="btn" data-act="copyEx">Скопіювати запит</button>
      </div>
      <textarea id="xresp" rows="5" placeholder="Вставте сюди відповідь Claude"></textarea>
      <div class="btns"><button class="btn primary" data-act="importEx">Додати вправи</button></div>
    </div>`;

  actions.review = () => Study.grammar({ topicIds: [id], scheduled: true });
  actions.practice = () => Study.grammar({ topicIds: [id], scheduled: false });
  actions.toggleRule = () => { $('#ruleEdit').hidden = !$('#ruleEdit').hidden; $('#ruleView').hidden = !$('#ruleEdit').hidden; };
  actions.saveRule = async () => { topic.content = $('#ruleText').value; await DB.put('topics', topic); render(); };
  actions.addEx = () => exerciseModal({ topicId: id, kind: 'gap', prompt: '', answers: [], options: [], explanation: '', id: uid(), createdAt: Date.now(), srs: null }, { onSave: render });
  actions.editEx = el => exerciseModal(exercises.find(x => x.id === el.dataset.id), { onSave: render, onDelete: render });
  actions.copyEx = async () => { await copyText(exercisesPrompt(topic, $('#xn').value, $('#xl').value)); toast('Запит скопійовано'); };
  actions.importEx = async () => {
    let data;
    try { data = parseClaudeJson($('#xresp').value); }
    catch { toast('Не вдалося прочитати відповідь Claude'); return; }
    const raw = [...data.exercises, ...data.grammar.flatMap(g => g.exercises || [])];
    const known = new Set(exercises.map(x => norm(x.prompt)));
    const exs = raw.map(x => newExercise(x, id)).filter(x => x && !known.has(norm(x.prompt)));
    const rule = data.rule || data.grammar.find(g => g.rule)?.rule;
    if (!topic.content && rule) { topic.content = rule; await DB.put('topics', topic); }
    await DB.putMany('exercises', exs);
    toast(`Додано вправ: ${exs.length}`);
    render();
  };
  actions.editTopic = () => {
    const m = modal(`<h3>Тема</h3>
      <form id="tf2" class="stack">
        <label>Назва<input name="name" value="${esc(topic.name)}" required></label>
        <label>Папка<input name="folder" value="${esc(topic.folder)}" list="tf3"></label>
        ${folderDatalist(topics, 'tf3')}
        <div class="btns">
          <button class="btn primary">Зберегти</button>
          <button type="button" class="btn danger" id="tdel">Видалити тему</button>
          <button type="button" class="btn ghost" data-m="close">Скасувати</button>
        </div>
      </form>`);
    $('#tf2', m.el).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      topic.name = f.get('name').trim();
      topic.folder = f.get('folder').trim();
      await DB.put('topics', topic);
      m.close();
      render();
    };
    $('#tdel', m.el).onclick = async () => {
      if (!confirm(`Видалити тему «${topic.name}» і всі її вправи (${exercises.length})?`)) return;
      await DB.delMany('exercises', exercises.map(x => x.id));
      await DB.del('topics', id);
      m.close();
      location.hash = '#/grammar';
    };
  };
};
