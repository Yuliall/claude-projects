const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/expr-core.js');

const LIMITS = { reviewsPerDay: 15, newPerDay: 7, activeMax: 20 };
let seq = 0;
const card = (over = {}) => ({ ...X.makeExpression({ expression: 'push back on something ' + seq, meaning_uk: 'm', cue_uk: 'c', example_en: 'e' }, 'test', Date.UTC(2026, 0, 1) + seq++), ...over });

test('інтервали: «Згадала» веде по драбині 1-3-7-14-30 і зупиняється на 30', () => {
  let c = card({ status: 'active' });
  const seen = [];
  for (let i = 0; i < 7; i++) { c = X.schedule(c, 'got', '2026-11-01'); seen.push(c.interval_days); }
  assert.deepEqual(seen, [1, 3, 7, 14, 30, 30, 30]);
  assert.equal(c.consecutive_correct, 7);
});

test('інтервали: «Частково» лишає поточний, «Забула» скидає на 1 день', () => {
  const c = card({ status: 'active', interval_days: 7, last_result: 'got', consecutive_correct: 3 });
  const partly = X.schedule(c, 'partly', '2026-11-01');
  assert.equal(partly.interval_days, 7);
  assert.equal(partly.due_date, '2026-11-08');
  assert.equal(partly.consecutive_correct, 0);
  const forgot = X.schedule(c, 'forgot', '2026-11-01');
  assert.equal(forgot.interval_days, 1);
  assert.equal(forgot.due_date, '2026-11-02');
  assert.equal(forgot.last_result, 'forgot');
});

test('інтервали: перша оцінка нового виразу дає 1 день', () => {
  for (const g of ['got', 'partly', 'forgot']) {
    assert.equal(X.schedule(card({ status: 'active' }), g, '2026-11-01').interval_days, 1);
  }
});

test('дата наступного повторення переходить через межу місяця і року', () => {
  const c = card({ status: 'active', interval_days: 3, last_result: 'got' });
  assert.equal(X.schedule(c, 'got', '2026-10-30').due_date, '2026-11-06');
  assert.equal(X.addDays('2026-12-30', 3), '2027-01-02');
});

test('ліміти: не більше 15 повторень і 7 нових на день, з урахуванням уже зробленого', () => {
  const due = Array.from({ length: 20 }, (_, i) => card({ status: 'active', last_result: 'got', interval_days: 3, due_date: '2026-10-' + String(10 + i) }));
  const fresh = Array.from({ length: 10 }, () => card({ status: 'active' }));
  let p = X.planDay([...due, ...fresh], '2026-11-01', { reviews: 0, fresh: 0 }, LIMITS);
  assert.equal(p.reviews.length, 15);
  assert.equal(p.fresh.length, 7);
  p = X.planDay([...due, ...fresh], '2026-11-01', { reviews: 10, fresh: 7 }, LIMITS);
  assert.equal(p.reviews.length, 5);
  assert.equal(p.fresh.length, 0);
});

test('ліміти: повторення йдуть від найстаріших; майбутні та вирази з черги не потрапляють', () => {
  const a = card({ status: 'active', last_result: 'got', due_date: '2026-10-20' });
  const b = card({ status: 'active', last_result: 'got', due_date: '2026-10-01' });
  const future = card({ status: 'active', last_result: 'got', due_date: '2026-11-05' });
  const queued = card({ status: 'queued' });
  const p = X.planDay([a, b, future, queued], '2026-11-01', { reviews: 0, fresh: 0 }, LIMITS);
  assert.deepEqual(p.reviews.map(c => c.id), [b.id, a.id]);
  assert.equal(p.fresh.length, 0);
});

test('перенесення: прострочені понад ліміт переходять на наступний день і не накопичуються в одному дні', () => {
  let cards = Array.from({ length: 20 }, () => card({ status: 'active', last_result: 'got', interval_days: 1, due_date: '2026-11-01' }));
  const day1 = X.planDay(cards, '2026-11-01', { reviews: 0, fresh: 0 }, LIMITS).reviews;
  assert.equal(day1.length, 15);
  const graded = new Map(day1.map(c => [c.id, X.schedule(c, 'got', '2026-11-01')]));
  cards = cards.map(c => graded.get(c.id) || c);
  const day2 = X.planDay(cards, '2026-11-02', { reviews: 0, fresh: 0 }, LIMITS).reviews;
  assert.equal(day2.length, 5, 'залишок з учора');
  assert.ok(day2.every(c => c.due_date === '2026-11-01'));
  const day4 = X.planDay(cards, '2026-11-04', { reviews: 0, fresh: 0 }, LIMITS).reviews;
  assert.equal(day4.length, 15, 'ніколи більше за денний ліміт');
  assert.equal(day4[0].due_date, '2026-11-01', 'найстаріші першими');
});

test('countDone рахує кожен вираз раз за день і розділяє нові та повторення', () => {
  const ts = new Date(2026, 10, 1, 10).getTime();
  const logs = [
    { type: 'expr', itemId: 'a', first: true, ts },
    { type: 'expr', itemId: 'b', first: false, ts },
    { type: 'expr', itemId: 'b', first: false, ts },
    { type: 'expr', itemId: 'c', first: false, ts: ts - 86400000 },
    { type: 'word', itemId: 'd', first: true, ts },
  ];
  assert.deepEqual(X.countDone(logs, '2026-11-01'), { fresh: 1, reviews: 1 });
});

test('черга: не більше 20 активних, вільні місця заповнюються в порядку додавання', () => {
  const active = Array.from({ length: 18 }, () => card({ status: 'active' }));
  const queued = Array.from({ length: 5 }, () => card({ status: 'queued' }));
  const promoted = X.promote([...active, ...queued], 20, '2026-11-01');
  assert.deepEqual(promoted.map(c => c.id), queued.slice(0, 2).map(c => c.id));
  assert.ok(promoted.every(c => c.status === 'active' && c.activated_at === '2026-11-01'));
  assert.equal(X.promote([...active, ...promoted, ...queued.slice(2)], 20, '2026-11-01').length, 0);
});

test('черга: засвоєний вираз звільняє місце', () => {
  const active = Array.from({ length: 20 }, () => card({ status: 'active', used_unprompted_count: 1 }));
  const queued = [card({ status: 'queued' })];
  assert.equal(X.promote([...active, ...queued], 20, '2026-11-01').length, 0);
  active[0] = X.applyUsage(active[0], 'unprompted', new Date(2026, 10, 1, 12).getTime());
  assert.equal(active[0].status, 'mastered');
  assert.equal(X.promote([...active, ...queued], 20, '2026-11-01').length, 1);
});

test('mastered: лише після 2 використань без підказки; з підказкою не рахується', () => {
  const ts = new Date(2026, 10, 1, 12).getTime();
  let c = card({ status: 'active' });
  c = X.applyUsage(c, 'hint', ts);
  c = X.applyUsage(c, 'hint', ts);
  assert.equal(c.status, 'active');
  c = X.applyUsage(c, 'unprompted', ts);
  assert.equal(c.status, 'active');
  c = X.applyUsage(c, 'unprompted', ts);
  assert.equal(c.status, 'mastered');
  assert.equal(c.interval_days, 30);
  assert.equal(c.due_date, '2026-12-01');
  assert.equal(c.used_with_hint_count, 2);
});

test('mastered: повторення завжди раз на 30 днів, незалежно від оцінки', () => {
  const c = card({ status: 'mastered', interval_days: 30, last_result: 'got', due_date: '2026-11-01' });
  for (const g of ['got', 'partly', 'forgot']) {
    const r = X.schedule(c, g, '2026-11-01');
    assert.equal(r.interval_days, 30);
    assert.equal(r.status, 'mastered');
  }
});

test('порівняння: регістр, розділові знаки й артиклі не враховуються', () => {
  assert.equal(X.compare('Flag concern!', 'flag a concern').suggestion, 'got');
  assert.equal(X.compare('flag the concern', 'flag a concern').suggestion, 'got');
  assert.equal(X.compare('GET BUY IN FROM', 'get buy-in from someone').suggestion, 'got');
});

test('порівняння: заповнювач можна замінити своїми словами, частина в дужках не обов\'язкова', () => {
  assert.equal(X.compare('push back on the deadline', 'push back on something').suggestion, 'got');
  assert.equal(X.compare('park it for now', 'park something (for now)').suggestion, 'got');
  assert.equal(X.compare('park', 'park something (for now)').suggestion, 'partly');
  assert.equal(X.compare('push on', 'push back on something').suggestion, 'partly');
  assert.equal(X.compare('come back', 'circle back to something').suggestion, 'forgot');
  assert.equal(X.compare('', 'flag a concern').suggestion, 'forgot');
});

test('порівняння: показує пропущені та зайві слова', () => {
  const r = X.compare('push back the plan', 'push back on something');
  assert.deepEqual(r.expression.map(t => t.state), ['match', 'match', 'missing', 'neutral']);
  assert.deepEqual(r.answer.map(t => t.state), ['match', 'match', 'neutral', 'neutral'], 'слово на місці something не зайве');
  const s = X.compare('flag a serious concern', 'flag a concern');
  assert.deepEqual(s.answer.map(t => t.state), ['match', 'neutral', 'extra', 'match']);
  assert.equal(s.suggestion, 'partly');
});

test('імпорт: 5 полів і 4 поля без цитати', () => {
  const rows = X.parseImport([
    'push back on something | заперечувати | Клієнт тисне на терміни, ти не погоджуєшся. | I pushed back on the deadline. | "we need to push back"',
    'flag a concern | висловити застереження | Ти бачиш ризик у плані. | I want to flag a concern.',
  ].join('\n'));
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => !r.errors.length && !r.duplicate));
  assert.equal(rows[0].data.note, '"we need to push back"');
  assert.equal(rows[1].data.note, '');
});

test('імпорт: помилки валідації з номером рядка', () => {
  const rows = X.parseImport('\nonly | two\nflag a concern |  | cue | example\na | b | c | d | e | f');
  assert.equal(rows[0].line, 2);
  assert.match(rows[0].errors[0], /Полів 2/);
  assert.match(rows[1].errors[0], /значення/);
  assert.match(rows[2].errors.join(), /Полів 6/);
});

test('імпорт: дублі за виразом пропускаються, і з наявних, і всередині вставки', () => {
  const rows = X.parseImport([
    'Flag a concern | m | c | e',
    'flag the concern. | m | c | e',
    'push back on sth | m | c | e',
  ].join('\n'), ['push back on something']);
  assert.deepEqual(rows.map(r => r.duplicate), [false, true, true]);
});

test('імпорт: заголовок і markdown-таблиця', () => {
  const rows = X.parseImport([
    '| expression | meaning_uk | cue_uk | example_en | quote |',
    '|---|---|---|---|---|',
    '| circle back to something | повернутися до | Пропонуєш обговорити бюджет пізніше. | Let\'s circle back to it. | |',
  ].join('\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.expression, 'circle back to something');
  assert.deepEqual(rows[0].errors, []);
});

test('імпорт: попередження, якщо ситуація містить англійські слова виразу або це одне слово', () => {
  const [a, b] = X.parseImport('flag a concern | m | Треба flag це | e\nleverage | m | c | e');
  assert.match(a.warnings.join(), /Ситуація/);
  assert.match(b.warnings.join(), /Одне слово/);
});

test('прогрес по тижнях і частка виразів з попередніх тижнів', () => {
  const day = (d, h = 12) => new Date(2026, 9, d, h).getTime();
  const a = card({ status: 'active', activated_at: '2026-10-12', used_unprompted_count: 1 });
  const b = card({ status: 'active', activated_at: '2026-10-13' });
  const c = card({ status: 'active', activated_at: '2026-10-28', used_with_hint_count: 1 });
  const logs = [
    { type: 'usage', kind: 'unprompted', itemId: a.id, ts: day(20) },
    { type: 'usage', kind: 'unprompted', itemId: a.id, ts: day(21) },
    { type: 'usage', kind: 'hint', itemId: c.id, ts: day(28) },
  ];
  const p = X.weeklyProgress([a, b, c, card({ status: 'queued' })], logs, '2026-10-29', 3);
  assert.deepEqual(p.weeks.map(w => [w.start, w.unprompted, w.hint]), [['2026-10-12', 0, 0], ['2026-10-19', 1, 0], ['2026-10-26', 0, 1]]);
  assert.deepEqual(p.earlier, { total: 2, used: 1 });
  assert.deepEqual(p.never.map(x => x.id), [b.id]);
});

test('рольова гра: до 5 виразів, спершу «Забула», потім «Частково»', () => {
  const ts = new Date(2026, 10, 1, 9).getTime();
  const cards = Array.from({ length: 7 }, (_, i) => card({ expression: 'expr ' + i }));
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  const grades = ['got', 'partly', 'got', 'forgot', 'got', 'partly', 'got'];
  const logs = cards.map((c, i) => ({ type: 'expr', itemId: c.id, grade: grades[i], ts: ts + i }));
  logs.push({ type: 'expr', itemId: cards[0].id, grade: 'forgot', ts: ts - 86400000 });
  assert.deepEqual(X.rolePlayPick(logs, byId, '2026-11-01'), ['expr 3', 'expr 1', 'expr 5', 'expr 0', 'expr 2']);
});

// ---------- образ, ситуації, сфери ----------

const SAMPLE_NEW = [
  'park something (for now) | відкласти питання на потім | робота | Колега хоче обговорити бюджет, а це забере всю зустріч | На планерці виникло питання, яке стосується лише двох людей | Клієнт питає про функцію, рішення щодо якої ще не ухвалене | поставити машину на стоянку: питання стоїть, потім його заберуть | Let\'s park the pricing question for now.',
  'circle back to something | повернутися до теми пізніше | робота | Ви не маєте даних для відповіді і обіцяєте повернутися | Обговорення пішло вбік, і ви хочете повернутися до головного | | зробити коло і прийти в ту саму точку | I\'ll circle back to this after the call.',
  'run errands | бігати у справах (магазин, пошта, банк) | життя | Подруга кличе на каву в суботу зранку, а у вас купа дрібних справ | Ви пояснюєте, чому не відповідали на повідомлення пів дня | | бігти по маленьких колах: пошта, аптека, магазин | I need to run some errands before lunch. | I had to run errands',
].join('\n');

test('міграція: cue_uk стає першою ситуацією, додаються сфера й образ, старе поле лишається', () => {
  const old = { id: 'o1', expression: 'flag a concern', meaning_uk: 'm', cue_uk: 'Ти бачиш ризик.', example_en: 'e', status: 'active' };
  const up = X.upgrade(old);
  assert.deepEqual(up.cues_uk, ['Ти бачиш ризик.']);
  assert.equal(up.cue_uk, 'Ти бачиш ризик.');
  assert.equal(up.domain, 'work');
  assert.equal(up.image_note, '');
  assert.equal(up.last_cue_index, null);
  assert.equal(up.status, 'active');
  assert.equal(X.upgrade(up), up, 'повторна міграція нічого не змінює');
  assert.deepEqual(X.upgrade({ ...old, cue_uk: '' }).cues_uk, []);
  assert.equal(X.upgrade({ ...old, domain: 'life' }).domain, 'life');
});

test('ситуація: ніколи не повторює показану минулого разу', () => {
  const c = { cues_uk: ['a', 'b', 'c'], last_cue_index: 1 };
  for (let r = 0; r < 1; r += 0.05) assert.notEqual(X.pickCue(c, () => r).index, 1);
  const seen = new Set();
  for (let r = 0; r < 1; r += 0.05) seen.add(X.pickCue(c, () => r).index);
  assert.deepEqual([...seen].sort(), [0, 2], 'обидві інші ситуації можливі');
});

test('ситуація: одна показується завжди, порожніх немає, без попередньої — будь-яка', () => {
  assert.equal(X.pickCue({ cues_uk: ['лише одна'], last_cue_index: 0 }).text, 'лише одна');
  assert.deepEqual(X.pickCue({ cues_uk: [], last_cue_index: null }), { index: null, text: '' });
  assert.equal(X.pickCue({ cues_uk: ['a', '', 'c'], last_cue_index: 0 }, () => 0.99).index, 2);
  assert.equal(X.pickCue({ cues_uk: ['a', 'b'], last_cue_index: null }, () => 0).index, 0);
});

test('ситуація: оцінка запам\'ятовує показану ситуацію', () => {
  const c = X.schedule(card({ status: 'active', cues_uk: ['a', 'b'] }), 'got', '2026-11-01', 1);
  assert.equal(c.last_cue_index, 1);
  assert.equal(X.pickCue(c, () => 0.99).index, 0);
});

const dueCard = (domain, i) => card({ status: 'active', domain, last_result: 'got', interval_days: 3, due_date: '2026-10-' + String(10 + (i % 20)).padStart(2, '0') });
const freshCard = domain => card({ status: 'active', domain });
const NO_DONE = { reviews: 0, fresh: 0 };
const countLife = list => list.filter(c => c.domain === 'life').length;

test('частка сфер: 40% «життя» серед повторень і нових, коли карток більше за ліміт', () => {
  const cards = [
    ...Array.from({ length: 20 }, (_, i) => dueCard('work', i)), ...Array.from({ length: 20 }, (_, i) => dueCard('life', i)),
    ...Array.from({ length: 10 }, () => freshCard('work')), ...Array.from({ length: 10 }, () => freshCard('life')),
  ];
  const p = X.planDay(cards, '2026-11-01', NO_DONE, { ...LIMITS, lifeShare: 0.4 });
  assert.equal(p.reviews.length, 15);
  assert.equal(countLife(p.reviews), 6);
  assert.equal(p.fresh.length, 7);
  assert.equal(countLife(p.fresh), 3);
});

test('частка сфер: якщо в одній сфері карток мало, місця дістаються іншій', () => {
  const few = [...Array.from({ length: 20 }, (_, i) => dueCard('work', i)), dueCard('life', 0), dueCard('life', 1)];
  let p = X.planDay(few, '2026-11-01', NO_DONE, { ...LIMITS, lifeShare: 0.4 });
  assert.equal(p.reviews.length, 15);
  assert.equal(countLife(p.reviews), 2);
  const onlyLife = Array.from({ length: 20 }, (_, i) => dueCard('life', i));
  p = X.planDay(onlyLife, '2026-11-01', NO_DONE, { ...LIMITS, lifeShare: 0.4 });
  assert.equal(p.reviews.length, 15);
});

test('частка сфер: усередині сфери спершу найстаріші, сфери в сесії чергуються', () => {
  const cards = [...Array.from({ length: 20 }, (_, i) => dueCard('work', i)), ...Array.from({ length: 20 }, (_, i) => dueCard('life', i))];
  const p = X.planDay(cards, '2026-11-01', NO_DONE, { ...LIMITS, lifeShare: 0.4 });
  const lifeDates = p.reviews.filter(c => c.domain === 'life').map(c => c.due_date);
  assert.deepEqual(lifeDates, [...lifeDates].sort());
  assert.equal(lifeDates[0], '2026-10-10');
  assert.deepEqual(p.reviews.slice(0, 4).map(c => c.domain), ['work', 'life', 'work', 'life']);
});

test('частка сфер: черга заповнює спільний ліміт 20 з урахуванням частки «життя»', () => {
  const queued = [...Array.from({ length: 15 }, () => card({ status: 'queued', domain: 'work' })), ...Array.from({ length: 15 }, () => card({ status: 'queued', domain: 'life' }))];
  const promoted = X.promote(queued, 20, '2026-11-01', 0.4);
  assert.equal(promoted.length, 20);
  assert.equal(countLife(promoted), 8);
  const onlyWork = Array.from({ length: 25 }, () => card({ status: 'queued', domain: 'work' }));
  assert.equal(X.promote(onlyWork, 20, '2026-11-01', 0.4).length, 20, 'без карток «життя» всі місця для роботи');
});

test('імпорт: новий формат з 8 полями, порожні ситуації 2–3 і цитата необов\'язкові', () => {
  const rows = X.parseImport(SAMPLE_NEW);
  assert.ok(rows.every(r => !r.errors.length && r.format === 'new'), JSON.stringify(rows.map(r => r.errors)));
  assert.deepEqual(rows.map(r => r.data.domain), ['work', 'work', 'life']);
  assert.deepEqual(rows.map(r => r.data.cues_uk.length), [3, 2, 2]);
  assert.equal(rows[0].data.image_note, 'поставити машину на стоянку: питання стоїть, потім його заберуть');
  assert.equal(rows[0].data.example_en, "Let's park the pricing question for now.");
  assert.equal(rows[0].data.note, '');
  assert.equal(rows[2].data.note, 'I had to run errands');
  const c = X.makeExpression(rows[2].data, '2026-11-01', Date.now());
  assert.equal(c.domain, 'life');
  assert.equal(c.cue_uk, rows[2].data.cues_uk[0]);
  assert.equal(c.image_note, 'бігти по маленьких колах: пошта, аптека, магазин');
});

test('імпорт: новий формат — помилки сфери, ситуації 1 і кількості полів', () => {
  const rows = X.parseImport([
    'run errands | справи | дім | s1 | | | образ | I run errands.',
    'run errands | справи | життя | | s2 | | образ | I run errands.',
    'a b | c | життя | s1 | s2 | s3 | e',
  ].join('\n'));
  assert.match(rows[0].errors.join(), /робота.*життя/);
  assert.match(rows[1].errors.join(), /ситуація 1/);
  assert.match(rows[2].errors.join(), /Полів 7/);
});

test('імпорт: старий формат з 5 полями працює далі, сфера «робота»', () => {
  const [r] = X.parseImport('flag a concern | висловити застереження | Ти бачиш ризик у плані. | I want to flag a concern. | цитата');
  assert.equal(r.format, 'old');
  assert.deepEqual(r.errors, []);
  assert.equal(r.data.domain, 'work');
  assert.deepEqual(r.data.cues_uk, ['Ти бачиш ризик у плані.']);
  assert.equal(r.data.image_note, '');
  assert.equal(r.data.note, 'цитата');
});

test('імпорт: дублі за виразом між форматами пропускаються', () => {
  const rows = X.parseImport(SAMPLE_NEW + '\npark something | відкласти | c | e', ['run errands']);
  assert.deepEqual(rows.map(r => r.duplicate), [false, false, true, true]);
});

test('діалог: вирази лише однієї сфери, доповнення активними невжитими', () => {
  const ts = new Date(2026, 10, 1, 9).getTime();
  const w1 = card({ expression: 'w1', domain: 'work', status: 'active' });
  const l1 = card({ expression: 'l1', domain: 'life', status: 'active' });
  const l2 = card({ expression: 'l2', domain: 'life', status: 'active', last_result: 'forgot' });
  const l3 = card({ expression: 'l3', domain: 'life', status: 'active', used_unprompted_count: 1 });
  const byId = Object.fromEntries([w1, l1, l2, l3].map(c => [c.id, c]));
  const logs = [{ type: 'expr', itemId: w1.id, grade: 'forgot', ts }, { type: 'expr', itemId: l1.id, grade: 'got', ts }];
  assert.deepEqual(X.rolePlayPick(logs, byId, '2026-11-01', 5, 'life'), ['l1', 'l2']);
  assert.deepEqual(X.rolePlayPick(logs, byId, '2026-11-01', 5, 'work'), ['w1']);
});

test('прогрес окремо для кожної сфери', () => {
  const day = d => new Date(2026, 9, d, 12).getTime();
  const w = card({ status: 'active', domain: 'work', activated_at: '2026-10-12', used_unprompted_count: 1 });
  const l = card({ status: 'active', domain: 'life', activated_at: '2026-10-12' });
  const logs = [{ type: 'usage', kind: 'unprompted', itemId: w.id, ts: day(27) }];
  const pw = X.weeklyProgress([w, l], logs, '2026-10-29', 2, 'work');
  const pl = X.weeklyProgress([w, l], logs, '2026-10-29', 2, 'life');
  assert.equal(pw.weeks[1].unprompted, 1);
  assert.equal(pl.weeks[1].unprompted, 0);
  assert.deepEqual(pw.earlier, { total: 1, used: 1 });
  assert.deepEqual(pl.never.map(c => c.id), [l.id]);
});
