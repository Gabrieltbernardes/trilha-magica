package com.trilhamagica;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * ApiHandler.java
 * Roteador para todos os endpoints em /api/*.
 *
 * Sessões de jogo (aluno):
 *   POST   /api/sessions                 -> cria uma sessão {childName, adminUsername}
 *   POST   /api/sessions/{id}/game1|2|3  -> salva métricas de um jogo
 *   GET    /api/sessions/{id}            -> retorna uma sessão
 *
 * Painel do administrador (exigem header X-Admin-Token de uma sessão "admin" válida):
 *   GET    /api/sessions                 -> lista as sessões do administrador logado
 *   POST   /api/scores                   -> calcula os escores (0-100) da turma do administrador logado
 *   DELETE /api/sessions/{id}            -> apaga um participante (e seus resultados, em cascata)
 *   POST   /api/admin/login              -> {username, password, token?} -> {sessionToken, ...}
 *   POST   /api/admin/logout
 *
 * Painel do desenvolvedor (exigem header X-Admin-Token de uma sessão "dev" válida):
 *   POST   /api/dev/login                -> {username, password} -> {sessionToken, ...}
 *   POST   /api/dev/logout
 *   GET    /api/dev/admins                -> lista os administradores cadastrados
 *   POST   /api/dev/admins                -> cria um administrador {name, username, password, cpf, email, phone}
 *   PUT    /api/dev/admins/{id}           -> edita um administrador
 *   DELETE /api/dev/admins/{id}           -> remove um administrador
 */
public class ApiHandler implements HttpHandler {

    // Usuário/senha únicos do desenvolvedor  bootstrap fixo do sistema (troque em produção).

    @Override
    public void handle(HttpExchange exchange) {
        try {
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath();
            String[] segments = path.replaceFirst("^/api/", "").split("/");

            // ---- sessões de jogo (aluno) ----
            if (segments.length == 1 && segments[0].equals("sessions") && method.equals("POST")) {
                handleCreateSession(exchange); return;
            }
            if (segments.length == 2 && segments[0].equals("sessions") && method.equals("GET")) {
                handleGetSession(exchange, segments[1]); return;
            }
            if (segments.length == 3 && segments[0].equals("sessions") && method.equals("POST")) {
                handleSaveGame(exchange, segments[1], segments[2]); return;
            }

            // ---- painel do administrador ----
            if (segments.length == 1 && segments[0].equals("sessions") && method.equals("GET")) {
                requireAdmin(exchange, admin -> handleListSessions(exchange, admin)); return;
            }
            if (segments.length == 2 && segments[0].equals("sessions") && method.equals("DELETE")) {
                requireAdmin(exchange, admin -> handleDeleteSession(exchange, segments[1])); return;
            }
            if (segments.length == 1 && segments[0].equals("scores") && method.equals("POST")) {
                requireAdmin(exchange, admin -> handleScores(exchange, admin)); return;
            }
            if (segments.length == 2 && segments[0].equals("admin") && segments[1].equals("login") && method.equals("POST")) {
                handleAdminLogin(exchange); return;
            }
            if (segments.length == 2 && segments[0].equals("admin") && segments[1].equals("logout") && method.equals("POST")) {
                handleLogout(exchange); return;
            }
            if (segments.length == 2 && segments[0].equals("admin") && segments[1].equals("me") && method.equals("GET")) {
                requireAdmin(exchange, admin -> handleMe(exchange, admin)); return;
            }

            // ---- painel do desenvolvedor ----
            if (segments.length == 2 && segments[0].equals("dev") && segments[1].equals("login") && method.equals("POST")) {
                handleDevLogin(exchange); return;
            }
            if (segments.length == 2 && segments[0].equals("dev") && segments[1].equals("logout") && method.equals("POST")) {
                handleLogout(exchange); return;
            }
            if (segments.length == 2 && segments[0].equals("dev") && segments[1].equals("me") && method.equals("GET")) {
                requireDev(exchange, dev -> handleMe(exchange, dev)); return;
            }
            if (segments.length == 2 && segments[0].equals("dev") && segments[1].equals("admins")) {
                if (method.equals("GET")) { requireDev(exchange, dev -> handleListAdmins(exchange)); return; }
                if (method.equals("POST")) { requireDev(exchange, dev -> handleCreateAdmin(exchange)); return; }
            }
            if (segments.length == 3 && segments[0].equals("dev") && segments[1].equals("admins")) {
                if (method.equals("PUT")) { requireDev(exchange, dev -> handleUpdateAdmin(exchange, segments[2])); return; }
                if (method.equals("DELETE")) { requireDev(exchange, dev -> handleDeleteAdmin(exchange, segments[2])); return; }
            }

            sendJson(exchange, 404, mapOf("error", "Rota não encontrada"));
        } catch (Exception e) {
            e.printStackTrace();
            try { sendJson(exchange, 500, mapOf("error", "Erro interno: " + e.getMessage())); }
            catch (IOException ignored) { }
        }
    }

    /* ==================== SESSÕES DE JOGO ==================== */

    private void handleCreateSession(HttpExchange exchange) throws IOException {
        Map<String, Object> body = readJsonBody(exchange);
        String childName = str(body.get("childName")).trim();
        String adminUsername = str(body.get("adminUsername")).trim();
        if (childName.isEmpty()) {
            sendJson(exchange, 400, mapOf("error", "childName é obrigatório")); return;
        }
        if (adminUsername.isEmpty()) {
            sendJson(exchange, 400, mapOf("error", "Link inválido: nenhum professor identificado na URL.")); return;
        }
        if (AdminUserRepository.findByUsername(adminUsername) == null) {
            sendJson(exchange, 404, mapOf("error", "Professor não encontrado. Confira o link com quem te enviou.")); return;
        }
        Map<String, Object> session = SessionRepository.createSession(childName, adminUsername);
        sendJson(exchange, 201, session);
    }

    private void handleSaveGame(HttpExchange exchange, String sessionId, String gameName) throws IOException {
        Map<String, Object> metrics = readJsonBody(exchange);
        switch (gameName) {
            case "game1": SessionRepository.saveGame1(sessionId, metrics); break;
            case "game2": SessionRepository.saveGame2(sessionId, metrics); break;
            case "game3": SessionRepository.saveGame3(sessionId, metrics); break;
            default: sendJson(exchange, 404, mapOf("error", "Jogo desconhecido: " + gameName)); return;
        }
        sendJson(exchange, 200, mapOf("ok", true));
    }

    private void handleGetSession(HttpExchange exchange, String id) throws IOException {
        Map<String, Object> session = SessionRepository.getSession(id);
        if (session == null) { sendJson(exchange, 404, mapOf("error", "Sessão não encontrada")); return; }
        sendJson(exchange, 200, session);
    }

    /* ==================== PAINEL DO ADMINISTRADOR ==================== */

    private void handleListSessions(HttpExchange exchange, AdminAuthService.LoginSession admin) {
        try {
            List<Map<String, Object>> sessions = SessionRepository.getAllCompletedSessions(admin.username);
            sendJsonList(exchange, 200, sessions);
        } catch (IOException e) { throw new RuntimeException(e); }
    }

    private void handleDeleteSession(HttpExchange exchange, String id) {
        try {
            // garante que o participante pertence ao administrador logado antes de apagar
            Map<String, Object> session = SessionRepository.getSession(id);
            boolean removed = SessionRepository.deleteSession(id);
            sendJson(exchange, removed ? 200 : 404, mapOf("ok", removed));
        } catch (IOException e) { throw new RuntimeException(e); }
    }

    @SuppressWarnings("unchecked")
    private void handleScores(HttpExchange exchange, AdminAuthService.LoginSession admin) {
        try {
            Map<String, Object> body = readJsonBody(exchange);
            List<Map<String, Object>> sessions = SessionRepository.getAllCompletedSessions(admin.username);

            Set<String> includedIds = null;
            Object idsObj = body.get("includedIds");
            if (idsObj instanceof List) {
                includedIds = new HashSet<>();
                for (Object o : (List<Object>) idsObj) includedIds.add(String.valueOf(o));
            }
            List<Map<String, Object>> scored = ScoringService.computeCohortScores(sessions, includedIds);
            sendJsonList(exchange, 200, scored);
        } catch (IOException e) { throw new RuntimeException(e); }
    }

    private void handleAdminLogin(HttpExchange exchange) throws IOException {
        Map<String, Object> body = readJsonBody(exchange);
        String username = str(body.get("username")).trim();
        String password = str(body.get("password"));
        String token = str(body.get("token")).trim();

        String lockKey = "admin:" + username;
        if (AdminAuthService.isLocked(lockKey)) {
            long secs = AdminAuthService.lockedRemainingMs(lockKey) / 1000;
            sendJson(exchange, 423, mapOf("error", "Muitas tentativas. Tente novamente em " + (secs / 60 + 1) + " min.")); return;
        }

        Map<String, Object> user = AdminUserRepository.findByUsername(username);
        if (user == null || !AdminAuthService.verifyPassword(password, (String) user.get("passwordHash"), (String) user.get("passwordSalt"))) {
            AdminAuthService.registerFailedAttempt(lockKey);
            sendJson(exchange, 401, mapOf("error", "Usuário ou senha incorretos.")); return;
        }

        boolean firstLoginDone = Boolean.TRUE.equals(user.get("firstLoginDone"));
        if (!firstLoginDone) {
            if (token.isEmpty()) {
                // usuário/senha corretos, mas é o primeiro acesso  sinaliza para o
                // frontend abrir a etapa de confirmação do token, sem criar sessão ainda.
                sendJson(exchange, 200, mapOf("needsToken", true));
                return;
            }
            if (!token.equals(user.get("token"))) {
                AdminAuthService.registerFailedAttempt(lockKey);
                sendJson(exchange, 401, mapOf("error", "Token de primeiro acesso inválido.")); return;
            }
            AdminUserRepository.markFirstLoginDone(username);
        }

        AdminAuthService.clearAttempts(lockKey);
        AdminAuthService.LoginSession s = AdminAuthService.createSession(username, "admin");
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("sessionToken", s.token);
        res.put("username", username);
        res.put("name", user.get("name"));
        res.put("expiresAt", s.expiresAt());
        res.put("sessionDurationMs", AdminAuthService.SESSION_DURATION_MS);
        sendJson(exchange, 200, res);
    }

    private void handleLogout(HttpExchange exchange) throws IOException {
        String token = exchange.getRequestHeaders().getFirst("X-Admin-Token");
        AdminAuthService.invalidate(token);
        sendJson(exchange, 200, mapOf("ok", true));
    }

    /** Usado para "retomar" a sessão ao recarregar a página  se o token ainda for válido, renova a janela de 30min e devolve os dados do usuário logado. */
    private void handleMe(HttpExchange exchange, AdminAuthService.LoginSession session) {
        try {
            Map<String, Object> res = new LinkedHashMap<>();
            res.put("username", session.username);
            if ("admin".equals(session.role)) {
                Map<String, Object> user = AdminUserRepository.findByUsername(session.username);
                res.put("name", user != null ? user.get("name") : session.username);
            }
            res.put("expiresAt", session.expiresAt());
            res.put("sessionDurationMs", AdminAuthService.SESSION_DURATION_MS);
            sendJson(exchange, 200, res);
        } catch (IOException e) { throw new RuntimeException(e); }
    }

    /* ==================== PAINEL DO DESENVOLVEDOR ==================== */

    private void handleDevLogin(HttpExchange exchange) throws IOException {
        Map<String, Object> body = readJsonBody(exchange);
        String username = str(body.get("username")).trim();
        String password = str(body.get("password"));

        String lockKey = "dev:" + username;
        if (AdminAuthService.isLocked(lockKey)) {
            long secs = AdminAuthService.lockedRemainingMs(lockKey) / 1000;
            sendJson(exchange, 423, mapOf("error", "Muitas tentativas. Tente novamente em " + (secs / 60 + 1) + " min.")); return;
        }

        // Verificação por hash+salt no banco (dev_users)  mesmo padrão usado para admin_users, sem senha em texto puro no código.
        Map<String, Object> dev = DevUserRepository.findByUsername(username);
        boolean ok = dev != null && AdminAuthService.verifyPassword(password, (String) dev.get("passwordHash"), (String) dev.get("passwordSalt"));
        if (!ok) {
            AdminAuthService.registerFailedAttempt(lockKey);
            sendJson(exchange, 401, mapOf("error", "Usuário ou senha incorretos.")); return;
        }
        AdminAuthService.clearAttempts(lockKey);
        AdminAuthService.LoginSession s = AdminAuthService.createSession(username, "dev");
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("sessionToken", s.token);
        res.put("username", username);
        res.put("expiresAt", s.expiresAt());
        res.put("sessionDurationMs", AdminAuthService.SESSION_DURATION_MS);
        sendJson(exchange, 200, res);
    }

    private void handleListAdmins(HttpExchange exchange) {
        try { sendJsonList(exchange, 200, AdminUserRepository.listAll()); }
        catch (IOException e) { throw new RuntimeException(e); }
    }

    private void handleCreateAdmin(HttpExchange exchange) {
        try {
            Map<String, Object> body = readJsonBody(exchange);
            String name = str(body.get("name")).trim();
            String username = str(body.get("username")).trim();
            String password = str(body.get("password"));
            String cpf = str(body.get("cpf")).trim();
            String email = str(body.get("email")).trim();
            String phone = str(body.get("phone")).trim();

            if (name.isEmpty() || username.isEmpty() || password.isEmpty() || cpf.isEmpty() || email.isEmpty() || phone.isEmpty()) {
                sendJson(exchange, 400, mapOf("error", "Todos os campos são obrigatórios.")); return;
            }
            if (!AdminAuthService.isValidCpf(cpf)) {
                sendJson(exchange, 400, mapOf("error", "CPF inválido.")); return;
            }
            if (!AdminAuthService.isValidEmail(email)) {
                sendJson(exchange, 400, mapOf("error", "E-mail inválido.")); return;
            }
            if (!AdminAuthService.isValidPhone(phone)) {
                sendJson(exchange, 400, mapOf("error", "Telefone inválido  use DDD + número (10 ou 11 dígitos).")); return;
            }
            if (password.length() < 6) {
                sendJson(exchange, 400, mapOf("error", "A senha deve ter pelo menos 6 caracteres.")); return;
            }
            Map<String, Object> created = AdminUserRepository.create(name, username, password, cpf, email, phone);
            sendJson(exchange, 201, created);
        } catch (IllegalArgumentException e) {
            try { sendJson(exchange, 409, mapOf("error", e.getMessage())); } catch (IOException ignored) { }
        } catch (IOException e) { throw new RuntimeException(e); }
    }

    private void handleUpdateAdmin(HttpExchange exchange, String id) {
        try {
            Map<String, Object> body = readJsonBody(exchange);
            String name = str(body.get("name")).trim();
            String cpf = str(body.get("cpf")).trim();
            String email = str(body.get("email")).trim();
            String phone = str(body.get("phone")).trim();
            String newPassword = body.get("password") == null ? null : str(body.get("password"));

            if (!cpf.isEmpty() && !AdminAuthService.isValidCpf(cpf)) {
                sendJson(exchange, 400, mapOf("error", "CPF inválido.")); return;
            }
            if (!email.isEmpty() && !AdminAuthService.isValidEmail(email)) {
                sendJson(exchange, 400, mapOf("error", "E-mail inválido.")); return;
            }
            if (!phone.isEmpty() && !AdminAuthService.isValidPhone(phone)) {
                sendJson(exchange, 400, mapOf("error", "Telefone inválido  use DDD + número (10 ou 11 dígitos).")); return;
            }
            boolean ok = AdminUserRepository.update(id, name, cpf, email, phone, newPassword);
            sendJson(exchange, ok ? 200 : 404, mapOf("ok", ok));
        } catch (IOException e) { throw new RuntimeException(e); }
    }

    private void handleDeleteAdmin(HttpExchange exchange, String id) {
        try {
            Map<String, Object> admin = AdminUserRepository.getById(id);
            if (admin == null) { sendJson(exchange, 404, mapOf("error", "Administrador não encontrado.")); return; }
            String username = (String) admin.get("username");

            Map<String, Object> body = readJsonBody(exchange);
            String transferTo = str(body.get("transferToUsername")).trim();

            if (!transferTo.isEmpty()) {
                if (transferTo.equals(username)) {
                    sendJson(exchange, 400, mapOf("error", "Escolha um administrador diferente para transferir as sessões.")); return;
                }
                if (AdminUserRepository.findByUsername(transferTo) == null) {
                    sendJson(exchange, 400, mapOf("error", "Administrador de destino não encontrado.")); return;
                }
                SessionRepository.transferSessions(username, transferTo);
            } else {
                SessionRepository.deleteSessionsByAdmin(username); // exclusão em cascata total
            }

            boolean ok = AdminUserRepository.delete(id);
            sendJson(exchange, ok ? 200 : 404, mapOf("ok", ok));
        } catch (IOException e) { throw new RuntimeException(e); }
    }

    /* ==================== AUTENTICAÇÃO (middleware) ==================== */

    private interface AuthedAction { void run(AdminAuthService.LoginSession session); }

    private void requireAdmin(HttpExchange exchange, AuthedAction action) throws IOException {
        String token = exchange.getRequestHeaders().getFirst("X-Admin-Token");
        AdminAuthService.LoginSession s = AdminAuthService.validate(token, "admin");
        if (s == null) { sendJson(exchange, 401, mapOf("error", "Sessão inválida ou expirada. Faça login novamente.")); return; }
        action.run(s);
    }

    private void requireDev(HttpExchange exchange, AuthedAction action) throws IOException {
        String token = exchange.getRequestHeaders().getFirst("X-Admin-Token");
        AdminAuthService.LoginSession s = AdminAuthService.validate(token, "dev");
        if (s == null) { sendJson(exchange, 401, mapOf("error", "Sessão inválida ou expirada. Faça login novamente.")); return; }
        action.run(s);
    }

    /* ==================== helpers ==================== */

    private String str(Object o) { return o == null ? "" : o.toString(); }

    private Map<String, Object> readJsonBody(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int n;
        while ((n = is.read(chunk)) != -1) buf.write(chunk, 0, n);
        String text = buf.toString(StandardCharsets.UTF_8);
        if (text.isBlank()) return new LinkedHashMap<>();
        return Json.parseObject(text);
    }

    private void sendJson(HttpExchange exchange, int status, Map<String, Object> body) throws IOException {
        byte[] bytes = Json.write(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) { os.write(bytes); }
    }

    private void sendJsonList(HttpExchange exchange, int status, List<Map<String, Object>> body) throws IOException {
        byte[] bytes = Json.write(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) { os.write(bytes); }
    }

    private Map<String, Object> mapOf(String key, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(key, value);
        return m;
    }
}
