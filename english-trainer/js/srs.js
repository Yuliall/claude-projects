// FSRS-4.5 з параметрами за замовчуванням.
const SRS = (() => {
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DECAY = -0.5;
  const FACTOR = 19 / 81;
  const DAY = 86400000;

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
    const due = g === 1 ? now + 60000 : now + intervalDays(s, retention) * DAY;
    return { s, d, due, last: now, reps: (st?.reps || 0) + 1, lapses: (st?.lapses || 0) + (st && g === 1 ? 1 : 0) };
  }

  function label(st) {
    if (!st) return { text: 'нове', cls: 'new' };
    if (st.s < 3) return { text: 'вчу', cls: 'learning' };
    if (st.s < 21) return { text: Math.round(st.s) + ' дн', cls: 'young' };
    return { text: 'знаю', cls: 'known' };
  }

  return { review, label };
})();
