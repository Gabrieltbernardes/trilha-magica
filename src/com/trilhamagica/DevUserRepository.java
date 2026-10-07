package com.trilhamagica;

import java.sql.*;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * DevUserRepository.java
 * Consulta a tabela dev_users  usada pelo login do painel do
 * desenvolvedor. Segue o mesmo padrão de AdminUserRepository (senha
 * sempre com hash + salt, nunca em texto puro).
 */
public final class DevUserRepository {

    private DevUserRepository() { }

    public static Map<String, Object> findByUsername(String username) {
        synchronized (Database.LOCK) {
            Connection conn = Database.get();
            try (PreparedStatement ps = conn.prepareStatement("SELECT * FROM dev_users WHERE username = ?")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return null;
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("username", rs.getString("username"));
                    m.put("passwordHash", rs.getString("password_hash"));
                    m.put("passwordSalt", rs.getString("password_salt"));
                    return m;
                }
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }
}
