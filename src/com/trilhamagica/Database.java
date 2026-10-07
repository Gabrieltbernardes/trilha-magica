package com.trilhamagica;

import java.io.File;
import java.net.URI;
import java.sql.*;

/**
 * Database.java
 * Conexão com o banco de dados relacional e criação do esquema (tabelas
 * com chaves primária/estrangeira). Toda a aplicação compartilha uma
 * única conexão, com acesso sincronizado.
 *
 * Funciona com dois bancos, escolhidos automaticamente:
 *   - Se a variável de ambiente DATABASE_URL existir (é o que o Heroku
 *     Postgres define sozinho), conecta nela via PostgreSQL.
 *   - Caso contrário (rodando localmente), usa um arquivo SQLite em
 *     data/trilha_magica.db, como sempre foi.
 * O SQL usado no restante da aplicação (DDL e upserts com ON CONFLICT)
 * é compatível com os dois bancos, então nenhum outro arquivo precisa
 * saber qual banco está em uso.
 */
public final class Database {

    private static Connection connection;
    private static boolean isPostgres = false;
    public static final Object LOCK = new Object();

    private Database() { }

    public static synchronized Connection get() {
        if (connection == null) {
            try {
                String databaseUrl = System.getenv("DATABASE_URL");
                if (databaseUrl != null && !databaseUrl.isBlank()) {
                    connection = connectPostgres(databaseUrl);
                    isPostgres = true;
                } else {
                    connection = connectSqlite();
                    isPostgres = false;
                }
                migrate();
            } catch (Exception e) {
                throw new RuntimeException("Falha ao conectar ao banco de dados", e);
            }
        }
        return connection;
    }

    public static boolean isPostgres() { return isPostgres; }

    private static Connection connectSqlite() throws Exception {
        Class.forName("org.sqlite.JDBC");
        File dataDir = new File("data");
        if (!dataDir.exists()) dataDir.mkdirs();
        String url = "jdbc:sqlite:" + new File(dataDir, "trilha_magica.db").getAbsolutePath();
        Connection conn = DriverManager.getConnection(url);
        conn.createStatement().execute("PRAGMA foreign_keys = ON");
        return conn;
    }

    /**
     * O Heroku define DATABASE_URL no formato "postgres://user:pass@host:port/dbname",
     * que precisa ser convertido para o formato JDBC ("jdbc:postgresql://...")
     * e conectado com SSL (o Heroku Postgres exige conexão criptografada).
     */
    private static Connection connectPostgres(String herokuUrl) throws Exception {
        Class.forName("org.postgresql.Driver");
        URI uri = new URI(herokuUrl);
        String[] userInfo = uri.getUserInfo().split(":", 2);
        String jdbcUrl = "jdbc:postgresql://" + uri.getHost() + ":" + (uri.getPort() < 0 ? 5432 : uri.getPort())
                + uri.getPath() + "?sslmode=require";
        return DriverManager.getConnection(jdbcUrl, userInfo[0], userInfo[1]);
    }

    private static void migrate() throws SQLException {
        try (Statement st = connection.createStatement()) {
            st.execute(
                "CREATE TABLE IF NOT EXISTS admin_users (" +
                "  id TEXT PRIMARY KEY," +
                "  name TEXT NOT NULL," +
                "  username TEXT NOT NULL UNIQUE," +
                "  password_hash TEXT NOT NULL," +
                "  password_salt TEXT NOT NULL," +
                "  cpf TEXT NOT NULL," +
                "  email TEXT NOT NULL," +
                "  phone TEXT NOT NULL," +
                "  token TEXT NOT NULL," +
                "  first_login_done INTEGER NOT NULL DEFAULT 0," +
                "  created_at TEXT NOT NULL" +
                ")"
            );
            st.execute(
                "CREATE TABLE IF NOT EXISTS sessions (" +
                "  id TEXT PRIMARY KEY," +
                "  child_name TEXT NOT NULL," +
                "  admin_username TEXT," +
                "  started_at TEXT NOT NULL," +
                "  finished_at TEXT" +
                ")"
            );
            st.execute(
                "CREATE TABLE IF NOT EXISTS game1_results (" +
                "  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE," +
                "  total_trials INTEGER," +
                "  acertos INTEGER," +
                "  erros_impulso INTEGER," +
                "  omissoes INTEGER," +
                "  tempo_reacao_medio_ms INTEGER" +
                ")"
            );
            st.execute(
                "CREATE TABLE IF NOT EXISTS game2_results (" +
                "  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE," +
                "  rodadas_jogadas INTEGER," +
                "  taxa_acerto REAL," +
                "  tempo_resposta_medio_ms INTEGER," +
                "  extensao_maxima_sequencia INTEGER," +
                "  erros_por_posicao INTEGER," +
                "  celulas_acertadas INTEGER" +
                ")"
            );
            st.execute(
                "CREATE TABLE IF NOT EXISTS dev_users (" +
                "  id TEXT PRIMARY KEY," +
                "  username TEXT NOT NULL UNIQUE," +
                "  password_hash TEXT NOT NULL," +
                "  password_salt TEXT NOT NULL," +
                "  created_at TEXT NOT NULL" +
                ")"
            );
            st.execute(
                "CREATE TABLE IF NOT EXISTS game3_results (" +
                "  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE," +
                "  total_cartas INTEGER," +
                "  acertos INTEGER," +
                "  trocas_de_regra INTEGER," +
                "  erros_apos_mudanca_regra INTEGER," +
                "  tempo_medio_resposta_ms INTEGER," +
                "  indice_perseveracao INTEGER" +
                ")"
            );
            // Migrações leves: garantem colunas em bancos criados antes delas existirem.
            try {
                st.execute("ALTER TABLE sessions ADD COLUMN admin_username TEXT");
            } catch (SQLException ignoredAlreadyExists) { }
            try {
                st.execute("ALTER TABLE game2_results ADD COLUMN celulas_acertadas INTEGER");
            } catch (SQLException ignoredAlreadyExists) { }
            // Remove colunas descontinuadas do Jogo 1 (geravam falsos positivos na análise).
            for (String col : new String[]{"tempo_reacao_congruente_ms", "tempo_reacao_incongruente_ms", "consistencia_sd_ms"}) {
                try {
                    st.execute("ALTER TABLE game1_results DROP COLUMN " + col);
                } catch (SQLException ignoredMissingOrUnsupported) { }
            }
            // Remove coluna descontinuada do Jogo 3 (não faz mais sentido com regra sorteada a cada pergunta).
            try {
                st.execute("ALTER TABLE game3_results DROP COLUMN tentativas_ate_adaptacao_media");
            } catch (SQLException ignoredMissingOrUnsupported) { }

            seedDefaultAdmin(st);
            seedDefaultDeveloper(st);
        }
    }

    /** Lê uma variável de ambiente; devolve null se ausente ou em branco. */
    private static String env(String name) {
        String v = System.getenv(name);
        return (v == null || v.isBlank()) ? null : v;
    }

    /**
     * Cria o administrador de bootstrap na primeira execução (somente se ainda
     * não existir nenhum administrador), para que o sistema não comece sem
     * acesso. Nenhuma senha fica no código-fonte:
     *   - usuário:  variável TRILHA_ADMIN_USERNAME (padrão: "professor");
     *   - senha:    variável TRILHA_ADMIN_PASSWORD. Se não estiver definida, é
     *               gerada uma senha aleatória, exibida UMA única vez no log
     *               de inicialização (e guardada apenas como hash + salt).
     * O administrador pode ser editado/removido depois pelo painel do desenvolvedor.
     */
    private static void seedDefaultAdmin(Statement st) throws SQLException {
        try (ResultSet rs = st.executeQuery("SELECT COUNT(*) AS c FROM admin_users")) {
            rs.next();
            if (rs.getInt("c") > 0) return;
        }
        String username = env("TRILHA_ADMIN_USERNAME");
        if (username == null) username = "professor";
        String password = env("TRILHA_ADMIN_PASSWORD");
        boolean generated = password == null;
        if (generated) password = AdminAuthService.generatePassword();

        String[] salted = AdminAuthService.hashPassword(password);
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO admin_users (id, name, username, password_hash, password_salt, cpf, email, phone, token, first_login_done, created_at) " +
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
            ps.setString(1, "seed-" + System.currentTimeMillis());
            ps.setString(2, "Professor Padrão");
            ps.setString(3, username);
            ps.setString(4, salted[0]);
            ps.setString(5, salted[1]);
            ps.setString(6, "00000000000");
            ps.setString(7, "professor@example.com");
            ps.setString(8, "00000000000");
            ps.setString(9, AdminAuthService.generateToken());
            ps.setInt(10, 0);
            ps.setString(11, java.time.Instant.now().toString());
            ps.executeUpdate();
        }
        if (generated) {
            System.out.println("[bootstrap] Administrador '" + username + "' criado com senha gerada: " + password
                    + "  (exibida somente agora; defina TRILHA_ADMIN_PASSWORD para escolher a sua)");
        } else {
            System.out.println("[bootstrap] Administrador '" + username + "' criado com a senha de TRILHA_ADMIN_PASSWORD.");
        }
    }

    /**
     * Garante a conta de desenvolvedor, também sem senha no código-fonte:
     *   - usuário:  TRILHA_DEV_USERNAME (padrão: "dev");
     *   - senha:    TRILHA_DEV_PASSWORD. Se não houver nenhuma conta de
     *               desenvolvedor ainda e a variável não estiver definida, é
     *               gerada uma senha aleatória, exibida UMA vez no log.
     * Quando TRILHA_DEV_PASSWORD está definida, ela é a fonte da verdade a
     * cada inicialização: se o hash gravado não corresponde a ela, a senha é
     * atualizada (permite rotacionar a senha só trocando a variável e
     * reiniciando) e quaisquer outras contas de desenvolvedor são removidas,
     * para que credenciais antigas não continuem valendo.
     * A senha é sempre armazenada como hash + salt (mesmo padrão de admin_users).
     */
    private static void seedDefaultDeveloper(Statement st) throws SQLException {
        String username = env("TRILHA_DEV_USERNAME");
        if (username == null) username = "dev";
        String envPassword = env("TRILHA_DEV_PASSWORD");

        int count;
        try (ResultSet rs = st.executeQuery("SELECT COUNT(*) AS c FROM dev_users")) {
            rs.next();
            count = rs.getInt("c");
        }

        if (count == 0) {
            String password = envPassword != null ? envPassword : AdminAuthService.generatePassword();
            insertDeveloper(username, password);
            if (envPassword == null) {
                System.out.println("[bootstrap] Desenvolvedor '" + username + "' criado com senha gerada: " + password
                        + "  (exibida somente agora; defina TRILHA_DEV_PASSWORD para escolher a sua)");
            } else {
                System.out.println("[bootstrap] Desenvolvedor '" + username + "' criado com a senha de TRILHA_DEV_PASSWORD.");
            }
            return;
        }

        if (envPassword == null) return; // nada a sincronizar; mantém a conta existente

        // Remove contas de desenvolvedor com outro nome de usuário (ex.: conta padrão antiga).
        try (PreparedStatement ps = connection.prepareStatement("DELETE FROM dev_users WHERE username <> ?")) {
            ps.setString(1, username);
            int removed = ps.executeUpdate();
            if (removed > 0) System.out.println("[bootstrap] " + removed + " conta(s) de desenvolvedor antiga(s) removida(s).");
        }

        String currentHash = null, currentSalt = null;
        try (PreparedStatement ps = connection.prepareStatement("SELECT password_hash, password_salt FROM dev_users WHERE username = ?")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) { currentHash = rs.getString(1); currentSalt = rs.getString(2); }
            }
        }

        if (currentHash == null) {
            insertDeveloper(username, envPassword);
            System.out.println("[bootstrap] Desenvolvedor '" + username + "' criado com a senha de TRILHA_DEV_PASSWORD.");
        } else if (!AdminAuthService.verifyPassword(envPassword, currentHash, currentSalt)) {
            String[] salted = AdminAuthService.hashPassword(envPassword);
            try (PreparedStatement ps = connection.prepareStatement(
                    "UPDATE dev_users SET password_hash = ?, password_salt = ? WHERE username = ?")) {
                ps.setString(1, salted[0]);
                ps.setString(2, salted[1]);
                ps.setString(3, username);
                ps.executeUpdate();
            }
            System.out.println("[bootstrap] Senha do desenvolvedor '" + username + "' atualizada a partir de TRILHA_DEV_PASSWORD.");
        }
    }

    private static void insertDeveloper(String username, String password) throws SQLException {
        String[] salted = AdminAuthService.hashPassword(password);
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO dev_users (id, username, password_hash, password_salt, created_at) VALUES (?,?,?,?,?)")) {
            ps.setString(1, "dev-seed-" + System.currentTimeMillis());
            ps.setString(2, username);
            ps.setString(3, salted[0]);
            ps.setString(4, salted[1]);
            ps.setString(5, java.time.Instant.now().toString());
            ps.executeUpdate();
        }
    }
}
