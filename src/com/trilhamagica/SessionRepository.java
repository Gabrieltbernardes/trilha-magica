package com.trilhamagica;

import java.sql.*;
import java.time.Instant;
import java.util.*;

/**
 * SessionRepository.java
 * Operações de leitura/escrita nas tabelas do banco relacional
 * (sessions, game1_results, game2_results, game3_results).
 */
public final class SessionRepository {

    private SessionRepository() { }

    private static String uid() {
        return Long.toString(System.currentTimeMillis(), 36) + Integer.toHexString((int) (Math.random() * 0xFFFFFF));
    }

    public static Map<String, Object> createSession(String childName, String adminUsername) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            String id = uid();
            String startedAt = Instant.now().toString();
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO sessions (id, child_name, admin_username, started_at, finished_at) VALUES (?, ?, ?, ?, NULL)")) {
                ps.setString(1, id);
                ps.setString(2, childName);
                ps.setString(3, adminUsername);
                ps.setString(4, startedAt);
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("childName", childName);
            result.put("adminUsername", adminUsername);
            result.put("startedAt", startedAt);
            return result;
        }
    }

    public static void saveGame1(String sessionId, Map<String, Object> m) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            String sql = "INSERT INTO game1_results " +
                    "(session_id, total_trials, acertos, erros_impulso, omissoes, tempo_reacao_medio_ms) " +
                    "VALUES (?,?,?,?,?,?) " +
                    "ON CONFLICT(session_id) DO UPDATE SET total_trials=excluded.total_trials, acertos=excluded.acertos, " +
                    "erros_impulso=excluded.erros_impulso, omissoes=excluded.omissoes, tempo_reacao_medio_ms=excluded.tempo_reacao_medio_ms";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, sessionId);
                setIntOrNull(ps, 2, m.get("total_trials"));
                setIntOrNull(ps, 3, m.get("acertos"));
                setIntOrNull(ps, 4, m.get("erros_impulso"));
                setIntOrNull(ps, 5, m.get("omissoes"));
                setIntOrNull(ps, 6, m.get("tempo_reacao_medio_ms"));
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static void saveGame2(String sessionId, Map<String, Object> m) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            String sql = "INSERT INTO game2_results " +
                    "(session_id, rodadas_jogadas, taxa_acerto, tempo_resposta_medio_ms, extensao_maxima_sequencia, erros_por_posicao, celulas_acertadas) " +
                    "VALUES (?,?,?,?,?,?,?) " +
                    "ON CONFLICT(session_id) DO UPDATE SET rodadas_jogadas=excluded.rodadas_jogadas, taxa_acerto=excluded.taxa_acerto, " +
                    "tempo_resposta_medio_ms=excluded.tempo_resposta_medio_ms, extensao_maxima_sequencia=excluded.extensao_maxima_sequencia, " +
                    "erros_por_posicao=excluded.erros_por_posicao, celulas_acertadas=excluded.celulas_acertadas";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, sessionId);
                setIntOrNull(ps, 2, m.get("rodadas_jogadas"));
                setDoubleOrNull(ps, 3, m.get("taxa_acerto"));
                setIntOrNull(ps, 4, m.get("tempo_resposta_medio_ms"));
                setIntOrNull(ps, 5, m.get("extensao_maxima_sequencia"));
                setIntOrNull(ps, 6, m.get("erros_por_posicao"));
                setIntOrNull(ps, 7, m.get("celulas_acertadas"));
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static void saveGame3(String sessionId, Map<String, Object> m) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            String sql = "INSERT INTO game3_results " +
                    "(session_id, total_cartas, acertos, trocas_de_regra, erros_apos_mudanca_regra, tempo_medio_resposta_ms, indice_perseveracao) " +
                    "VALUES (?,?,?,?,?,?,?) " +
                    "ON CONFLICT(session_id) DO UPDATE SET total_cartas=excluded.total_cartas, acertos=excluded.acertos, " +
                    "trocas_de_regra=excluded.trocas_de_regra, " +
                    "erros_apos_mudanca_regra=excluded.erros_apos_mudanca_regra, tempo_medio_resposta_ms=excluded.tempo_medio_resposta_ms, " +
                    "indice_perseveracao=excluded.indice_perseveracao";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, sessionId);
                setIntOrNull(ps, 2, m.get("total_cartas"));
                setIntOrNull(ps, 3, m.get("acertos"));
                setIntOrNull(ps, 4, m.get("trocas_de_regra"));
                setIntOrNull(ps, 5, m.get("erros_apos_mudanca_regra"));
                setIntOrNull(ps, 6, m.get("tempo_medio_resposta_ms"));
                setIntOrNull(ps, 7, m.get("indice_perseveracao"));
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }

            try (PreparedStatement ps2 = conn.prepareStatement("UPDATE sessions SET finished_at = ? WHERE id = ?")) {
                ps2.setString(1, Instant.now().toString());
                ps2.setString(2, sessionId);
                ps2.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static Map<String, Object> getSession(String id) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("SELECT * FROM sessions WHERE id = ?")) {
                ps.setString(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return null;
                    return buildSession(conn, rs);
                }
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    /** Lista as sessões completas pertencentes a um administrador específico  isola os dados por professor. */
    public static List<Map<String, Object>> getAllCompletedSessions(String adminUsername) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            List<Map<String, Object>> out = new ArrayList<>();
            String sql = "SELECT * FROM sessions WHERE finished_at IS NOT NULL AND admin_username = ? ORDER BY finished_at DESC";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, adminUsername);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        Map<String, Object> session = buildSession(conn, rs);
                        if (session.get("game1") != null && session.get("game2") != null && session.get("game3") != null) {
                            out.add(session);
                        }
                    }
                }
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
            return out;
        }
    }

    public static boolean deleteSession(String id) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM sessions WHERE id = ?")) {
                ps.setString(1, id);
                return ps.executeUpdate() > 0; // game1/2/3_results são removidos em cascata (ON DELETE CASCADE)
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    /** Reatribui todas as sessões de um administrador para outro (usado antes de excluir um administrador). */
    public static int transferSessions(String fromAdminUsername, String toAdminUsername) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("UPDATE sessions SET admin_username = ? WHERE admin_username = ?")) {
                ps.setString(1, toAdminUsername);
                ps.setString(2, fromAdminUsername);
                return ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    /** Apaga todas as sessões de um administrador (exclusão em cascata total, usada ao excluir um administrador sem transferir). */
    public static int deleteSessionsByAdmin(String adminUsername) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM sessions WHERE admin_username = ?")) {
                ps.setString(1, adminUsername);
                return ps.executeUpdate(); // game1/2/3_results são removidos em cascata (ON DELETE CASCADE)
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    /* ---------------- helpers ---------------- */

    private static Map<String, Object> buildSession(Connection conn, ResultSet rs) throws SQLException {
        Map<String, Object> session = new LinkedHashMap<>();
        String id = rs.getString("id");
        session.put("id", id);
        session.put("childName", rs.getString("child_name"));
        session.put("adminUsername", rs.getString("admin_username"));
        session.put("startedAt", rs.getString("started_at"));
        session.put("finishedAt", rs.getString("finished_at"));
        session.put("game1", fetchGame1(conn, id));
        session.put("game2", fetchGame2(conn, id));
        session.put("game3", fetchGame3(conn, id));
        return session;
    }

    private static Map<String, Object> fetchGame1(Connection conn, String sessionId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT * FROM game1_results WHERE session_id = ?")) {
            ps.setString(1, sessionId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("total_trials", rs.getInt("total_trials"));
                m.put("acertos", rs.getInt("acertos"));
                m.put("erros_impulso", rs.getInt("erros_impulso"));
                m.put("omissoes", rs.getInt("omissoes"));
                m.put("tempo_reacao_medio_ms", rs.getInt("tempo_reacao_medio_ms"));
                return m;
            }
        }
    }

    private static Map<String, Object> fetchGame2(Connection conn, String sessionId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT * FROM game2_results WHERE session_id = ?")) {
            ps.setString(1, sessionId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("rodadas_jogadas", rs.getInt("rodadas_jogadas"));
                m.put("taxa_acerto", rs.getDouble("taxa_acerto"));
                m.put("tempo_resposta_medio_ms", rs.getInt("tempo_resposta_medio_ms"));
                m.put("extensao_maxima_sequencia", rs.getInt("extensao_maxima_sequencia"));
                m.put("erros_por_posicao", rs.getInt("erros_por_posicao"));
                m.put("celulas_acertadas", rs.getInt("celulas_acertadas"));
                return m;
            }
        }
    }

    private static Map<String, Object> fetchGame3(Connection conn, String sessionId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT * FROM game3_results WHERE session_id = ?")) {
            ps.setString(1, sessionId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("total_cartas", rs.getInt("total_cartas"));
                m.put("acertos", rs.getInt("acertos"));
                m.put("trocas_de_regra", rs.getInt("trocas_de_regra"));
                m.put("erros_apos_mudanca_regra", rs.getInt("erros_apos_mudanca_regra"));
                m.put("tempo_medio_resposta_ms", rs.getInt("tempo_medio_resposta_ms"));
                m.put("indice_perseveracao", rs.getInt("indice_perseveracao"));
                return m;
            }
        }
    }

    private static Integer nullableInt(ResultSet rs, String col) throws SQLException {
        int v = rs.getInt(col);
        return rs.wasNull() ? null : v;
    }

    private static void setIntOrNull(PreparedStatement ps, int idx, Object val) throws SQLException {
        if (val == null) ps.setNull(idx, Types.INTEGER);
        else ps.setInt(idx, ((Number) val).intValue());
    }

    private static void setDoubleOrNull(PreparedStatement ps, int idx, Object val) throws SQLException {
        if (val == null) ps.setNull(idx, Types.REAL);
        else ps.setDouble(idx, ((Number) val).doubleValue());
    }
}
