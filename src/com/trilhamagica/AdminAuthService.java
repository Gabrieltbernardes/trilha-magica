package com.trilhamagica;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AdminAuthService.java
 * Concentra as regras de segurança usadas tanto pelo login do
 * administrador quanto pelo do desenvolvedor:
 *   - hash de senha com salt (SHA-256, sem depender de bibliotecas externas)
 *   - geração de token no formato Trilha-XXX-XXX
 *   - validação de CPF (algoritmo de dígito verificador)
 *   - sessões de login com expiração de 30 minutos (em memória)
 *   - bloqueio temporário após tentativas de login malsucedidas
 */
public final class AdminAuthService {

    private AdminAuthService() { }

    public static final long SESSION_DURATION_MS = 30L * 60 * 1000; // 30 minutos
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final long LOCKOUT_DURATION_MS = 15L * 60 * 1000; // 15 minutos

    /* ---------------- Hash de senha (SHA-256 + salt) ---------------- */

    /** Retorna {hash, salt}, ambos em Base64. */
    public static String[] hashPassword(String plainPassword) {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String saltB64 = Base64.getEncoder().encodeToString(salt);
        String hash = hashWithSalt(plainPassword, saltB64);
        return new String[]{hash, saltB64};
    }

    public static boolean verifyPassword(String plainPassword, String expectedHash, String saltB64) {
        String computed = hashWithSalt(plainPassword, saltB64);
        return constantTimeEquals(computed, expectedHash);
    }

    private static String hashWithSalt(String plainPassword, String saltB64) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(Base64.getDecoder().decode(saltB64));
            byte[] hashed = digest.digest(plainPassword.getBytes("UTF-8"));
            return Base64.getEncoder().encodeToString(hashed);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /** Comparação em tempo constante  evita ataques de temporização na verificação de senha/token. */
    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        byte[] ba = a.getBytes();
        byte[] bb = b.getBytes();
        if (ba.length != bb.length) return false;
        int diff = 0;
        for (int i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
        return diff == 0;
    }

    /* ---------------- Token de administrador (Trilha-XXX-XXX) ---------------- */

    private static final String TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 (evita confusão visual)

    public static String generateToken() {
        SecureRandom rnd = new SecureRandom();
        return "Trilha-" + randomBlock(rnd, 3) + "-" + randomBlock(rnd, 3);
    }

    private static final String PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

    /** Senha aleatória (16 caracteres, SecureRandom), usada quando nenhuma senha de bootstrap é configurada. */
    public static String generatePassword() {
        SecureRandom rnd = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 16; i++) sb.append(PASSWORD_CHARS.charAt(rnd.nextInt(PASSWORD_CHARS.length())));
        return sb.toString();
    }

    private static String randomBlock(SecureRandom rnd, int len) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) sb.append(TOKEN_CHARS.charAt(rnd.nextInt(TOKEN_CHARS.length())));
        return sb.toString();
    }

    /* ---------------- Validação de CPF ---------------- */

    public static boolean isValidCpf(String rawCpf) {
        if (rawCpf == null) return false;
        String cpf = rawCpf.replaceAll("\\D", "");
        if (cpf.length() != 11) return false;
        if (cpf.chars().distinct().count() == 1) return false; // todos os dígitos iguais (ex.: 111.111.111-11)

        int[] digits = cpf.chars().map(c -> c - '0').toArray();
        int d1 = calcCpfCheckDigit(digits, 9);
        if (d1 != digits[9]) return false;
        int d2 = calcCpfCheckDigit(digits, 10);
        return d2 == digits[10];
    }

    private static int calcCpfCheckDigit(int[] digits, int length) {
        int sum = 0;
        int weight = length + 1;
        for (int i = 0; i < length; i++) sum += digits[i] * (weight - i);
        int mod = sum % 11;
        return mod < 2 ? 0 : 11 - mod;
    }

    /* ---------------- Validação de e-mail e telefone ---------------- */

    private static final java.util.regex.Pattern EMAIL_PATTERN =
            java.util.regex.Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");

    public static boolean isValidEmail(String email) {
        return email != null && EMAIL_PATTERN.matcher(email.trim()).matches();
    }

    /** Aceita telefones brasileiros com 10 ou 11 dígitos (DDD + número, com ou sem o 9º dígito). */
    public static boolean isValidPhone(String rawPhone) {
        if (rawPhone == null) return false;
        String digits = rawPhone.replaceAll("\\D", "");
        return digits.length() == 10 || digits.length() == 11;
    }

    /* ---------------- Sessões de login (em memória, expiram após 30min SEM atividade) ---------------- */

    public static class LoginSession {
        public final String token;
        public final String username;
        public final String role; // "admin" ou "dev"
        private volatile long lastActivity;

        LoginSession(String token, String username, String role, long lastActivity) {
            this.token = token; this.username = username; this.role = role; this.lastActivity = lastActivity;
        }
        public boolean isExpired() { return System.currentTimeMillis() - lastActivity > SESSION_DURATION_MS; }
        public long expiresAt() { return lastActivity + SESSION_DURATION_MS; }
        void touch() { this.lastActivity = System.currentTimeMillis(); }
    }

    private static final Map<String, LoginSession> SESSIONS = new ConcurrentHashMap<>();

    public static LoginSession createSession(String username, String role) {
        String token = randomHex(32);
        LoginSession session = new LoginSession(token, username, role, System.currentTimeMillis());
        SESSIONS.put(token, session);
        return session;
    }

    /**
     * Retorna a sessão válida para o token, ou null se inexistente/expirado/papel
     * incorreto. Toda chamada bem-sucedida renova a janela de 30 minutos de
     * inatividade (sessão "deslizante")  qualquer atividade no painel, incluindo
     * recarregar a página, mantém o usuário logado.
     */
    public static LoginSession validate(String token, String requiredRole) {
        if (token == null) return null;
        LoginSession s = SESSIONS.get(token);
        if (s == null) return null;
        if (s.isExpired()) { SESSIONS.remove(token); return null; }
        if (requiredRole != null && !requiredRole.equals(s.role)) return null;
        s.touch();
        return s;
    }

    public static void invalidate(String token) {
        if (token != null) SESSIONS.remove(token);
    }

    private static String randomHex(int bytes) {
        byte[] b = new byte[bytes];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    /* ---------------- Proteção contra força bruta ---------------- */

    private static class AttemptInfo {
        int failedCount = 0;
        long lockedUntil = 0;
    }
    private static final Map<String, AttemptInfo> ATTEMPTS = new ConcurrentHashMap<>();

    public static boolean isLocked(String key) {
        AttemptInfo info = ATTEMPTS.get(key);
        if (info == null) return false;
        if (info.lockedUntil > 0 && System.currentTimeMillis() < info.lockedUntil) return true;
        if (info.lockedUntil > 0 && System.currentTimeMillis() >= info.lockedUntil) {
            ATTEMPTS.remove(key); // bloqueio expirou, reseta contagem
        }
        return false;
    }

    public static long lockedRemainingMs(String key) {
        AttemptInfo info = ATTEMPTS.get(key);
        if (info == null || info.lockedUntil == 0) return 0;
        return Math.max(0, info.lockedUntil - System.currentTimeMillis());
    }

    public static void registerFailedAttempt(String key) {
        AttemptInfo info = ATTEMPTS.computeIfAbsent(key, k -> new AttemptInfo());
        info.failedCount++;
        if (info.failedCount >= MAX_FAILED_ATTEMPTS) {
            info.lockedUntil = System.currentTimeMillis() + LOCKOUT_DURATION_MS;
        }
    }

    public static void clearAttempts(String key) {
        ATTEMPTS.remove(key);
    }
}
