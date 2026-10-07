/**
 * finished.js  tela final: busca o resumo da sessão salva no banco
 * e oferece o botão para voltar à página inicial.
 */
const session = SessionState.requireOrRedirect();
const app = document.getElementById("app");

function goHome() {
  const username = session.adminUsername;
  SessionState.clear();
  window.location.href = username ? tenantUrl(username, "login") : "/index.html";
}

async function render() {
  app.innerHTML = `<div class="screen"><p class="subtitle">Carregando seu resumo...</p></div>`;
  let s;
  try {
    s = await Api.getSession(session.id);
  } catch (e) {
    console.error(e);
  }
  const g1 = s && s.game1, g2 = s && s.game2, g3 = s && s.game3;

  app.innerHTML = `
  <div class="screen">
    <div class="eyebrow">Jornada concluída</div>
    <h1 class="big-title">Parabéns, ${escapeHtml(session.childName)}!</h1>
    <p class="subtitle">Você completou os três desafios mágicos. Aqui está um resuminho da sua jornada:</p>
    <div class="summary-grid">
      <div class="summary-box"><div class="lbl">Cores Mágicas</div><div class="val">${g1 ? (g1.acertos) + "/" + g1.total_trials : "-"}</div></div>
      <div class="summary-box"><div class="lbl">Caminho do Tesouro</div><div class="val">Nível ${g2 ? g2.extensao_maxima_sequencia : "-"}</div></div>
      <div class="summary-box"><div class="lbl">Regra da Magia</div><div class="val">${g3 ? g3.acertos + "/" + g3.total_cartas : "-"}</div></div>
    </div>
    <button class="btn" onclick="goHome()">Voltar para a página inicial</button>
  </div>
  ${attributionFooterHtml()}`;

  if (window.Sounds) {
    Sounds.playCorrect();
    setTimeout(() => Sounds.playCorrect(), 220);
  }
}

(async function init() {
  trapBackButton();
  const ok = await FlowGuard.enforce("finished");
  if (ok) render();
})();
