/**
 * api.js
 * Comunicação com o backend, estado da sessão do aluno, autenticação do
 * administrador/desenvolvedor, e as travas de fluxo linear (impedem
 * pular etapas ou voltar de tela pelo navegador).
 */
const SESSION_KEY = "trilhaMagica.session";
const ADMIN_SESSION_KEY = "trilhaMagica.adminSession";
const DEV_SESSION_KEY = "trilhaMagica.devSession";

/* ==================== Contexto de professor (URL por turma) ==================== */

const RESERVED_TOP_SEGMENTS = new Set(["game1", "game2", "game3", "finished", "admin", "dev", "css", "js", "api"]);
const RESERVED_ROOT_FILES = new Set(["index.html", "game1.html", "game2.html", "game3.html", "finished.html"]);

/** Lê o nome de usuário do professor embutido na URL atual (ex.: /game1/professor.html -> "professor"). */
function getUsernameFromPath() {
  const parts = window.location.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length === 2 && parts[1].endsWith(".html")) {
    if (["game1", "game2", "game3", "finished"].includes(parts[0])) {
      return decodeURIComponent(parts[1].replace(/\.html$/, ""));
    }
  }
  if (parts.length === 1 && parts[0].endsWith(".html")) {
    const name = parts[0].replace(/\.html$/, "");
    if (!RESERVED_ROOT_FILES.has(parts[0]) && !RESERVED_TOP_SEGMENTS.has(name)) {
      return decodeURIComponent(name);
    }
  }
  return null;
}

function tenantUrl(username, key) {
  const u = encodeURIComponent(username || "");
  if (key === "game1") return `/game1/${u}.html`;
  if (key === "game2") return `/game2/${u}.html`;
  if (key === "game3") return `/game3/${u}.html`;
  if (key === "finished") return `/finished/${u}.html`;
  return `/${u}.html`;
}

/* ==================== API  sessões de jogo ==================== */

const Api = {
  async createSession(childName, adminUsername) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childName, adminUsername }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Não foi possível iniciar a sessão");
    }
    return res.json();
  },
  async saveGame1(sessionId, metrics) {
    return fetch(`/api/sessions/${sessionId}/game1`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metrics),
    });
  },
  async saveGame2(sessionId, metrics) {
    return fetch(`/api/sessions/${sessionId}/game2`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metrics),
    });
  },
  async saveGame3(sessionId, metrics) {
    return fetch(`/api/sessions/${sessionId}/game3`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metrics),
    });
  },
  async getSession(sessionId) {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) throw new Error("Sessão não encontrada");
    return res.json();
  },

  /* ---------------- painel do administrador (autenticado) ---------------- */

  async adminLogin(username, password, token) {
    const res = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Não foi possível entrar.");
    return data;
  },
  async adminLogout() {
    try { await fetch("/api/admin/logout", { method: "POST", headers: AdminSession.authHeaders() }); } catch (e) { }
  },
  /** Confirma que o token salvo ainda é válido (usado ao recarregar a página) e renova a janela de 30min. */
  async adminMe() {
    const res = await fetch("/api/admin/me", { headers: AdminSession.authHeaders() });
    if (!res.ok) throw new Error("Sessão inválida");
    return res.json();
  },
  async getAllSessions() {
    const res = await fetch("/api/sessions", { headers: AdminSession.authHeaders() });
    if (res.status === 401) { AdminSession.expireAndRedirect(); throw new Error("Sessão expirada"); }
    if (!res.ok) throw new Error("Não foi possível carregar as sessões");
    AdminSession.touch();
    return res.json();
  },
  async getScores(includedIds) {
    const res = await fetch("/api/scores", {
      method: "POST", headers: { "Content-Type": "application/json", ...AdminSession.authHeaders() },
      body: JSON.stringify({ includedIds: includedIds ? Array.from(includedIds) : null }),
    });
    if (res.status === 401) { AdminSession.expireAndRedirect(); throw new Error("Sessão expirada"); }
    if (!res.ok) throw new Error("Não foi possível calcular os escores");
    AdminSession.touch();
    return res.json();
  },
  async deleteSession(id) {
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE", headers: AdminSession.authHeaders() });
    if (res.status === 401) { AdminSession.expireAndRedirect(); throw new Error("Sessão expirada"); }
    if (!res.ok) throw new Error("Não foi possível apagar o participante");
    AdminSession.touch();
    return res.json();
  },

  /* ---------------- painel do desenvolvedor (autenticado) ---------------- */

  async devLogin(username, password) {
    const res = await fetch("/api/dev/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Não foi possível entrar.");
    return data;
  },
  async devLogout() {
    try { await fetch("/api/dev/logout", { method: "POST", headers: DevSession.authHeaders() }); } catch (e) { }
  },
  /** Confirma que o token salvo ainda é válido (usado ao recarregar a página) e renova a janela de 30min. */
  async devMe() {
    const res = await fetch("/api/dev/me", { headers: DevSession.authHeaders() });
    if (!res.ok) throw new Error("Sessão inválida");
    return res.json();
  },
  async devListAdmins() {
    const res = await fetch("/api/dev/admins", { headers: DevSession.authHeaders() });
    if (res.status === 401) { DevSession.expireAndRedirect(); throw new Error("Sessão expirada"); }
    if (!res.ok) throw new Error("Não foi possível carregar os administradores");
    DevSession.touch();
    return res.json();
  },
  async devCreateAdmin(payload) {
    const res = await fetch("/api/dev/admins", {
      method: "POST", headers: { "Content-Type": "application/json", ...DevSession.authHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { DevSession.expireAndRedirect(); throw new Error("Sessão expirada"); }
    if (!res.ok) throw new Error(data.error || "Não foi possível criar o administrador");
    DevSession.touch();
    return data;
  },
  async devUpdateAdmin(id, payload) {
    const res = await fetch(`/api/dev/admins/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...DevSession.authHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { DevSession.expireAndRedirect(); throw new Error("Sessão expirada"); }
    if (!res.ok) throw new Error(data.error || "Não foi possível atualizar o administrador");
    DevSession.touch();
    return data;
  },
  async devDeleteAdmin(id, payload) {
    const res = await fetch(`/api/dev/admins/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json", ...DevSession.authHeaders() },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { DevSession.expireAndRedirect(); throw new Error("Sessão expirada"); }
    if (!res.ok) throw new Error(data.error || "Não foi possível apagar o administrador");
    DevSession.touch();
    return data;
  },
};

/* ==================== Estado da sessão do aluno ==================== */

const SessionState = {
  save(session) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); },
  get() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() { sessionStorage.removeItem(SESSION_KEY); },
  requireOrRedirect() {
    const s = this.get();
    if (!s || !s.id) {
      const username = getUsernameFromPath();
      window.location.replace(username ? tenantUrl(username, "login") : "/index.html");
      return null;
    }
    return s;
  },
};

/* ==================== Sessão de login  administrador / desenvolvedor ==================== */

function makeAuthSession(storageKey) {
  return {
    save(data) {
      const duration = data.sessionDurationMs || 30 * 60 * 1000;
      const toStore = { ...data, expiresAt: Date.now() + duration, _durationMs: duration };
      sessionStorage.setItem(storageKey, JSON.stringify(toStore));
    },
    get() {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    },
    clear() { sessionStorage.removeItem(storageKey); },
    authHeaders() {
      const s = this.get();
      return s && s.sessionToken ? { "X-Admin-Token": s.sessionToken } : {};
    },
    /** Renova a janela de inatividade local (chamado após qualquer chamada autenticada bem-sucedida, e ao recarregar a página). */
    touch() {
      const s = this.get();
      if (!s) return;
      s.expiresAt = Date.now() + (s._durationMs || 30 * 60 * 1000);
      sessionStorage.setItem(storageKey, JSON.stringify(s));
    },
    remainingMs() {
      const s = this.get();
      if (!s) return 0;
      return Math.max(0, s.expiresAt - Date.now());
    },
    expireAndRedirect() {
      this.clear();
      if (typeof window.onAuthExpired === "function") window.onAuthExpired();
    },
  };
}
const AdminSession = makeAuthSession(ADMIN_SESSION_KEY);
const DevSession = makeAuthSession(DEV_SESSION_KEY);

/* ==================== Fluxo linear  trava de navegação ==================== */

const FlowGuard = {
  expectedKey(fullSession) {
    if (!fullSession.game1) return "game1";
    if (!fullSession.game2) return "game2";
    if (!fullSession.game3) return "game3";
    return "finished";
  },
  /** Verifica se a página atual é realmente a etapa permitida da sessão; se não for, alerta e redireciona. */
  async enforce(currentKey) {
    const local = SessionState.get();
    if (!local || !local.id) {
      const username = getUsernameFromPath() || (local && local.adminUsername);
      window.location.replace(username ? tenantUrl(username, "login") : "/index.html");
      return false;
    }
    let full;
    try { full = await Api.getSession(local.id); }
    catch (e) { return true; } // falha de rede: não trava o app, deixa a página seguir
    const expected = this.expectedKey(full);
    if (expected !== currentKey) {
      showLinearAlert(tenantUrl(local.adminUsername, expected));
      return false;
    }
    return true;
  },
};

/** Impede navegar "para trás" pelo navegador  ao detectar popstate, mostra o aviso e mantém a página atual. */
function trapBackButton() {
  history.pushState(null, "", window.location.href);
  window.addEventListener("popstate", function () {
    history.pushState(null, "", window.location.href);
    showLinearAlert(null);
  });
}

/** Mostra um aviso em tela cheia (não é o alert() nativo do navegador) explicando que o fluxo é linear. */
function showLinearAlert(redirectTo) {
  if (document.getElementById("flowAlertOverlay")) return; // já está mostrando
  const overlay = document.createElement("div");
  overlay.id = "flowAlertOverlay";
  overlay.className = "flow-alert-overlay";
  overlay.innerHTML = `
    <div class="flow-alert-panel">
      <h2>Ops, não é possível!</h2>
      <p>Este jogo segue uma ordem linear  não dá para voltar ou pular etapas. Continue de onde você parou.</p>
      <button class="btn" id="flowAlertOk">Entendi</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("flowAlertOk").onclick = () => {
    overlay.remove();
    if (redirectTo) window.location.replace(redirectTo);
  };
}

/* ==================== Contagem regressiva da tela de apresentação ==================== */

/**
 * Inicia a contagem de 60s da tela de apresentação de cada jogo. Nos
 * últimos 10s toca um bipe a cada segundo; ao chegar a 0, chama
 * onExpire() automaticamente (mesmo sem o clique em "Estou pronto").
 * Retorna o intervalId, para ser cancelado se o jogador clicar antes.
 */
function attachIntroCountdown(onExpire, seconds) {
  seconds = seconds || 60;
  let remaining = seconds;
  const render = () => {
    const el = document.getElementById("introCountdown");
    if (el) {
      el.textContent = `Começando automaticamente em ${remaining}s`;
      el.classList.toggle("low", remaining <= 10);
    }
  };
  render();
  const timer = setInterval(() => {
    remaining--;
    render();
    if (remaining <= 10 && remaining > 0) Sounds.playCountdownTick();
    if (remaining <= 0) {
      clearInterval(timer);
      Sounds.playTimeout();
      onExpire();
    }
  }, 1000);
  return timer;
}

/* ==================== Utilidades de UI compartilhadas ==================== */

function dotsHtml(activeIdx) {
  let s = '<div class="progress-dots">';
  for (let i = 0; i < 3; i++) {
    let cls = "dot";
    if (i < activeIdx) cls += " done";
    else if (i === activeIdx) cls += " active";
    s += `<div class="${cls}"></div>`;
  }
  return s + "</div>";
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/** Rodapé de atribuição, incluído em todas as telas do sistema. */
function attributionFooterHtml() {
  return `<div class="attribution-footer">Desenvolvido por <strong>Gabriel Teixeira Bernardes</strong></div>`;
}
