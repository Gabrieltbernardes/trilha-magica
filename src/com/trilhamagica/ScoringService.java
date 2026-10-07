package com.trilhamagica;

import java.util.*;

/**
 * ScoringService.java
 * Calcula, para cada participante, a nota de 0 a 100 em cada função
 * executiva (Sinib, Smem, Sflex) e a classificação (Abaixo da Média /
 * Mediano / Acima da Média). Também calcula a posição (ranking) de cada
 * participante dentro da turma, por função.
 *
 * MÉTODO GERAL: cada nota de função executiva é a soma de duas partes,
 * 50% + 50%:
 *   - METADE "ACERTOS": baseada diretamente na quantidade de acertos do
 *     jogo (a métrica que mais diferencia o desempenho das crianças na
 *     prática). Normalização min-max simples dentro da turma.
 *   - METADE "OUTRAS MÉTRICAS": média das demais métricas do jogo
 *     (tempo de reação, erros, etc.), normalizada por escore-z
 *     (desvio-padrão em relação à média da turma, convertido para escala
 *     0-100 com médio=50) — o mesmo princípio usado em testes
 *     psicométricos padronizados (ex.: escalas Wechsler).
 *
 * Jogo 1 (Sinib): a metade de acertos usa uma âncora ABSOLUTA no topo —
 * só quem acerta TODAS as rodadas (TOTAL_TRIALS_G1) recebe os 50 pontos
 * cheios dessa metade; quem tem o menor número de acertos da turma recebe
 * 0 nessa metade. Os demais ficam proporcionalmente entre esses dois
 * pontos.
 *
 * Jogos 2 (Smem) e 3 (Sflex): a metade de acertos usa min-max RELATIVO —
 * quem mais acerta na turma (células certas no Jogo 2, questões certas no
 * Jogo 3) recebe os 50 pontos cheios; quem menos acerta recebe 0.
 *
 * Regra especial do Jogo 2: quando a taxa de acerto (TA) é 0%, a nota
 * final de memória de trabalho (Smem) é inteiramente zerada, mesmo que as
 * demais métricas resultassem em nota parcial positiva.
 *
 * Classificação: escala 0-100, limites em Abaixo da Média (< 35), Mediano
 * (35-65), Acima da Média (> 65).
 */
public final class ScoringService {

    private ScoringService() { }

    /** Total de rodadas do Jogo 1 (deve bater com TOTAL_TRIALS em game1.js). */
    private static final double GAME1_TOTAL_TRIALS = 30.0;

    /** Métricas "outras" (não-acerto) de cada função executiva e a direção "menor é melhor". */
    private static final String[] GAME1_OTHER_METRICS = {"EI", "OM", "TR1"};
    private static final boolean[] GAME1_OTHER_LOWER_BETTER = {true, true, true};

    private static final String[] GAME2_OTHER_METRICS = {"TA", "TR2", "SM", "EP"};
    private static final boolean[] GAME2_OTHER_LOWER_BETTER = {false, true, false, true};

    private static final String[] GAME3_OTHER_METRICS = {"EM", "TAd", "P"};
    private static final boolean[] GAME3_OTHER_LOWER_BETTER = {true, true, true};

    public static List<Map<String, Object>> computeCohortScores(List<Map<String, Object>> sessions, Set<String> includedIds) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> s : sessions) {
            Map<String, Object> g1 = asMap(s.get("game1"));
            Map<String, Object> g2 = asMap(s.get("game2"));
            Map<String, Object> g3 = asMap(s.get("game3"));

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", s.get("id"));
            row.put("childName", s.get("childName"));
            row.put("finishedAt", s.get("finishedAt"));

            row.put("EI", num(g1.get("erros_impulso")));
            row.put("OM", num(g1.get("omissoes")));
            row.put("TR1", num(g1.get("tempo_reacao_medio_ms")));
            row.put("AC", num(g1.get("acertos")));

            row.put("TA", num(g2.get("taxa_acerto")));
            row.put("TR2", num(g2.get("tempo_resposta_medio_ms")));
            row.put("SM", num(g2.get("extensao_maxima_sequencia")));
            row.put("EP", num(g2.get("erros_por_posicao")));
            row.put("CA", num(g2.get("celulas_acertadas")));

            row.put("EM", num(g3.get("erros_apos_mudanca_regra")));
            row.put("TAd", num(g3.get("tempo_medio_resposta_ms")));
            row.put("P", num(g3.get("indice_perseveracao")));
            row.put("AC3", num(g3.get("acertos")));

            rows.add(row);
        }

        List<Map<String, Object>> baseline = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (includedIds == null || includedIds.contains(r.get("id"))) baseline.add(r);
        }
        if (baseline.isEmpty()) baseline = rows; // evita divisão por zero se nada estiver selecionado

        // Para cada métrica "outra" (não-acerto), calcula a média e o desvio-padrão POPULACIONAL da coorte.
        Map<String, double[]> stats = new HashMap<>();
        for (String metric : allOtherMetrics()) {
            double sum = 0;
            for (Map<String, Object> r : baseline) sum += (Double) r.get(metric);
            double mean = sum / baseline.size();

            double sqSum = 0;
            for (Map<String, Object> r : baseline) {
                double diff = (Double) r.get(metric) - mean;
                sqSum += diff * diff;
            }
            double sd = Math.sqrt(sqSum / baseline.size());
            stats.put(metric, new double[]{mean, sd});
        }

        // Min/max da coorte para as métricas de "acertos" de cada jogo.
        double[] acRange = minMax(baseline, "AC");
        double[] caRange = minMax(baseline, "CA");
        double[] ac3Range = minMax(baseline, "AC3");

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            double accG1 = accComponentAbsoluteTop((Double) r.get("AC"), acRange[0], GAME1_TOTAL_TRIALS);
            double otherG1 = averageScore(r, GAME1_OTHER_METRICS, GAME1_OTHER_LOWER_BETTER, stats) / 2.0;
            double Sinib = accG1 + otherG1;

            double accG2 = accComponentRelative((Double) r.get("CA"), caRange[0], caRange[1]);
            double otherG2 = averageScore(r, GAME2_OTHER_METRICS, GAME2_OTHER_LOWER_BETTER, stats) / 2.0;
            double Smem = accG2 + otherG2;

            double accG3 = accComponentRelative((Double) r.get("AC3"), ac3Range[0], ac3Range[1]);
            double otherG3 = averageScore(r, GAME3_OTHER_METRICS, GAME3_OTHER_LOWER_BETTER, stats) / 2.0;
            double Sflex = accG3 + otherG3;

            // Regra especial do Jogo 2: taxa de acerto 0% (a criança não completou nenhuma
            // sequência corretamente) zera a nota final de memória de trabalho, independente
            // do resultado das demais métricas.
            Double taxaAcerto = (Double) r.get("TA");
            if (taxaAcerto != null && taxaAcerto == 0.0) {
                Smem = 0.0;
            }

            String classInib = classify(Sinib);
            String classMem = classify(Smem);
            String classFlex = classify(Sflex);
            String classFinal = classifyMajority(classInib, classMem, classFlex);

            Map<String, Object> out = new LinkedHashMap<>(r);
            out.put("Sinib", round1(Sinib));
            out.put("Smem", round1(Smem));
            out.put("Sflex", round1(Sflex));
            out.put("classInib", classInib);
            out.put("classMem", classMem);
            out.put("classFlex", classFlex);
            out.put("classFinal", classFinal);
            out.put("inCohort", includedIds == null || includedIds.contains(r.get("id")));
            result.add(out);
        }

        applyRanking(result, "Sinib", "rankInib");
        applyRanking(result, "Smem", "rankMem");
        applyRanking(result, "Sflex", "rankFlex");
        for (Map<String, Object> out : result) {
            out.put("totalParticipants", result.size());
        }

        return result;
    }

    /**
     * Calcula a posição (1º, 2º, ...) de cada participante na turma para uma
     * dada função executiva, do maior para o menor escore. Empates recebem a
     * mesma posição (ranking "olímpico" padrão).
     */
    private static void applyRanking(List<Map<String, Object>> result, String scoreField, String rankField) {
        List<Map<String, Object>> sorted = new ArrayList<>(result);
        sorted.sort((a, b) -> Double.compare((Double) b.get(scoreField), (Double) a.get(scoreField)));
        int rank = 0;
        double lastScore = Double.NaN;
        for (int i = 0; i < sorted.size(); i++) {
            double score = (Double) sorted.get(i).get(scoreField);
            if (i == 0 || score != lastScore) rank = i + 1;
            sorted.get(i).put(rankField, rank);
            lastScore = score;
        }
    }

    private static double[] minMax(List<Map<String, Object>> baseline, String metric) {
        double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
        for (Map<String, Object> r : baseline) {
            double v = (Double) r.get(metric);
            if (v < min) min = v;
            if (v > max) max = v;
        }
        return new double[]{min, max};
    }

    /**
     * Metade "acertos" com âncora ABSOLUTA no topo (usada no Jogo 1): 0 pontos
     * para quem tem o menor número de acertos da turma; 50 pontos (nota
     * máxima dessa metade) SOMENTE para quem acerta o total de rodadas
     * (desempenho perfeito) — não apenas o melhor da turma.
     */
    private static double accComponentAbsoluteTop(double acertos, double minAcertosCohort, double totalPossivel) {
        double denom = totalPossivel - minAcertosCohort;
        if (denom <= 0) return 50.0; // todo mundo (inclusive o pior) já acertou tudo
        double v = 50.0 * (acertos - minAcertosCohort) / denom;
        return clamp(v, 0.0, 50.0);
    }

    /**
     * Metade "acertos" com âncoras RELATIVAS à turma (usada nos Jogos 2 e 3):
     * 0 pontos para quem tem o menor número de acertos da turma; 50 pontos
     * para quem tem o maior número de acertos da turma.
     */
    private static double accComponentRelative(double acertos, double minCohort, double maxCohort) {
        double denom = maxCohort - minCohort;
        if (denom <= 0) return 50.0; // toda a turma empatada — sem variação a normalizar
        double v = 50.0 * (acertos - minCohort) / denom;
        return clamp(v, 0.0, 50.0);
    }

    private static double averageScore(Map<String, Object> row, String[] metrics, boolean[] lowerBetter, Map<String, double[]> stats) {
        double sum = 0;
        for (int i = 0; i < metrics.length; i++) {
            double v = (Double) row.get(metrics[i]);
            double[] ms = stats.get(metrics[i]);
            sum += zScoreNormalize(v, ms[0], ms[1], lowerBetter[i]);
        }
        return sum / metrics.length;
    }

    /**
     * Normalização por escore-z, convertida para escala T (média=50, DP=15):
     * z = (valor - média) / desvio-padrão (invertido se "menor é melhor");
     * escala T = 50 + 15*z, limitada entre 0 e 100.
     * Quando o desvio-padrão é 0 (todo mundo teve o mesmo valor), não há
     * variação a normalizar — todos recebem a nota-base 50 (Mediano).
     */
    private static double zScoreNormalize(double value, double mean, double sd, boolean lowerBetter) {
        if (sd == 0) return 50.0;
        double z = (value - mean) / sd;
        if (lowerBetter) z = -z;
        double score = 50.0 + z * 15.0;
        return clamp(score, 0.0, 100.0);
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /**
     * Classificação por função, na escala 0-100 (soma das duas metades de
     * 50 pontos), com os limites em Abaixo da Média (< 35), Mediano
     * (35 a 65), Acima da Média (> 65).
     */
    public static String classify(double score) {
        if (score < 35.0) return "abaixo";
        if (score <= 65.0) return "mediano";
        return "acima";
    }

    /** Classificação final = maioria entre as 3 classificações por função. Empate (1-1-1) => Mediano. */
    public static String classifyMajority(String c1, String c2, String c3) {
        Map<String, Integer> counts = new HashMap<>();
        counts.merge(c1, 1, Integer::sum);
        counts.merge(c2, 1, Integer::sum);
        counts.merge(c3, 1, Integer::sum);
        if (counts.getOrDefault("acima", 0) >= 2) return "acima";
        if (counts.getOrDefault("abaixo", 0) >= 2) return "abaixo";
        if (counts.getOrDefault("mediano", 0) >= 2) return "mediano";
        return "mediano";
    }

    private static String[] allOtherMetrics() {
        List<String> all = new ArrayList<>();
        all.addAll(Arrays.asList(GAME1_OTHER_METRICS));
        all.addAll(Arrays.asList(GAME2_OTHER_METRICS));
        all.addAll(Arrays.asList(GAME3_OTHER_METRICS));
        return all.toArray(new String[0]);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>();
    }

    private static Double num(Object o) {
        if (o == null) return 0.0;
        if (o instanceof Number) return ((Number) o).doubleValue();
        try { return Double.parseDouble(o.toString()); } catch (Exception e) { return 0.0; }
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
