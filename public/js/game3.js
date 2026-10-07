/**
 * game3.js  Jogo 3 "Descubra a Regra da Magia" (Wisconsin Card Sorting Test)
 * Avalia flexibilidade cognitiva: acertos, trocas de regra, erros após
 * mudança de regra, tempo de resposta e índice de perseveração.
 *
 * Objetivo: completar 30 rodadas CORRETAS, com no máximo 60 tentativas
 * no total. A regra (cor, forma ou quantidade) é sorteada de forma
 * totalmente independente a cada pergunta - não há mais blocos fixos de
 * perguntas seguidas sob a mesma regra.
 */
const session = SessionState.requireOrRedirect();

const COLORS = [{ n: "Vermelho", hex: "#E5484D" }, { n: "Azul", hex: "#3B82F6" }, { n: "Verde", hex: "#22C55E" }, { n: "Amarelo", hex: "#FACC15" }];
const SHAPE_GLYPH = { tri: "▲", circ: "●", sq: "■", star: "★" };
const SHAPES = Object.keys(SHAPE_GLYPH);
const QTYS = [1, 2, 3, 4];
const RULES = ["cor", "forma", "quantidade"];
const TARGET_TOTAL_CORRECT = 30;     // meta total de acertos
const MAX_TRIALS = 60;               // máximo de tentativas
const TRIAL_TIMEOUT_MS = 20000;      // 20 segundos por rodada
const GAME_TIME_LIMIT_MS = 7 * 60 * 1000; // 7 minutos
const WRONG_RT_PENALTY_MS = 3500;    // valor usado no cálculo da média quando a resposta é errada

const app = document.getElementById("app");
let g = null;
let introTimer = null;

function renderIntro() {
  app.innerHTML = `
  <div class="screen">
    ${dotsHtml(2)}
    <h1 class="big-title">Jogo 3 · A Regra da Magia</h1>
    <p class="subtitle">Ajude o mago a organizar as cartas! Observe a sequência mágica lá em cima e escolha, entre as cartas de baixo, a que continua o mesmo padrão. A regra secreta pode mudar sem avisar  fique esperto!</p>
    <button class="btn" onclick="beginGame()">Estou pronto(a)!</button>
    <div class="intro-countdown" id="introCountdown"></div>
  </div>
  ${attributionFooterHtml()}`;
  introTimer = attachIntroCountdown(() => beginGame(), 60);
}

function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeCard() { return { color: randPick(COLORS), shape: randPick(SHAPES), qty: randPick(QTYS) }; }
function cardsEqualDim(a, b, dim) {
  if (dim === "cor") return a.color.n === b.color.n;
  if (dim === "forma") return a.shape === b.shape;
  return a.qty === b.qty;
}

function buildTrial(rule) {
  const ref = makeCard();
  const dims = ["cor", "forma", "quantidade"];
  const opts = [];
  dims.forEach((dim) => {
    let card;
    let tries = 0;
    do {
      card = makeCard();
      tries++;
    } while (tries < 30 && (
      (dim !== "cor" && cardsEqualDim(card, ref, "cor")) ||
      (dim !== "forma" && cardsEqualDim(card, ref, "forma")) ||
      (dim !== "quantidade" && cardsEqualDim(card, ref, "quantidade")) ||
      !cardsEqualDim(card, ref, dim)
    ));
    if (dim === "cor") card.color = ref.color;
    if (dim === "forma") card.shape = ref.shape;
    if (dim === "quantidade") card.qty = ref.qty;
    opts.push({ card, matchDim: dim });
  });
  let noMatch;
  let tries = 0;
  do { noMatch = makeCard(); tries++; }
  while (tries < 30 && (cardsEqualDim(noMatch, ref, "cor") || cardsEqualDim(noMatch, ref, "forma") || cardsEqualDim(noMatch, ref, "quantidade")));
  opts.push({ card: noMatch, matchDim: null });
  return { ref, example: buildRuleExample(ref, rule), opts: shuffle(opts) };
}

/**
 * Monta a carta "exemplo" mostrada ao lado da carta de referência, formando a
 * sequência lógica do topo da tela (ex.: ■■■ › ▲▲▲▲). Ela compartilha com a
 * referência apenas a dimensão da regra vigente (cor, forma ou quantidade)
 * as outras duas dimensões são forçadamente diferentes  demonstrando
 * visualmente o padrão que a criança deve seguir ao escolher entre as opções.
 */
function buildRuleExample(ref, rule) {
  const example = { color: ref.color, shape: ref.shape, qty: ref.qty };
  if (rule !== "cor") example.color = randPick(COLORS.filter((c) => c.n !== ref.color.n));
  if (rule !== "forma") example.shape = randPick(SHAPES.filter((s) => s !== ref.shape));
  if (rule !== "quantidade") example.qty = randPick(QTYS.filter((q) => q !== ref.qty));
  return example;
}

function cardHtml(card) {
  const glyph = SHAPE_GLYPH[card.shape];
  let inner = "";
  for (let i = 0; i < card.qty; i++) inner += `<span style="color:${card.color.hex}">${glyph}</span>`;
  return inner;
}

function beginGame() {
  clearInterval(introTimer);
  Sounds.playStart();
  g = {
    rule: null, previousRule: null,
    totalCorrect: 0, ruleChanges: 0,
    trialIndex: 0, trials: [],
    trial: null, trialStart: 0, trialTimer: null,
    ended: false, gameClockInterval: null, remainingMs: GAME_TIME_LIMIT_MS,
  };
  startGameClock();
  nextTrial();
}

function startGameClock() {
  g.gameClockInterval = setInterval(() => {
    g.remainingMs -= 1000;
    updateTimeBadge();
    if (g.remainingMs <= 0) {
      clearInterval(g.gameClockInterval);
      clearTimeout(g.trialTimer);
      if (!g.ended) { Sounds.playTimeout(); finishGame3(); }
    }
  }, 1000);
}

function updateTimeBadge() {
  const el = document.getElementById("timeBadge");
  if (!el) return;
  const totalSec = Math.max(0, Math.ceil(g.remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  el.textContent = `${m}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("low", totalSec <= 30);
}

function nextTrial() {
  clearTimeout(g.trialTimer);
  if (g.ended) return;
  if (g.totalCorrect >= TARGET_TOTAL_CORRECT || g.trialIndex >= MAX_TRIALS) return finishGame3();
  // Sorteia a regra desta pergunta de forma totalmente independente da anterior (pode repetir).
  g.previousRule = g.rule;
  g.rule = RULES[Math.floor(Math.random() * RULES.length)];
  if (g.previousRule !== null && g.rule !== g.previousRule) g.ruleChanges++;
  g.trial = buildTrial(g.rule);
  g.trialStart = performance.now();
  renderScreen();
  g.trialTimer = setTimeout(() => answer(-1), TRIAL_TIMEOUT_MS);
}

function renderScreen() {
  const t = g.trial;
  app.innerHTML = `
  <div class="screen">
    ${dotsHtml(2)}
    <h2 style="font-family:'Fredoka',sans-serif;font-weight:700;font-size:clamp(20px,2.6vw,28px);">Descubra a Regra da Magia</h2>
    <p class="subtitle" style="margin-top:4px;">Observe a sequência mágica e escolha a carta que segue o mesmo padrão</p>
    <div class="rule-example">
      <div class="ref-card">${cardHtml(t.ref)}</div>
      <span class="seq-arrow" aria-hidden="true">›</span>
      <div class="ref-card example-card">${cardHtml(t.example)}</div>
    </div>
    <div class="opts-grid">
      ${t.opts.map((o, i) => `<div class="opt-card" id="opt-${i}" onclick="answer(${i})">${cardHtml(o.card)}</div>`).join("")}
    </div>
    <div class="hud"><span>Carta <b>${g.trialIndex + 1}</b> de <b>${MAX_TRIALS}</b> · Acertos <b>${g.totalCorrect}</b> de <b>${TARGET_TOTAL_CORRECT}</b></span></div>
    <div class="time-badge" id="timeBadge"></div>
  </div>
  ${attributionFooterHtml()}`;
  updateTimeBadge();
}

function answer(i) {
  clearTimeout(g.trialTimer);
  const t = g.trial;
  const rt = performance.now() - g.trialStart;
  const timedOut = i === -1;
  const chosen = timedOut ? { matchDim: null } : t.opts[i];
  const correct = !timedOut && chosen.matchDim === g.rule;

  if (timedOut) Sounds.playTimeout();
  else if (correct) Sounds.playCorrect();
  else Sounds.playWrong();

  const el = !timedOut ? document.getElementById("opt-" + i) : null;
  if (el) el.classList.add(correct ? "right-flash" : "wrong-flash");

  let perseverative = false;
  if (!correct && !timedOut && g.previousRule) perseverative = chosen.matchDim === g.previousRule;

  const ruleChangedFromPrevious = g.previousRule !== null && g.rule !== g.previousRule;

  g.trials.push({
    index: g.trialIndex, rule: g.rule, chosenDim: chosen.matchDim, correct,
    rt: Math.round(rt), ruleChanged: ruleChangedFromPrevious, perseverative,
  });

  if (correct) g.totalCorrect++;

  g.trialIndex++;
  setTimeout(() => {
    if (ruleChangedFromPrevious) Sounds.playPaletteChange();
    nextTrial();
  }, timedOut ? 500 : 380);
}

async function finishGame3() {
  if (g.ended) return;
  g.ended = true;
  clearInterval(g.gameClockInterval);
  clearTimeout(g.trialTimer);

  // Erros em perguntas cuja regra mudou em relação à pergunta anterior (nesta versão totalmente
  // aleatória, toda pergunta é uma possível "mudança de regra").
  const errorsAfterChange = g.trials.filter((t) => t.ruleChanged && !t.correct).length;
  const perseverativeErrors = g.trials.filter((t) => t.perseverative).length;

  // Tempo médio de resposta remapeado: acerto usa o tempo real; erro (mesmo se respondido rápido) usa um
  // valor fixo de penalidade (WRONG_RT_PENALTY_MS), para não premiar respostas erradas dadas às pressas.
  const remappedTimes = g.trials.map((t) => (t.correct ? t.rt : WRONG_RT_PENALTY_MS));
  const avgRT = remappedTimes.length ? Math.round(remappedTimes.reduce((a, b) => a + b, 0) / remappedTimes.length) : 0;

  const metrics = {
    total_cartas: g.trials.length,
    acertos: g.totalCorrect,
    trocas_de_regra: g.ruleChanges,
    erros_apos_mudanca_regra: errorsAfterChange,
    tempo_medio_resposta_ms: avgRT,
    indice_perseveracao: perseverativeErrors,
  };

  app.innerHTML = `<div class="screen">${dotsHtml(2)}<p class="subtitle">Salvando seu progresso...</p></div>`;
  try {
    await Api.saveGame3(session.id, metrics);
  } catch (e) {
    console.error("Erro ao salvar Jogo 3:", e);
  }
  window.location.href = tenantUrl(session.adminUsername, "finished");
}

(async function init() {
  trapBackButton();
  const ok = await FlowGuard.enforce("game3");
  if (ok) renderIntro();
})();
