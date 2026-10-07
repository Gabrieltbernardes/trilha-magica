/**
 * game1.js  Jogo 1 "Cores Mágicas" (paradigma Stroop / Go-No-Go)
 * Avalia controle inibitório: erros de impulso, omissões e tempo de
 * reação.
 *
 * A cada 5 acertos, a paleta de 4 cores (e as palavras correspondentes)
 * muda para um novo conjunto de espectros diferentes. A palavra exibida
 * nunca é igual à cor da tinta usada para escrevê-la (sempre
 * incongruente), forçando a criança a inibir a leitura automática.
 */
const session = SessionState.requireOrRedirect();

const COLOR_PALETTES = [
  [{ name: "VERMELHO", hex: "#E5484D" }, { name: "AZUL", hex: "#3B82F6" }, { name: "VERDE", hex: "#22C55E" }, { name: "AMARELO", hex: "#FACC15" }],
  [{ name: "LILÁS", hex: "#C084FC" }, { name: "PRETO", hex: "#1F2937" }, { name: "CINZA", hex: "#6B7280" }, { name: "VERDE-ESCURO", hex: "#166534" }],
  [{ name: "AZUL-MARINHO", hex: "#1E3A8A" }, { name: "LARANJA", hex: "#FB923C" }, { name: "MARROM", hex: "#92400E" }, { name: "VIOLETA", hex: "#7C3AED" }],
];
const CORRECT_TO_SWITCH_PALETTE = 5;
const TOTAL_TRIALS = 30;
const TIMEOUT_MS = 20000; // 20 segundos por rodada
const GAME_TIME_LIMIT_MS = 5 * 60 * 1000; // 5 minutos
const WRONG_RT_PENALTY_MS = 3500; // valor usado no cálculo da média quando a resposta é errada

const app = document.getElementById("app");
let g = null;
let introTimer = null;

function renderIntro() {
  app.innerHTML = `
  <div class="screen">
    ${dotsHtml(0)}
    <h1 class="big-title">Jogo 1 · Cores Mágicas</h1>
    <p class="subtitle">Vai aparecer uma palavra colorida. Clique na COR da tinta  não na palavra escrita! A cada 5 acertos, cores novas aparecem. Fique de olho!</p>
    <button class="btn" onclick="beginGame()">Iniciar Jogos </button>
    <div class="intro-countdown" id="introCountdown"></div>
  </div>
  ${attributionFooterHtml()}`;
  introTimer = attachIntroCountdown(() => beginGame(), 60);
}

/**
 * Sorteia um trial (palavra + cor da tinta). A combinação exata
 * palavra+cor não pode se repetir mais de 3 vezes na sessão  o
 * comboCounts registra quantas vezes cada par já saiu, e a função
 * sorteia de novo até achar uma combinação ainda disponível.
 */
function makeTrial(palette, comboCounts) {
  let trial, key, attempts = 0;
  do {
    const wordColor = palette[Math.floor(Math.random() * palette.length)];
    // A tinta nunca é igual à cor que a palavra nomeia (sempre incongruente).
    const others = palette.filter((c) => c.name !== wordColor.name);
    const ink = others[Math.floor(Math.random() * others.length)];
    key = wordColor.name + "|" + ink.name;
    trial = { word: wordColor.name, ink };
    attempts++;
  } while ((comboCounts.get(key) || 0) >= 2 && attempts < 200);
  comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
  return trial;
}

function beginGame() {
  clearInterval(introTimer);
  Sounds.playStart();
  g = {
    roundIndex: 0, correctCount: 0, paletteIndex: 0, currentPalette: COLOR_PALETTES[0],
    responses: [], trialStart: 0, timer: null, ended: false, gameClockInterval: null, remainingMs: GAME_TIME_LIMIT_MS,
    comboCounts: new Map(),
  };
  startGameClock();
  nextRound();
}

function startGameClock() {
  g.gameClockInterval = setInterval(() => {
    g.remainingMs -= 1000;
    updateTimeBadge();
    if (g.remainingMs <= 0) {
      clearInterval(g.gameClockInterval);
      clearTimeout(g.timer);
      if (!g.ended) { Sounds.playTimeout(); finishGame1(); }
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

function nextRound() {
  if (g.ended) return;
  if (g.roundIndex >= TOTAL_TRIALS) return finishGame1();
  const newPaletteIndex = Math.floor(g.correctCount / CORRECT_TO_SWITCH_PALETTE) % COLOR_PALETTES.length;
  if (newPaletteIndex !== g.paletteIndex || g.roundIndex === 0) {
    if (g.roundIndex !== 0) Sounds.playPaletteChange();
    g.paletteIndex = newPaletteIndex;
    g.currentPalette = COLOR_PALETTES[newPaletteIndex];
  }
  g.trial = makeTrial(g.currentPalette, g.comboCounts);
  renderTrial();
}

function renderTrial() {
  const t = g.trial;
  app.innerHTML = `
  <div class="screen">
    ${dotsHtml(0)}
    <h2 style="font-family:'Fredoka',sans-serif;font-weight:700;font-size:clamp(20px,2.6vw,28px);">Qual é a COR da tinta?</h2>
    <div class="stroop-word" style="color:${t.ink.hex}">${t.word}</div>
    <div class="color-grid">
      ${g.currentPalette.map((c) => `<button class="color-btn" onclick="answer('${c.name}')">${c.name}</button>`).join("")}
    </div>
    <div class="stroop-feedback" id="feedback"></div>
    <div class="hud"><span>Rodada <b>${g.roundIndex + 1}</b> de <b>${TOTAL_TRIALS}</b></span></div>
    <div class="time-badge" id="timeBadge"></div>
  </div>
  ${attributionFooterHtml()}`;
  updateTimeBadge();
  g.trialStart = performance.now();
  clearTimeout(g.timer);
  g.timer = setTimeout(() => answer(null), TIMEOUT_MS);
}

function answer(chosenColorName) {
  clearTimeout(g.timer);
  const t = g.trial;
  const rt = performance.now() - g.trialStart;
  const omission = chosenColorName === null;
  const correct = !omission && chosenColorName === t.ink.name;
  g.responses.push({ correct, omission, rt: omission ? null : Math.round(rt) });
  if (correct) g.correctCount++;

  if (omission) Sounds.playTimeout();
  else if (correct) Sounds.playCorrect();
  else Sounds.playWrong();

  const fb = document.getElementById("feedback");
  if (fb) {
    fb.style.color = omission ? "#B8860B" : correct ? "#0FB6A6" : "#E5484D";
    fb.textContent = omission ? "Tempo esgotado" : correct ? "Muito bem!" : "Quase!";
  }
  g.roundIndex++;
  setTimeout(nextRound, 380);
}

async function finishGame1() {
  if (g.ended) return;
  g.ended = true;
  clearInterval(g.gameClockInterval);
  clearTimeout(g.timer);

  const answered = g.responses.filter((r) => !r.omission);
  const correct = answered.filter((r) => r.correct);
  const wrong = answered.filter((r) => !r.correct);
  const omissoes = g.responses.filter((r) => r.omission).length;

  // Erro de impulso: só conta como impulsivo o erro respondido em tempo <= 80% da média bruta de resposta da sessão.
  const rawAvgRT = answered.length ? answered.reduce((a, r) => a + r.rt, 0) / answered.length : 0;
  const impulseThreshold = rawAvgRT * 0.8;
  const erros_impulso = wrong.filter((r) => r.rt <= impulseThreshold).length;

  // Tempo de reação médio remapeado: acerto usa o tempo real; erro ou omissão usa um valor fixo de
  // penalidade (WRONG_RT_PENALTY_MS), para não premiar respostas erradas dadas às pressas nem
  // distorcer a média com o tempo limite inteiro da rodada.
  const remappedTimes = g.responses.map((r) => (r.correct ? r.rt : WRONG_RT_PENALTY_MS));
  const avgRTRemapped = remappedTimes.length ? remappedTimes.reduce((a, b) => a + b, 0) / remappedTimes.length : TIMEOUT_MS;

  const metrics = {
    total_trials: g.responses.length,
    acertos: correct.length,
    erros_impulso,
    omissoes,
    tempo_reacao_medio_ms: Math.round(avgRTRemapped),
  };

  app.innerHTML = `<div class="screen">${dotsHtml(0)}<p class="subtitle">Salvando seu progresso...</p></div>`;
  try {
    await Api.saveGame1(session.id, metrics);
  } catch (e) {
    console.error("Erro ao salvar Jogo 1:", e);
  }
  window.location.href = tenantUrl(session.adminUsername, "game2");
}

(async function init() {
  trapBackButton();
  const ok = await FlowGuard.enforce("game1");
  if (ok) renderIntro();
})();
