package com.trilhamagica;

import java.sql.*;
import java.time.Instant;
import java.util.*;

/**
 * AdminUserRepository.java
 * Operações CRUD sobre a tabela admin_users  usada pelo painel do
 * desenvolvedor (gerenciamento de professores/administradores) e pelo
 * fluxo de login do administrador.
 */
public final class AdminUserRepository {

    private AdminUserRepository() { }

    private static String uid() {
        return "adm-" + Long.toString(System.currentTimeMillis(), 36) + Integer.toHexString((int) (Math.random() * 0xFFFFFF));
    }

    public static Map<String, Object> create(String name, String username, String plainPassword, String cpf, String email, String phone) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            if (findByUsername(username) != null) {
                throw new IllegalArgumentException("Já existe um usuário com esse nome de usuário.");
            }
            String[] hashed = AdminAuthService.hashPassword(plainPassword);
            String token = AdminAuthService.generateToken();
            String id = uid();
            String createdAt = Instant.now().toString();
            String sql = "INSERT INTO admin_users (id, name, username, password_hash, password_salt, cpf, email, phone, token, first_login_done, created_at) " +
                    "VALUES (?,?,?,?,?,?,?,?,?,0,?)";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, id);
                ps.setString(2, name);
                ps.setString(3, username);
                ps.setString(4, hashed[0]);
                ps.setString(5, hashed[1]);
                ps.setString(6, cpf.replaceAll("\\D", ""));
                ps.setString(7, email);
                ps.setString(8, phone);
                ps.setString(9, token);
                ps.setString(10, createdAt);
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
            return publicView(getById(id));
        }
    }

    public static List<Map<String, Object>> listAll() {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            List<Map<String, Object>> out = new ArrayList<>();
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT * FROM admin_users ORDER BY created_at DESC")) {
                while (rs.next()) out.add(publicView(rowToMap(rs)));
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
            return out;
        }
    }

    public static Map<String, Object> getById(String id) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("SELECT * FROM admin_users WHERE id = ?")) {
                ps.setString(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return null;
                    return rowToMap(rs);
                }
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    /** Retorna o registro COMPLETO (inclui hash/salt)  uso interno do login, nunca exposto pela API. */
    public static Map<String, Object> findByUsername(String username) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("SELECT * FROM admin_users WHERE username = ?")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return null;
                    return rowToMap(rs);
                }
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static void markFirstLoginDone(String username) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("UPDATE admin_users SET first_login_done = 1 WHERE username = ?")) {
                ps.setString(1, username);
                ps.executeUpdate();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static boolean update(String id, String name, String cpf, String email, String phone, String newPasswordOrNull) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            StringBuilder sql = new StringBuilder("UPDATE admin_users SET name=?, cpf=?, email=?, phone=?");
            if (newPasswordOrNull != null && !newPasswordOrNull.isBlank()) sql.append(", password_hash=?, password_salt=?");
            sql.append(" WHERE id=?");
            try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
                int i = 1;
                ps.setString(i++, name);
                ps.setString(i++, cpf.replaceAll("\\D", ""));
                ps.setString(i++, email);
                ps.setString(i++, phone);
                if (newPasswordOrNull != null && !newPasswordOrNull.isBlank()) {
                    String[] hashed = AdminAuthService.hashPassword(newPasswordOrNull);
                    ps.setString(i++, hashed[0]);
                    ps.setString(i++, hashed[1]);
                }
                ps.setString(i, id);
                return ps.executeUpdate() > 0;
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static boolean delete(String id) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM admin_users WHERE id = ?")) {
                ps.setString(1, id);
                return ps.executeUpdate() > 0;
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    /* ---------------- helpers ---------------- */

    private static Map<String, Object> rowToMap(ResultSet rs) throws SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        m.put("name", rs.getString("name"));
        m.put("username", rs.getString("username"));
        m.put("passwordHash", rs.getString("password_hash"));
        m.put("passwordSalt", rs.getString("password_salt"));
        m.put("cpf", rs.getString("cpf"));
        m.put("email", rs.getString("email"));
        m.put("phone", rs.getString("phone"));
        m.put("token", rs.getString("token"));
        m.put("firstLoginDone", rs.getInt("first_login_done") == 1);
        m.put("createdAt", rs.getString("created_at"));
        return m;
    }

    /** Remove campos sensíveis (hash/salt) antes de expor via API. */
    public static Map<String, Object> publicView(Map<String, Object> full) {
        if (full == null) return null;
        Map<String, Object> pub = new LinkedHashMap<>(full);
        pub.remove("passwordHash");
        pub.remove("passwordSalt");
        return pub;
    }
}
