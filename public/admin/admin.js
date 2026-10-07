/**
 * admin.js  Painel do administrador.
 * Busca as sessões completas na API e os escores (0-100, calculados
 * pelo backend Java em ScoringService) e renderiza tabela, gráficos e
 * exportações. Cada administrador só enxerga os participantes que
 * pertencem à sua própria turma (isolamento por usuário).
 */
const app = document.getElementById("app");

let state = {
  sessions: [],
  selectedIds: new Set(),  // seleção atual (pendente) dos checkboxes
  appliedIds: new Set(),   // seleção usada no último cálculo da média da turma
  scored: [],
  chartsVisible: false,
};
let charts = {};
let sessionCountdownInterval = null;
let pendingLogin = null; // {username, password} guardado temporariamente entre a etapa 1 e a etapa 2 (token)

window.onAuthExpired = function () {
  clearInterval(sessionCountdownInterval);
  renderGate("Sua sessão expirou após 30 minutos de inatividade. Faça login novamente.");
};

function renderGate(message) {
  clearInterval(sessionCountdownInterval);
  pendingLogin = null;
  app.innerHTML = `
  <div class="admin-wrap">
    <div class="login-gate">
      <h2 style="font-family:'Fredoka',sans-serif;">Painel do Administrador</h2>
      <p style="color:var(--a-dim); font-size:14px; margin-top:8px;">Entre com seu usuário e senha para acessar os dados dos participantes.</p>
      <label for="adminUser">Usuário</label>
      <input type="text" id="adminUser" placeholder="Usuário" autocomplete="username">
      <label for="adminPass">Senha</label>
      <input type="password" id="adminPass" placeholder="Senha" autocomplete="current-password">
      <div class="error-text" id="loginError" style="min-height:18px;">${message ? escapeHtml(message) : ""}</div>
      <div><button class="a-btn primary" style="margin-top:10px; width:100%;" onclick="tryLoginStep1()">Entrar</button></div>
    </div>
  </div>
  ${attributionFooterHtml()}`;
  const userInp = document.getElementById("adminUser");
  userInp.focus();
  document.getElementById("adminPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLoginStep1(); });
  userInp.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("adminPass").focus(); });
}

/** Etapa 1: usuário + senha, sem nenhuma menção a token. */
async function tryLoginStep1() {
  const user = document.getElementById("adminUser").value.trim();
  const pass = document.getElementById("adminPass").value;
  const err = document.getElementById("loginError");
  try {
    const data = await Api.adminLogin(user, pass, "");
    if (data.needsToken) {
      pendingLogin = { username: user, password: pass };
      renderTokenStep();
      return;
    }
    AdminSession.save(data);
    loadDashboard();
  } catch (e) {
    if (err) err.textContent = e.message || "Usuário ou senha incorretos.";
    document.getElementById("adminPass").value = "";
  }
}

/** Etapa 2 (só aparece no primeiro login de cada administrador): tela separada, só com o token. */
function renderTokenStep() {
  app.innerHTML = `
  <div class="admin-wrap">
    <div class="login-gate">
      <h2 style="font-family:'Fredoka',sans-serif;">Primeiro acesso</h2>
      <p style="color:var(--a-dim); font-size:14px; margin-top:8px;">Essa é a primeira vez que você entra no painel. Digite o token de acesso enviado pelo desenvolvedor.</p>
      <label for="adminToken">Token</label>
      <input type="text" id="adminToken" placeholder="Trilha-XXX-XXX" autocomplete="one-time-code">
      <div class="error-text" id="loginError" style="min-height:18px;"></div>
      <div><button class="a-btn primary" style="margin-top:10px; width:100%;" onclick="tryLoginStep2()">Confirmar token</button></div>
      <div style="margin-top:14px;"><a class="back-link" href="#" onclick="renderGate(); return false;">← Voltar</a></div>
    </div>
  </div>
  ${attributionFooterHtml()}`;
  const tokenInp = document.getElementById("adminToken");
  tokenInp.focus();
  tokenInp.addEventListener("keydown", (e) => { if (e.key === "Enter") tryLoginStep2(); });
}

async function tryLoginStep2() {
  if (!pendingLogin) { renderGate(); return; }
  const token = document.getElementById("adminToken").value.trim();
  const err = document.getElementById("loginError");
  try {
    const data = await Api.adminLogin(pendingLogin.username, pendingLogin.password, token);
    AdminSession.save(data);
    pendingLogin = null;
    loadDashboard();
  } catch (e) {
    if (err) err.textContent = e.message || "Token inválido.";
  }
}

async function doLogout() {
  clearInterval(sessionCountdownInterval);
  await Api.adminLogout();
  AdminSession.clear();
  renderGate();
}

/** Ao carregar a página: se já houver uma sessão salva, tenta retomá-la (sem pedir login de novo) antes de mostrar o gate. */
async function init() {
  const saved = AdminSession.get();
  if (saved && saved.sessionToken) {
    try {
      await Api.adminMe();
      AdminSession.touch();
      loadDashboard();
      return;
    } catch (e) {
      AdminSession.clear();
    }
  }
  renderGate();
}

function labelClass(c) { return c === "acima" ? "Acima da Média" : c === "mediano" ? "Mediano" : "Abaixo da Média"; }
function classify(score) { return score < 35 ? "abaixo" : score <= 65 ? "mediano" : "acima"; }
function classifyMajority(c1, c2, c3) {
  const counts = { acima: 0, mediano: 0, abaixo: 0 };
  counts[c1]++; counts[c2]++; counts[c3]++;
  if (counts.acima >= 2) return "acima";
  if (counts.abaixo >= 2) return "abaixo";
  return "mediano";
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

async function loadDashboard() {
  app.innerHTML = `<div class="admin-wrap"><div class="empty-state">Carregando dados...</div></div>`;
  let sessions = [];
  try {
    sessions = await Api.getAllSessions();
  } catch (e) {
    app.innerHTML = `<div class="admin-wrap"><div class="empty-state">Não foi possível carregar os dados do servidor.</div></div>`;
    return;
  }

  state.sessions = sessions;
  state.selectedIds = new Set(sessions.map((s) => s.id));
  state.appliedIds = new Set(state.selectedIds);
  state.scored = await Api.getScores(state.appliedIds);
  state.chartsVisible = false;
  render();
}

function toggleCohort(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  render();
}

async function recalcAverages() {
  state.appliedIds = new Set(state.selectedIds);
  state.scored = await Api.getScores(state.appliedIds);
  render();
  if (state.chartsVisible) drawCharts(state.scored);
}

function toggleChartsVisible() {
  state.chartsVisible = !state.chartsVisible;
  render();
  if (state.chartsVisible) drawCharts(state.scored);
}

function gameLinkBannerHtml() {
  const username = (AdminSession.get() || {}).username || "";
  const link = `${window.location.origin}${tenantUrl(username, "login")}`;
  return `
  <div class="panel game-link-panel">
    <h3>Link do jogo para seus alunos</h3>
    <div class="game-link-row">
      <input type="text" class="game-link-input" id="gameLinkInput" value="${escapeHtml(link)}" readonly onclick="this.select()">
      <button class="a-btn primary" id="copyLinkBtn" onclick="copyGameLink()">Copiar link</button>
    </div>
    <p class="cohort-count">Envie esse link para as crianças jogarem  os resultados aparecem automaticamente na tabela abaixo.</p>
  </div>`;
}

function copyGameLink() {
  const input = document.getElementById("gameLinkInput");
  const btn = document.getElementById("copyLinkBtn");
  const finish = (ok) => {
    if (!btn) return;
    btn.textContent = ok ? "Copiado!" : "Não copiou";
    setTimeout(() => { btn.textContent = "Copiar link"; }, 1800);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(input.value).then(() => finish(true)).catch(() => fallbackCopy(input, finish));
  } else {
    fallbackCopy(input, finish);
  }
}

function fallbackCopy(input, finish) {
  try {
    input.select();
    input.setSelectionRange(0, 99999);
    const ok = document.execCommand("copy");
    finish(ok);
  } catch (e) {
    finish(false);
  }
}

function render() {
  const sessions = state.sessions;

  if (sessions.length === 0) {
    app.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-header">
        <div><div class="admin-title">Painel do Administrador</div><div class="admin-sub">Trilha Mágica  Avaliação de Funções Executivas · Bem-vindo(a) ${escapeHtml((AdminSession.get() || {}).username || "")}</div></div>
        <button class="a-btn" onclick="doLogout()">Sair</button>
      </div>
      ${gameLinkBannerHtml()}
      <div class="panel"><div class="empty-state">Nenhuma sessão registrada ainda.<br>Assim que uma criança concluir os três jogos, os dados aparecerão aqui.</div></div>
    </div>
    <div class="session-countdown" id="sessionCountdown"></div>
    ${attributionFooterHtml()}`;
    startSessionCountdown();
    return;
  }

  const scored = state.scored;
  const alertCount = scored.filter((s) => s.classFinal === "abaixo").length;
  const pendingChange = !setsEqual(state.selectedIds, state.appliedIds);

  const cohortScored = scored.filter((s) => state.appliedIds.has(s.id));
  const avgInib = mean(cohortScored.map((s) => s.Sinib));
  const avgMem = mean(cohortScored.map((s) => s.Smem));
  const avgFlex = mean(cohortScored.map((s) => s.Sflex));
  const avgFinal = classifyMajority(classify(avgInib), classify(avgMem), classify(avgFlex));

  app.innerHTML = `
  <div class="admin-wrap">
    <div class="admin-header">
      <div>
        <div class="admin-title">Painel do Administrador</div>
        <div class="admin-sub">Trilha Mágica  Avaliação de Funções Executivas · Bem-vindo(a) ${escapeHtml((AdminSession.get() || {}).username || "")}</div>
      </div>
      <div class="admin-actions">
        <button class="a-btn" onclick="exportCSV()">Exportar CSV</button>
        <button class="a-btn" onclick="exportPDF()">Exportar PDF</button>
        <button class="a-btn ${state.chartsVisible ? "active" : ""}" onclick="toggleChartsVisible()">${state.chartsVisible ? "Ocultar gráficos" : "Visualizar gráficos"}</button>
        <button class="a-btn" onclick="doLogout()">Sair</button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card"><div class="k">Participantes</div><div class="v">${sessions.length}</div></div>
      <div class="stat-card"><div class="k">Na média da turma</div><div class="v">${state.appliedIds.size} de ${sessions.length}</div></div>
      <div class="stat-card"><div class="k">Abaixo da média</div><div class="v" style="color:var(--a-alert)">${alertCount}</div></div>
      <div class="stat-card"><div class="k">Última sessão</div><div class="v" style="font-size:15px;">${new Date(sessions[0].finishedAt).toLocaleString("pt-BR")}</div></div>
    </div>

    <div class="panel">
      <h3>Dados detalhados por participante</h3>
      <p class="cohort-count">Marque quem deve contar na média da turma. Crianças desmarcadas continuam avaliadas individualmente, mas não entram no cálculo da média/desvio padrão usado para classificar todo mundo.</p>
      <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Na média</th><th>Criança</th><th>Data</th>
          <th>Controle Inibitório</th><th>Memória de Trabalho</th><th>Flexibilidade Cognitiva</th>
          <th>Classificação</th><th>Detalhes</th>
        </tr></thead>
        <tbody>
          ${scored.map((s) => `
            <tr class="${state.appliedIds.has(s.id) ? "" : "row-excluded"}">
              <td><input type="checkbox" class="cohort-checkbox" ${state.selectedIds.has(s.id) ? "checked" : ""} onchange="toggleCohort('${s.id}')"></td>
              <td><b>${escapeHtml(s.childName)}</b></td>
              <td>${new Date(s.finishedAt).toLocaleDateString("pt-BR")}</td>
              <td>${s.Sinib.toFixed(1)}% <span class="badge ${s.classInib}">${labelClass(s.classInib)}</span></td>
              <td>${s.Smem.toFixed(1)}% <span class="badge ${s.classMem}">${labelClass(s.classMem)}</span></td>
              <td>${s.Sflex.toFixed(1)}% <span class="badge ${s.classFlex}">${labelClass(s.classFlex)}</span></td>
              <td><span class="badge ${s.classFinal}">${labelClass(s.classFinal)}</span></td>
              <td><button class="details-btn" onclick="showDetails('${s.id}')">Ver detalhes</button></td>
            </tr>`).join("")}
        </tbody>
        <tfoot>
          <tr class="totals-row">
            <td></td>
            <td colspan="2">Média global da turma (${cohortScored.length} selecionado${cohortScored.length === 1 ? "" : "s"})</td>
            <td>${avgInib.toFixed(1)}% <span class="badge ${classify(avgInib)}">${labelClass(classify(avgInib))}</span></td>
            <td>${avgMem.toFixed(1)}% <span class="badge ${classify(avgMem)}">${labelClass(classify(avgMem))}</span></td>
            <td>${avgFlex.toFixed(1)}% <span class="badge ${classify(avgFlex)}">${labelClass(classify(avgFlex))}</span></td>
            <td><span class="badge ${avgFinal}">${labelClass(avgFinal)}</span></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      </div>
      ${pendingChange ? `
        <div class="recalc-bar">
          <span class="msg">A seleção mudou  recalcule para atualizar a média da turma e os escores.</span>
          <button class="a-btn primary" onclick="recalcAverages()">Recalcular médias</button>
        </div>` : ""}
    </div>

    ${gameLinkBannerHtml()}

    <div id="chartsSection" style="${state.chartsVisible ? "" : "display:none;"}">
      <div class="charts-row">
        <div class="panel"><h3>Distribuição de classificação</h3><canvas id="chartClassification" height="220"></canvas></div>
        <div class="panel"><h3>Controle Inibitório  variação entre participantes</h3><canvas id="chartInib" height="220"></canvas></div>
      </div>
      <div class="charts-row">
        <div class="panel"><h3>Memória de Trabalho  variação entre participantes</h3><canvas id="chartMem" height="220"></canvas></div>
        <div class="panel"><h3>Flexibilidade Cognitiva  variação entre participantes</h3><canvas id="chartFlex" height="220"></canvas></div>
      </div>
    </div>
  </div>
  <div id="modalRoot"></div>
  <div class="session-countdown" id="sessionCountdown"></div>
  ${attributionFooterHtml()}`;
  startSessionCountdown();
}

/** Contagem regressiva da sessão de login (30 minutos), fixa no rodapé da página. */
function startSessionCountdown() {
  clearInterval(sessionCountdownInterval);
  const tick = () => {
    const el = document.getElementById("sessionCountdown");
    if (!el) { clearInterval(sessionCountdownInterval); return; }
    const remaining = AdminSession.remainingMs();
    if (remaining <= 0) {
      clearInterval(sessionCountdownInterval);
      window.onAuthExpired();
      return;
    }
    const totalSec = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    el.textContent = ` Sessão expira em ${m}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("low", totalSec <= 60);
  };
  tick();
  sessionCountdownInterval = setInterval(tick, 1000);
}

function destroyCharts() { Object.values(charts).forEach((c) => c && c.destroy()); charts = {}; }

const CLASS_COLOR = { acima: "#2F9E63", mediano: "#D99A26", abaixo: "#D64545" };
const EXCLUDED_COLOR = "#C7C4BE";

function drawCharts(scored) {
  if (typeof Chart === "undefined") {
    const section = document.getElementById("chartsSection");
    if (section) section.innerHTML = `<div class="panel"><div class="empty-state">Não foi possível carregar a biblioteca de gráficos (verifique sua conexão com a internet)  a tabela acima continua disponível normalmente.</div></div>`;
    return;
  }
  destroyCharts();

  const counts = { acima: 0, mediano: 0, abaixo: 0 };
  scored.forEach((s) => counts[s.classFinal]++);
  const ctxC = document.getElementById("chartClassification");
  if (ctxC) {
    charts.classification = new Chart(ctxC, {
      type: "doughnut",
      data: { labels: ["Acima da Média", "Mediano", "Abaixo da Média"], datasets: [{ data: [counts.acima, counts.mediano, counts.abaixo], backgroundColor: ["#2F9E63", "#D99A26", "#D64545"] }] },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }

  // Controle Inibitório  gráfico de barras horizontais (o estilo original)
  const ctxInib = document.getElementById("chartInib");
  if (ctxInib) {
    charts.chartInib = new Chart(ctxInib, {
      type: "bar",
      data: {
        labels: scored.map((s) => s.childName),
        datasets: [{
          label: "Escore (z)",
          data: scored.map((s) => Number(s.Sinib.toFixed(1))),
          backgroundColor: scored.map((s) => (s.inCohort ? CLASS_COLOR[s.classInib] : EXCLUDED_COLOR)),
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: "#EFEDE7" } }, y: { grid: { display: false } } },
      },
    });
  }

  // Memória de Trabalho  gráfico de colunas (vertical)
  const ctxMem = document.getElementById("chartMem");
  if (ctxMem) {
    charts.chartMem = new Chart(ctxMem, {
      type: "bar",
      data: {
        labels: scored.map((s) => s.childName),
        datasets: [{
          label: "Escore (z)",
          data: scored.map((s) => Number(s.Smem.toFixed(1))),
          backgroundColor: scored.map((s) => (s.inCohort ? CLASS_COLOR[s.classMem] : EXCLUDED_COLOR)),
          borderRadius: 6,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { grid: { color: "#EFEDE7" } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 40, minRotation: scored.length > 6 ? 40 : 0 } } },
      },
    });
  }

  // Flexibilidade Cognitiva  gráfico de linha
  const ctxFlex = document.getElementById("chartFlex");
  if (ctxFlex) {
    charts.chartFlex = new Chart(ctxFlex, {
      type: "line",
      data: {
        labels: scored.map((s) => s.childName),
        datasets: [{
          label: "Escore (z)",
          data: scored.map((s) => Number(s.Sflex.toFixed(1))),
          borderColor: "#7C6FE0",
          backgroundColor: "rgba(124,111,224,.15)",
          pointBackgroundColor: scored.map((s) => (s.inCohort ? CLASS_COLOR[s.classFlex] : EXCLUDED_COLOR)),
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { grid: { color: "#EFEDE7" } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 40, minRotation: scored.length > 6 ? 40 : 0 } } },
      },
    });
  }
}

/* ---------------- Modal de detalhamento ---------------- */
function metricBox(label, value) {
  return `<div class="modal-metric"><div class="k">${label}</div><div class="v">${value}</div></div>`;
}

function ordinal(n) { return `${n}º`; }

function rankBox(label, rank, total) {
  const value = `${ordinal(rank)} de ${total}`;
  return `<div class="modal-metric rank-metric"><div class="k">${label}</div><div class="v">${value}</div></div>`;
}

function showDetails(id) {
  const session = state.sessions.find((s) => s.id === id);
  const scored = state.scored.find((s) => s.id === id);
  if (!session || !scored) return;
  const g1 = session.game1, g2 = session.game2, g3 = session.game3;

  const root = document.getElementById("modalRoot");
  root.innerHTML = `
  <div class="modal-overlay" onclick="if(event.target===this) closeDetails();">
    <div class="modal-panel">
      <button class="modal-close" onclick="closeDetails()">×</button>
      <div class="modal-title">${escapeHtml(session.childName)}</div>
      <div class="modal-sub">Sessão concluída em ${new Date(session.finishedAt).toLocaleString("pt-BR")} ${scored.inCohort ? "· incluída na média da turma" : "· não incluída na média da turma"}</div>

      <div class="modal-section">
        <h4>Classificação por função</h4>
        <div class="modal-grid">
          ${metricBox("Controle Inibitório", `${scored.Sinib.toFixed(1)}% · <span class="badge ${scored.classInib}">${labelClass(scored.classInib)}</span>`)}
          ${metricBox("Memória de Trabalho", `${scored.Smem.toFixed(1)}% · <span class="badge ${scored.classMem}">${labelClass(scored.classMem)}</span>`)}
          ${metricBox("Flexibilidade Cognitiva", `${scored.Sflex.toFixed(1)}% · <span class="badge ${scored.classFlex}">${labelClass(scored.classFlex)}</span>`)}
          ${metricBox("Classificação final", `<span class="badge ${scored.classFinal}">${labelClass(scored.classFinal)}</span>`)}
        </div>
      </div>

      <div class="modal-section">
        <h4>Posição na turma (${scored.totalParticipants} participante${scored.totalParticipants === 1 ? "" : "s"})</h4>
        <div class="modal-grid">
          ${rankBox("Controle Inibitório", scored.rankInib, scored.totalParticipants)}
          ${rankBox("Memória de Trabalho", scored.rankMem, scored.totalParticipants)}
          ${rankBox("Flexibilidade Cognitiva", scored.rankFlex, scored.totalParticipants)}
        </div>
      </div>

      <div class="modal-section">
        <h4>Jogo 1 · Cores Mágicas (controle inibitório)</h4>
        <div class="modal-grid">
          ${metricBox("Acertos", `${g1.acertos} / ${g1.total_trials}`)}
          ${metricBox("Erros de impulso", g1.erros_impulso)}
          ${metricBox("Omissões", g1.omissoes)}
          ${metricBox("Tempo de reação médio", `${g1.tempo_reacao_medio_ms} ms`)}
        </div>
      </div>

      <div class="modal-section">
        <h4>Jogo 2 · Caminho do Tesouro (memória de trabalho)</h4>
        <div class="modal-grid">
          ${metricBox("Rodadas jogadas", g2.rodadas_jogadas)}
          ${metricBox("Taxa de acerto", `${Math.round(g2.taxa_acerto * 100)}%`)}
          ${metricBox("Tempo de resposta médio", `${g2.tempo_resposta_medio_ms} ms`)}
          ${metricBox("Extensão máxima", `${g2.extensao_maxima_sequencia} blocos`)}
          ${metricBox("Erros por posição", g2.erros_por_posicao)}
          ${metricBox("Células acertadas", g2.celulas_acertadas)}
        </div>
      </div>

      <div class="modal-section">
        <h4>Jogo 3 · Regra da Magia (flexibilidade cognitiva)</h4>
        <div class="modal-grid">
          ${metricBox("Acertos", `${g3.acertos} / ${g3.total_cartas}`)}
          ${metricBox("Trocas de regra", g3.trocas_de_regra)}
          ${metricBox("Erros após mudança", g3.erros_apos_mudanca_regra)}
          ${metricBox("Tempo médio de resposta", `${g3.tempo_medio_resposta_ms} ms`)}
          ${metricBox("Índice de perseveração", g3.indice_perseveracao)}
        </div>
      </div>

      <div class="modal-section modal-danger-zone">
        <button class="a-btn danger" onclick="confirmDeleteParticipant('${session.id}')">Deletar participante</button>
      </div>
    </div>
  </div>`;
}

async function confirmDeleteParticipant(id) {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return;
  const ok = window.confirm(`Tem certeza que deseja deletar "${session.childName}"? Essa ação não pode ser desfeita  todos os dados dessa sessão (os três jogos) serão apagados permanentemente.`);
  if (!ok) return;
  try {
    await Api.deleteSession(id);
    closeDetails();
    await loadDashboard();
  } catch (e) {
    alert(e.message || "Não foi possível apagar o participante.");
  }
}

function closeDetails() {
  const root = document.getElementById("modalRoot");
  if (root) root.innerHTML = "";
}

/* ---------------- Exportação ---------------- */
function csvSafe(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const scored = state.scored;
  if (!scored.length) return;
  const headers = ["Crianca", "Data", "Incluido_Na_Media",
    "Erros_Impulso", "Omissoes", "TR_Stroop_ms",
    "Taxa_Acerto_Corsi", "TR_Corsi_ms", "Extensao_Max_Sequencia", "Erros_Posicao", "Celulas_Acertadas",
    "Erros_Apos_Mudanca", "TR_WCST_ms", "Indice_Perseveracao", "Acertos_WCST",
    "Escore_Inibitorio_Pct", "Posicao_Inibitorio", "Escore_Memoria_Pct", "Posicao_Memoria",
    "Escore_Flexibilidade_Pct", "Posicao_Flexibilidade", "Classificacao"];
  const lines = [headers.join(",")];
  scored.forEach((s) => {
    lines.push([
      csvSafe(s.childName), new Date(s.finishedAt).toLocaleString("pt-BR"), s.inCohort ? "Sim" : "Não",
      s.EI, s.OM, s.TR1,
      s.TA, s.TR2, s.SM, s.EP, s.CA,
      s.EM, s.TAd, s.P, s.AC3,
      s.Sinib.toFixed(1), `${s.rankInib}/${s.totalParticipants}`,
      s.Smem.toFixed(1), `${s.rankMem}/${s.totalParticipants}`,
      s.Sflex.toFixed(1), `${s.rankFlex}/${s.totalParticipants}`,
      labelClass(s.classFinal),
    ].join(","));
  });
  const cohortScored = scored.filter((s) => state.appliedIds.has(s.id));
  lines.push("");
  lines.push([
    "Média global da turma", "", "",
    "", "", "", "", "", "", "", "", "", "", "", "",
    mean(cohortScored.map((s) => s.Sinib)).toFixed(1), "",
    mean(cohortScored.map((s) => s.Smem)).toFixed(1), "",
    mean(cohortScored.map((s) => s.Sflex)).toFixed(1), "",
    "",
  ].join(","));
  downloadBlob("\uFEFF" + lines.join("\n"), "trilha-magica-relatorio.csv", "text/csv;charset=utf-8;");
}

function exportPDF() {
  const scored = state.scored;
  if (!scored.length) return;
  if (typeof window.jspdf === "undefined") {
    alert("Não foi possível carregar a biblioteca de PDF (verifique sua conexão com a internet) e tente novamente.");
    return;
  }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Trilha Mágica  Relatório de Funções Executivas", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} · ${scored.length} participante(s) · ${state.appliedIds.size} na média da turma`, 14, 22);

    const cohortScored = scored.filter((s) => state.appliedIds.has(s.id));
    const avgInib = mean(cohortScored.map((s) => s.Sinib));
    const avgMem = mean(cohortScored.map((s) => s.Smem));
    const avgFlex = mean(cohortScored.map((s) => s.Sflex));

    doc.autoTable({
      startY: 28,
      head: [["Criança", "Data", "Na média", "Ctrl. Inibitório", "Mem. Trabalho", "Flex. Cognitiva", "Classificação"]],
      body: scored.map((s) => [
        s.childName, new Date(s.finishedAt).toLocaleDateString("pt-BR"), s.inCohort ? "Sim" : "Não",
        s.Sinib.toFixed(1) + "%", s.Smem.toFixed(1) + "%", s.Sflex.toFixed(1) + "%", labelClass(s.classFinal),
      ]),
      foot: [["Média global da turma", "", "", avgInib.toFixed(1) + "%", avgMem.toFixed(1) + "%", avgFlex.toFixed(1) + "%", ""]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [91, 79, 224] },
      footStyles: { fillColor: [237, 235, 252], textColor: [27, 27, 31], fontStyle: "bold" },
    });
    doc.save("trilha-magica-relatorio.pdf");
  } catch (e) {
    console.error(e);
    alert("Não foi possível gerar o PDF agora. Tente novamente em instantes.");
  }
}

/* ---------------- Init ---------------- */
init();
