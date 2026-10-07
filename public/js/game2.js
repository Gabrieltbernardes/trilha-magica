/**
 * game2.js  Jogo 2 "Caminho do Tesouro" (paradigma Corsi Block-Tapping)
 * Avalia memória de trabalho: taxa de acerto, tempo de resposta,
 * extensão máxima da sequência e erros por posição.
 *
 * Estrutura em fases: cada fase (comprimento de sequência) dura pelo
 * menos 3 rodadas antes de avançar para o próximo comprimento. O jogador
 * tem 3 vidas (erros); ao perder todas, o jogo termina. Há também um
 * limite de tempo total para a sessão do jogo.
 */
const session = SessionState.requireOrRedirect();

const PHASE_START_LEN = 3;
const ROUNDS_PER_PHASE = 3;
const MAX_BLOCK_LEN_CAP = 9;
const MAX_LIVES = 3;
const LIT_MS = 650;
const GAP_MS = 280;
const RECALL_TIMEOUT_MS = 20000; // 20 segundos por rodada
const GAME_TIME_LIMIT_MS = 7 * 60 * 1000; // 7 minutos

const app = document.getElementById("app");
let g = null;
let introTimer = null;

function renderIntro() {
  app.innerHTML = `
  <div class="screen">
    ${dotsHtml(1)}
    <h1 class="big-title">Jogo 2 · Caminho do Tesouro</h1>
    <p class="subtitle">Alguns blocos vão brilhar em uma ordem. Observe com atenção e depois clique nos blocos na mesma ordem que eles brilharam. Você tem 3 vidas  cuidado com os erros!</p>
    <button class="btn" onclick="beginGame()">Estou pronto(a)!</button>
    <div class="intro-countdown" id="introCountdown"></div>
  </div>
  ${attributionFooterHtml()}`;
  introTimer = attachIntroCountdown(() => beginGame(), 60);
}

function beginGame() {
  clearInterval(introTimer);
  Sounds.playStart();
  g = {
    phaseLength: PHASE_START_LEN, phaseRoundCount: 0, lives: MAX_LIVES,
    sequence: [], round: 0, phase: "idle", playerIndex: 0,
    clicksLog: [], roundLog: [], clickStart: 0, recallTimer: null,
    ended: false, gameClockInterval: null, remainingMs: GAME_TIME_LIMIT_MS,
  };
  startGameClock();
  renderScreen();
  setTimeout(startRound, 500);
}

function startGameClock() {
  g.gameClockInterval = setInterval(() => {
    g.remainingMs -= 1000;
    updateTimeBadge();
    if (g.remainingMs <= 0) {
      clearInterval(g.gameClockInterval);
      if (!g.ended) {
        Sounds.playTimeout();
        finishGame2();
      }
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

function startRound() {
  if (g.ended) return;
  g.sequence = [];
  for (let i = 0; i < g.phaseLength; i++) g.sequence.push(Math.floor(Math.random() * 9));
  g.round++;
  g.phase = "showing";
  g.playerIndex = 0;
  renderScreen();
  playSequence(0);
}

function playSequence(i) {
  if (g.ended) return;
  if (i >= g.sequence.length) {
    g.phase = "recall";
    g.clickStart = performance.now();
    renderScreen();
    clearTimeout(g.recallTimer);
    const limit = RECALL_TIMEOUT_MS;
    g.recallTimer = setTimeout(onRecallTimeout, limit);
    return;
  }
  const blockIdx = g.sequence[i];
  const el = document.getElementById("block-" + blockIdx);
  if (el) el.classList.add("lit");
  Sounds.playNote(blockIdx);
  const status = document.getElementById("seqStatus");
  if (status) status.textContent = "Observe a sequência...";
  setTimeout(() => {
    if (el) el.classList.remove("lit");
    setTimeout(() => playSequence(i + 1), GAP_MS);
  }, LIT_MS);
}

function livesHtml() {
  let s = '<div class="lives-row">';
  for (let i = 0; i < MAX_LIVES; i++) {
    s += `<div class="life-dot ${i < g.lives ? "" : "lost"}"></div>`;
  }
  return s + "</div>";
}

function renderScreen() {
  app.innerHTML = `
  <div class="screen">
    ${dotsHtml(1)}
    <h2 style="font-family:'Fredoka',sans-serif;font-weight:700;font-size:clamp(20px,2.6vw,28px);">Caminho do Tesouro</h2>
    ${livesHtml()}
    <p class="phase-status">Fase ${g.phaseLength - PHASE_START_LEN + 1} · ${g.phaseLength} blocos · Rodada ${g.phaseRoundCount + 1} de ${ROUNDS_PER_PHASE}</p>
    <div class="grid3">
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<div class="block" id="block-${i}" onclick="handleClick(${i})"></div>`).join("")}
    </div>
    <div class="seq-status" id="seqStatus">${g.phase === "recall" ? "Sua vez! Clique na ordem certa " : "Prepare-se..."}</div>
    <div class="time-badge" id="timeBadge"></div>
  </div>
  ${attributionFooterHtml()}`;
  updateTimeBadge();
}

function advancePhaseIfNeeded() {
  g.phaseRoundCount++;
  if (g.phaseRoundCount >= ROUNDS_PER_PHASE) {
    g.phaseRoundCount = 0;
    g.phaseLength = Math.min(g.phaseLength + 1, MAX_BLOCK_LEN_CAP);
  }
}

function loseLife() {
  g.lives--;
  return g.lives <= 0;
}

function onRecallTimeout() {
  if (g.phase !== "recall" || g.ended) return;
  Sounds.playTimeout();
  g.roundLog.push({ round: g.round, length: g.sequence.length, success: false });
  g.phase = "idle";
  const outOfLives = loseLife();
  const status = document.getElementById("seqStatus");
  if (status) { status.textContent = "O tempo acabou!"; status.style.color = "#B8860B"; }
  advancePhaseIfNeeded();
  setTimeout(() => {
    if (outOfLives) finishGame2();
    else startRound();
  }, 900);
}

function handleClick(idx) {
  if (g.phase !== "recall" || g.ended) return;
  Sounds.playNote(idx);
  const rt = performance.now() - g.clickStart;
  const expected = g.sequence[g.playerIndex];
  const el = document.getElementById("block-" + idx);
  const correctClick = idx === expected;
  g.clicksLog.push({ round: g.round, position: g.playerIndex, expected, clicked: idx, correct: correctClick, rt: Math.round(rt) });
  if (el) {
    el.classList.add(correctClick ? "clicked-correct" : "clicked-wrong");
    setTimeout(() => el.classList.remove(correctClick ? "clicked-correct" : "clicked-wrong"), 350);
  }
  g.clickStart = performance.now();

  if (!correctClick) {
    clearTimeout(g.recallTimer);
    setTimeout(() => Sounds.playWrong(), 90);
    g.phase = "idle";
    g.roundLog.push({ round: g.round, length: g.sequence.length, success: false });
    const outOfLives = loseLife();
    const status = document.getElementById("seqStatus");
    if (status) { status.textContent = "Ops, não foi dessa vez!"; status.style.color = "#E5484D"; }
    advancePhaseIfNeeded();
    setTimeout(() => {
      if (outOfLives) finishGame2();
      else startRound();
    }, 900);
    return;
  }

  g.playerIndex++;
  if (g.playerIndex >= g.sequence.length) {
    clearTimeout(g.recallTimer);
    setTimeout(() => Sounds.playCorrect(), 90);
    g.phase = "idle";
    g.roundLog.push({ round: g.round, length: g.sequence.length, success: true });
    const status = document.getElementById("seqStatus");
    if (status) { status.textContent = "Muito bem!"; status.style.color = "#0FB6A6"; }
    advancePhaseIfNeeded();
    setTimeout(() => {
      if (!g.ended) startRound();
    }, 800);
  }
}

async function finishGame2() {
  if (g.ended) return;
  g.ended = true;
  clearInterval(g.gameClockInterval);
  clearTimeout(g.recallTimer);

  const successRounds = g.roundLog.filter((r) => r.success);
  const maxSeq = successRounds.length ? Math.max(...successRounds.map((r) => r.length)) : 0;
  const positionErrors = g.clicksLog.filter((c) => !c.correct).length;
  const accuracyRate = g.roundLog.length ? successRounds.length / g.roundLog.length : 0;

  // Número de células acertadas: soma de todos os cliques corretos, mesmo em rodadas que terminaram em erro.
  const celulasAcertadas = g.clicksLog.filter((c) => c.correct).length;

  // Tempo de resposta médio: só conta o tempo real do clique quando ele é correto; um clique errado
  // recebe o maior tempo já registrado até então no jogo (pior valor observado, não o tempo real do erro).
  let runningMax = null;
  const times = [];
  for (const c of g.clicksLog) {
    if (c.correct) {
      times.push(c.rt);
      runningMax = runningMax === null ? c.rt : Math.max(runningMax, c.rt);
    } else {
      times.push(runningMax !== null ? runningMax : RECALL_TIMEOUT_MS);
    }
  }
  const avgRT = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  const metrics = {
    rodadas_jogadas: g.roundLog.length,
    taxa_acerto: Number(accuracyRate.toFixed(2)),
    tempo_resposta_medio_ms: avgRT,
    extensao_maxima_sequencia: maxSeq,
    erros_por_posicao: positionErrors,
    celulas_acertadas: celulasAcertadas,
  };

  app.innerHTML = `<div class="screen">${dotsHtml(1)}<p class="subtitle">Salvando seu progresso...</p></div>`;
  try {
    await Api.saveGame2(session.id, metrics);
  } catch (e) {
    console.error("Erro ao salvar Jogo 2:", e);
  }
  window.location.href = tenantUrl(session.adminUsername, "game3");
}

(async function init() {
  trapBackButton();
  const ok = await FlowGuard.enforce("game2");
  if (ok) renderIntro();
})();
