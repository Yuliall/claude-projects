// FSRS-4.5 з параметрами за замовчуванням плюс етап вивчення (кроки в хвилинах, як в Anki).
const SRS = (() => {
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DECAY = -0.5;
  const FACTOR = 19 / 81;
  const DAY = 86400000;
  // Нове слово треба двічі назвати правильно; після «Не знаю» відлік починається знову.
  const STEPS = [1, 10];

  const clampD = d => Math.min(10, Math.max(1, d));
  const initD = g => clampD(W[4] - (g - 3) * W[5]);
  const retrievability = (days, s) => Math.pow(1 + FACTOR * days / s, DECAY);
  const intervalDays = (s, retention) =>
    Math.min(36500, Math.max(1, Math.round(s / FACTOR * (Math.pow(retention, 1 / DECAY) - 1))));

  // g: 1 = не знаю, 2 = важко, 3 = знаю, 4 = легко
  function review(st, g, now = Date.now(), retention = 0.9) {
    let s, d;
    if (!st) {
      s = W[g - 1];
      d = initD(g);
    } else {
      const r = retrievability(Math.max(0, (now - st.last) / DAY), st.s);
      if (g === 1) {
        s = Math.min(st.s, W[11] * Math.pow(st.d, -W[12]) * (Math.pow(st.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
      } else {
        const hard = g === 2 ? W[15] : 1;
        const easy = g === 4 ? W[16] : 1;
        s = st.s * (1 + Math.exp(W[8]) * (11 - st.d) * Math.pow(st.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
      }
      d = clampD(W[7] * initD(4) + (1 - W[7]) * (st.d - W[6] * (g - 3)));
    }
    s = Math.max(0.1, s);

    let step;
    if (!st || st.learning) {
      const cur = st?.learning ? st.step : 0;
      step = g === 1 ? 0 : g === 2 ? cur : g === 3 ? cur + 1 : STEPS.length;
    } else {
      // Забуте слово повертається на останній крок вивчення.
      step = g === 1 ? STEPS.length - 1 : STEPS.length;
    }
    const learning = step < STEPS.length;
    const due = learning ? now + STEPS[step] * 60000 : now + intervalDays(s, retention) * DAY;
    return {
      s, d, due, last: now, learning, step: learning ? step : 0,
      reps: (st?.reps || 0) + 1,
      lapses: (st?.lapses || 0) + (st && !st.learning && g === 1 ? 1 : 0),
    };
  }

  // Слова на етапі вивчення доступні весь день, а не лише коли минули хвилини кроку.
  const isDue = (st, now = Date.now()) => !!st && (st.learning || st.due <= now);

  function label(st) {
    if (!st) return { text: 'нове', cls: 'new' };
    if (st.learning) return { text: 'вчу', cls: 'learning' };
    if (st.s < 21) return { text: Math.max(1, Math.round(st.s)) + ' дн', cls: 'young' };
    return { text: 'знаю', cls: 'known' };
  }

  // Стани, збережені до появи етапу вивчення: «Не знаю» або «Важко» з першого разу дають s < 1.5.
  function upgrade(st, now = Date.now()) {
    if (!st || st.learning !== undefined) return st;
    return st.s < 1.5 ? { ...st, learning: true, step: 0, due: now } : { ...st, learning: false, step: 0 };
  }

  return { review, isDue, label, upgrade };
})();
