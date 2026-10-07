/**
 * dev.js  Painel do desenvolvedor.
 * Login próprio (mesmos padrões de segurança do admin: senha com hash,
 * bloqueio por tentativas, sessão de 30 minutos) e CRUD completo dos
 * usuários administradores (professores)  inclui geração automática
 * do token de primeiro acesso no formato Trilha-XXX-XXX.
 */
const app = document.getElementById("app");
let devState = { admins: [] };
let devSessionCountdownInterval = null;

window.onAuthExpired = function () {
  clearInterval(devSessionCountdownInterval);
  renderGate("Sua sessão expirou após 30 minutos de inatividade. Faça login novamente.");
};

function renderGate(message) {
  clearInterval(devSessionCountdownInterval);
  app.innerHTML = `
  <div class="admin-wrap">
    <div class="login-gate">
      <h2 style="font-family:'Fredoka',sans-serif;">Painel do Desenvolvedor</h2>
      <p style="color:var(--a-dim); font-size:14px; margin-top:8px;">Área restrita  gerenciamento dos administradores (professores) do sistema.</p>
      <label for="devUser">Usuário</label>
      <input type="text" id="devUser" placeholder="Usuário" autocomplete="username">
      <label for="devPass">Senha</label>
      <input type="password" id="devPass" placeholder="Senha" autocomplete="current-password">
      <div class="error-text" id="loginError" style="min-height:18px;">${message ? escapeHtml(message) : ""}</div>
      <div><button class="a-btn primary" style="margin-top:10px; width:100%;" onclick="tryDevLogin()">Entrar</button></div>
    </div>
  </div>
  ${attributionFooterHtml()}`;
  const userInp = document.getElementById("devUser");
  userInp.focus();
  document.getElementById("devPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryDevLogin(); });
  userInp.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("devPass").focus(); });
}

async function tryDevLogin() {
  const user = document.getElementById("devUser").value.trim();
  const pass = document.getElementById("devPass").value;
  const err = document.getElementById("loginError");
  try {
    const data = await Api.devLogin(user, pass);
    DevSession.save(data);
    loadAdmins();
  } catch (e) {
    if (err) err.textContent = e.message || "Usuário ou senha incorretos.";
    document.getElementById("devPass").value = "";
  }
}

async function doDevLogout() {
  clearInterval(devSessionCountdownInterval);
  await Api.devLogout();
  DevSession.clear();
  renderGate();
}

/** Ao carregar a página: se já houver uma sessão salva, tenta retomá-la antes de mostrar o gate. */
async function initDev() {
  const saved = DevSession.get();
  if (saved && saved.sessionToken) {
    try {
      await Api.devMe();
      DevSession.touch();
      loadAdmins();
      return;
    } catch (e) {
      DevSession.clear();
    }
  }
  renderGate();
}

/* ---------------- CPF: máscara e validação (espelha o algoritmo do backend) ---------------- */

function formatCpf(digitsOnly) {
  const d = (digitsOnly || "").replace(/\D/g, "").slice(0, 11);
  let out = d;
  if (d.length > 9) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  else if (d.length > 6) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  else if (d.length > 3) out = `${d.slice(0, 3)}.${d.slice(3)}`;
  return out;
}
function isValidCpfClient(rawCpf) {
  const cpf = (rawCpf || "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number);
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return calc(9) === digits[9] && calc(10) === digits[10];
}

/* ---------------- E-mail e telefone: validação (espelha o backend) ---------------- */

function isValidEmailClient(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || "").trim());
}
function isValidPhoneClient(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}
function formatPhone(raw) {
  const d = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (d.length > 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 6) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d;
}

/* ---------------- Carregamento e listagem ---------------- */

async function loadAdmins() {
  app.innerHTML = `<div class="admin-wrap"><div class="empty-state">Carregando administradores...</div></div>`;
  try {
    devState.admins = await Api.devListAdmins();
  } catch (e) {
    app.innerHTML = `<div class="admin-wrap"><div class="empty-state">Não foi possível carregar os dados.</div></div>`;
    return;
  }
  render();
}

function render() {
  const admins = devState.admins;
  app.innerHTML = `
  <div class="admin-wrap">
    <div class="admin-header">
      <div>
        <div class="admin-title">Painel do Desenvolvedor</div>
        <div class="admin-sub">Gerenciamento de administradores (professores) · ${admins.length} cadastrado(s)</div>
      </div>
      <div class="admin-actions">
        <button class="a-btn primary" onclick="openAdminForm()">Novo administrador</button>
        <button class="a-btn" onclick="doDevLogout()">Sair</button>
      </div>
    </div>

    <div class="panel">
      <h3>Administradores cadastrados</h3>
      <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Nome</th><th>Usuário</th><th>CPF</th><th>E-mail</th><th>Telefone</th>
          <th>Token</th><th>1º acesso</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${admins.length ? admins.map((a) => `
            <tr>
              <td><b>${escapeHtml(a.name)}</b></td>
              <td>${escapeHtml(a.username)}</td>
              <td>${escapeHtml(formatCpf(a.cpf))}</td>
              <td>${escapeHtml(a.email)}</td>
              <td>${escapeHtml(a.phone)}</td>
              <td><code>${escapeHtml(a.token)}</code></td>
              <td><span class="badge ${a.firstLoginDone ? "acima" : "mediano"}">${a.firstLoginDone ? "Já usado" : "Pendente"}</span></td>
              <td>
                <button class="details-btn" onclick="openAdminForm('${a.id}')">Editar</button>
                <button class="details-btn" style="border-color:var(--a-alert); color:var(--a-alert); margin-left:6px;" onclick="confirmDeleteAdmin('${a.id}')">Excluir</button>
              </td>
            </tr>`).join("") : `<tr><td colspan="8" style="text-align:center; color:var(--a-dim); padding:30px 0;">Nenhum administrador cadastrado ainda.</td></tr>`}
        </tbody>
      </table>
      </div>
    </div>
  </div>
  <div id="modalRoot"></div>
  <div class="session-countdown" id="sessionCountdown"></div>
  ${attributionFooterHtml()}`;
  startDevSessionCountdown();
}

function startDevSessionCountdown() {
  clearInterval(devSessionCountdownInterval);
  const tick = () => {
    const el = document.getElementById("sessionCountdown");
    if (!el) { clearInterval(devSessionCountdownInterval); return; }
    const remaining = DevSession.remainingMs();
    if (remaining <= 0) { clearInterval(devSessionCountdownInterval); window.onAuthExpired(); return; }
    const totalSec = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    el.textContent = ` Sessão expira em ${m}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("low", totalSec <= 60);
  };
  tick();
  devSessionCountdownInterval = setInterval(tick, 1000);
}

/* ---------------- Formulário de criação/edição ---------------- */

function openAdminForm(id) {
  const editing = id ? devState.admins.find((a) => a.id === id) : null;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
  <div class="modal-overlay" onclick="if(event.target===this) closeAdminForm();">
    <div class="modal-panel" style="max-width:480px;">
      <button class="modal-close" onclick="closeAdminForm()">×</button>
      <div class="modal-title">${editing ? "Editar administrador" : "Novo administrador"}</div>
      <div class="modal-sub">${editing ? "Altere os dados abaixo." : "Um token de primeiro acesso (Trilha-XXX-XXX) será gerado automaticamente."}</div>

      <div class="form-grid">
        <label>Nome completo
          <input type="text" id="fName" value="${editing ? escapeHtml(editing.name) : ""}">
        </label>
        <label>Usuário ${editing ? '<span style="font-weight:400;color:var(--a-dim);">(não pode ser alterado)</span>' : ""}
          <input type="text" id="fUsername" value="${editing ? escapeHtml(editing.username) : ""}" ${editing ? "disabled" : ""}>
        </label>
        <label>${editing ? "Nova senha (deixe em branco para manter)" : "Senha"}
          <input type="password" id="fPassword" autocomplete="new-password">
        </label>
        <label>CPF
          <input type="text" id="fCpf" placeholder="000.000.000-00" value="${editing ? formatCpf(editing.cpf) : ""}">
        </label>
        <label>E-mail
          <input type="email" id="fEmail" value="${editing ? escapeHtml(editing.email) : ""}">
        </label>
        <label>Telefone
          <input type="text" id="fPhone" placeholder="(00) 00000-0000" value="${editing ? formatPhone(editing.phone) : ""}">
        </label>
      </div>
      <div class="error-text" id="formError" style="min-height:18px; margin-top:8px;"></div>
      <div style="text-align:right; margin-top:8px;">
        <button class="a-btn" onclick="closeAdminForm()">Cancelar</button>
        <button class="a-btn primary" onclick="submitAdminForm(${editing ? `'${editing.id}'` : "null"})">${editing ? "Salvar alterações" : "Criar administrador"}</button>
      </div>
    </div>
  </div>`;
  const cpfInput = document.getElementById("fCpf");
  cpfInput.addEventListener("input", () => { cpfInput.value = formatCpf(cpfInput.value); });
  const phoneInput = document.getElementById("fPhone");
  phoneInput.addEventListener("input", () => { phoneInput.value = formatPhone(phoneInput.value); });
}

function closeAdminForm() {
  const root = document.getElementById("modalRoot");
  if (root) root.innerHTML = "";
}

async function submitAdminForm(id) {
  const name = document.getElementById("fName").value.trim();
  const username = document.getElementById("fUsername").value.trim();
  const password = document.getElementById("fPassword").value;
  const cpf = document.getElementById("fCpf").value.trim();
  const email = document.getElementById("fEmail").value.trim();
  const phone = document.getElementById("fPhone").value.trim();
  const err = document.getElementById("formError");
  err.textContent = "";

  if (!name || !email || !phone || (!id && (!username || !password))) {
    err.textContent = "Preencha todos os campos obrigatórios.";
    return;
  }
  if (!isValidCpfClient(cpf)) {
    err.textContent = "CPF inválido  confira os números digitados.";
    return;
  }
  if (!isValidEmailClient(email)) {
    err.textContent = "E-mail inválido  confira o endereço digitado.";
    return;
  }
  if (!isValidPhoneClient(phone)) {
    err.textContent = "Telefone inválido  use DDD + número (10 ou 11 dígitos).";
    return;
  }
  if (!id && password.length < 6) {
    err.textContent = "A senha deve ter pelo menos 6 caracteres.";
    return;
  }

  try {
    if (id) {
      await Api.devUpdateAdmin(id, { name, cpf, email, phone, password: password || undefined });
    } else {
      const created = await Api.devCreateAdmin({ name, username, password, cpf, email, phone });
      closeAdminForm();
      await loadAdmins();
      showTokenReveal(created);
      return;
    }
    closeAdminForm();
    await loadAdmins();
  } catch (e) {
    err.textContent = e.message || "Não foi possível salvar.";
  }
}

function showTokenReveal(admin) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
  <div class="modal-overlay">
    <div class="modal-panel" style="max-width:440px; text-align:center;">
      <div class="modal-title">Administrador criado!</div>
      <p style="color:var(--a-dim); margin-top:8px;">Envie o token abaixo para <b>${escapeHtml(admin.name)}</b>  ele será pedido apenas no primeiro login.</p>
      <div class="token-reveal-row">
        <div class="token-reveal-box" id="newTokenBox">${escapeHtml(admin.token)}</div>
        <button class="a-btn primary" id="copyTokenBtn" onclick="copyToken('${escapeHtml(admin.token)}')">Copiar</button>
      </div>
      <button class="a-btn primary" onclick="closeAdminForm()">Entendi</button>
    </div>
  </div>`;
}

function copyToken(token) {
  const btn = document.getElementById("copyTokenBtn");
  const finish = (ok) => {
    if (!btn) return;
    btn.textContent = ok ? "Copiado!" : "Não copiou";
    setTimeout(() => { btn.textContent = "Copiar"; }, 1800);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(token).then(() => finish(true)).catch(() => fallbackCopyText(token, finish));
  } else {
    fallbackCopyText(token, finish);
  }
}

function fallbackCopyText(text, finish) {
  try {
    const tmp = document.createElement("textarea");
    tmp.value = text;
    tmp.style.position = "fixed";
    tmp.style.opacity = "0";
    document.body.appendChild(tmp);
    tmp.focus();
    tmp.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(tmp);
    finish(ok);
  } catch (e) {
    finish(false);
  }
}

function confirmDeleteAdmin(id) {
  const admin = devState.admins.find((a) => a.id === id);
  if (!admin) return;
  const others = devState.admins.filter((a) => a.id !== id);

  const root = document.getElementById("modalRoot");
  root.innerHTML = `
  <div class="modal-overlay" onclick="if(event.target===this) closeAdminForm();">
    <div class="modal-panel" style="max-width:460px;">
      <button class="modal-close" onclick="closeAdminForm()">×</button>
      <div class="modal-title">Excluir "${escapeHtml(admin.name)}"?</div>
      <p style="color:var(--a-dim); margin-top:8px; font-size:14px;">Esse administrador (usuário <b>${escapeHtml(admin.username)}</b>) pode ter alunos com sessões já registradas. O que você quer fazer com esses dados antes de excluir?</p>

      ${others.length ? `
        <label style="display:block; text-align:left; font-size:12.5px; font-weight:700; color:var(--a-dim); margin-top:18px;">Transferir sessões para</label>
        <select id="transferTarget" style="width:100%; margin-top:6px; padding:10px 12px; border-radius:10px; border:1px solid var(--a-line); font-size:14px; font-family:'Nunito',sans-serif;">
          ${others.map((a) => `<option value="${escapeHtml(a.username)}">${escapeHtml(a.name)} (${escapeHtml(a.username)})</option>`).join("")}
        </select>
        <button class="a-btn primary" style="width:100%; margin-top:12px;" onclick="doDeleteAdmin('${id}', true)">Transferir sessões e excluir</button>
        <div style="text-align:center; color:var(--a-dim); font-size:12px; margin:10px 0;">ou</div>
      ` : `<p style="color:var(--a-dim); font-size:13px; margin-top:14px;">Não existe outro administrador cadastrado para transferir as sessões.</p>`}

      <button class="a-btn danger" style="width:100%;" onclick="doDeleteAdmin('${id}', false)">Não transferir  excluir tudo (dados dos alunos incluídos)</button>
      <button class="a-btn" style="width:100%; margin-top:10px;" onclick="closeAdminForm()">Cancelar</button>
    </div>
  </div>`;
}

async function doDeleteAdmin(id, transfer) {
  const admin = devState.admins.find((a) => a.id === id);
  if (!admin) return;
  const payload = {};

  if (transfer) {
    const select = document.getElementById("transferTarget");
    if (!select || !select.value) return;
    payload.transferToUsername = select.value;
  } else {
    const ok = window.confirm(
      `ATENÇÃO: isso vai apagar "${admin.name}" E todas as sessões/jogos dos alunos dele, para sempre. ` +
      `Essa ação não pode ser desfeita. Tem certeza que quer continuar?`
    );
    if (!ok) return;
  }

  try {
    await Api.devDeleteAdmin(id, payload);
    closeAdminForm();
    await loadAdmins();
  } catch (e) {
    alert(e.message || "Não foi possível excluir o administrador.");
  }
}

/* ---------------- Init ---------------- */
initDev();
