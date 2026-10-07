package com.trilhamagica;

import com.sun.net.httpserver.HttpServer;

import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.Executors;

/**
 * Main.java
 * Ponto de entrada da aplicação. Sobe um servidor HTTP (com.sun.net.httpserver,
 * nativo do JDK  sem dependências externas de framework web), inicializa o
 * banco de dados relacional e registra as rotas estáticas e da API.
 */
public class Main {
    public static void main(String[] args) throws Exception {
        // Garante saída de console em UTF-8 em qualquer sistema operacional (Windows inclusive)
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));

        int port = 3000;
        String portEnv = System.getenv("PORT");
        if (portEnv != null && !portEnv.isBlank()) {
            try { port = Integer.parseInt(portEnv.trim()); } catch (NumberFormatException ignored) { }
        }

        // Garante que o banco de dados seja inicializado (cria tabelas se preciso)
        Database.get();

        Path publicDir = Path.of("public");

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/", new ApiHandler());
        server.createContext("/", new StaticFileHandler(publicDir));
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        System.out.println();
        System.out.println("Trilha Mágica (backend Java) rodando em http://localhost:" + port);
        System.out.println("   Painel do administrador: http://localhost:" + port + "/admin/trilhas/index.html");
        System.out.println("   Painel do desenvolvedor:  http://localhost:" + port + "/dev/trilhas/index.html");
        System.out.println();
    }
}
