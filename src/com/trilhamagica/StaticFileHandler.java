package com.trilhamagica;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.*;
import java.nio.file.*;
import java.util.Set;

/**
 * StaticFileHandler.java
 * Serve os arquivos estáticos do frontend (pasta public/) e implementa
 * o roteamento especial da aplicação:
 *
 *   - URLs por professor: "/{usuario}.html" abre o login de uma turma
 *     específica; "/game1/{usuario}.html", "/game2/{usuario}.html",
 *     "/game3/{usuario}.html" e "/finished/{usuario}.html" abrem as
 *     telas do jogo mantendo o mesmo contexto de professor (o nome de
 *     usuário vai embutido na URL; o JavaScript da página o lê de
 *     `location.pathname`).
 *   - URLs "escondidas" do painel administrativo e do painel do
 *     desenvolvedor: o caminho padrão (/admin, /admin/index.html,
 *     /dev, /dev/index.html) é bloqueado (404); só é possível acessar
 *     por "/admin/trilhas/index.html" e "/dev/trilhas/index.html".
 */
public class StaticFileHandler implements HttpHandler {

    private final Path publicDir;
    private static final Set<String> RESERVED_TOP_SEGMENTS = Set.of(
            "game1", "game2", "game3", "finished", "admin", "dev", "css", "js", "api"
    );
    private static final Set<String> RESERVED_ROOT_FILENAMES = Set.of(
            "index.html", "game1.html", "game2.html", "game3.html", "finished.html"
    );

    public StaticFileHandler(Path publicDir) {
        this.publicDir = publicDir.toAbsolutePath().normalize();
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();

        // ---- caminhos escondidos do admin/dev ----
        if (path.equals("/admin") || path.equals("/admin/") || path.equals("/admin/index.html")) {
            notFound(exchange); return;
        }
        if (path.equals("/dev") || path.equals("/dev/") || path.equals("/dev/index.html")) {
            notFound(exchange); return;
        }
        if (path.equals("/admin/trilhas") || path.equals("/admin/trilhas/") || path.equals("/admin/trilhas/index.html")) {
            serveFile(exchange, publicDir.resolve("admin/index.html")); return;
        }
        if (path.equals("/dev/trilhas") || path.equals("/dev/trilhas/") || path.equals("/dev/trilhas/index.html")) {
            serveFile(exchange, publicDir.resolve("dev/index.html")); return;
        }

        // ---- rotas por professor: /game1/{usuario}.html, /game2/{usuario}.html, ... ----
        String[] segs = path.startsWith("/") ? path.substring(1).split("/") : path.split("/");
        if (segs.length == 2 && segs[1].endsWith(".html")) {
            switch (segs[0]) {
                case "game1": serveFile(exchange, publicDir.resolve("game1.html")); return;
                case "game2": serveFile(exchange, publicDir.resolve("game2.html")); return;
                case "game3": serveFile(exchange, publicDir.resolve("game3.html")); return;
                case "finished": serveFile(exchange, publicDir.resolve("finished.html")); return;
                default: break; // segue para as demais regras
            }
        }

        // ---- rota por professor na raiz: /{usuario}.html (abre o login daquela turma) ----
        if (segs.length == 1 && segs[0].endsWith(".html")
                && !RESERVED_ROOT_FILENAMES.contains(segs[0])
                && !RESERVED_TOP_SEGMENTS.contains(segs[0].replace(".html", ""))) {
            serveFile(exchange, publicDir.resolve("index.html")); return;
        }

        // ---- padrão: raiz e arquivos estáticos normais ----
        if (path.equals("/") || path.isEmpty()) {
            serveFile(exchange, publicDir.resolve("index.html")); return;
        }

        String relative = path.startsWith("/") ? path.substring(1) : path;
        Path target = publicDir.resolve(relative).normalize();
        if (!target.startsWith(publicDir)) { // proteção contra path traversal
            exchange.sendResponseHeaders(403, -1);
            exchange.close();
            return;
        }
        serveFile(exchange, target);
    }

    private void notFound(HttpExchange exchange) throws IOException {
        byte[] body = "404 - Não encontrado".getBytes("UTF-8");
        exchange.getResponseHeaders().add("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(404, body.length);
        try (OutputStream os = exchange.getResponseBody()) { os.write(body); }
    }

    private void serveFile(HttpExchange exchange, Path file) throws IOException {
        if (!Files.exists(file) || Files.isDirectory(file)) { notFound(exchange); return; }
        byte[] bytes = Files.readAllBytes(file);
        exchange.getResponseHeaders().add("Content-Type", contentType(file.toString()));
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String contentType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }
}
