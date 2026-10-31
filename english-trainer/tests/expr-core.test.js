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
  assert.match(rows[0].errors[0], /4 поля/);
  assert.match(rows[1].errors[0], /meaning_uk/);
  assert.match(rows[2].errors.join(), /Забагато/);
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

test('імпорт: попередження, якщо cue_uk містить англійські слова виразу або це одне слово', () => {
  const [a, b] = X.parseImport('flag a concern | m | Треба flag це | e\nleverage | m | c | e');
  assert.match(a.warnings.join(), /cue_uk/);
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
