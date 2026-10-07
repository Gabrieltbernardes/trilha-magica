/**
 * index.js  tela de login (nome da criança).
 * Exige que a URL identifique o professor (ex.: /professor.html) 
 * sem isso, mostra uma mensagem de link inválido em vez do formulário.
 */
SessionState.clear();
trapBackButton();

const adminUsername = getUsernameFromPath();
const app = document.getElementById("app");

function render() {
  if (!adminUsername) {
    app.innerHTML = `
    <div class="screen">
      <div class="eyebrow">Trilha Mágica</div>
      <h1 class="big-title">Link inválido</h1>
      <p class="subtitle">Esse endereço não identifica nenhuma turma. Peça o link certinho para o seu professor ou professora.</p>
    </div>
    ${attributionFooterHtml()}`;
    return;
  }

  app.innerHTML = `
  <div class="screen">
    <div class="eyebrow">Trilha Mágica</div>
    <h1 class="big-title">Bem-vindo(a) à jornada dos<br>desafios mágicos!</h1>
    <p class="subtitle">Antes de começar, conte pra gente o nome de quem vai jogar.</p>
    <div class="card">
      <input class="name-input" id="childName" placeholder="Digite o nome da criança" maxlength="60" autocomplete="off">
      <div class="error-text" id="errorText"></div>
      <div><button class="btn" id="startBtn" onclick="doLogin()">Entrar</button></div>
    </div>
  </div>
  ${attributionFooterHtml()}`;

  const input = document.getElementById("childName");
  input.focus();
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
}

async function doLogin() {
  const input = document.getElementById("childName");
  const name = input.value.trim();
  const errorText = document.getElementById("errorText");
  const btn = document.getElementById("startBtn");
  errorText.textContent = "";

  if (!name) {
    input.style.borderColor = "#D64545";
    errorText.textContent = "Digite um nome para continuar.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Entrando...";
  try {
    const session = await Api.createSession(name, adminUsername);
    SessionState.save({ id: session.id, childName: session.childName, adminUsername });
    window.location.href = tenantUrl(adminUsername, "game1");
  } catch (err) {
    errorText.textContent = err.message || "Não foi possível conectar ao servidor. Tente novamente.";
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
}

render();
